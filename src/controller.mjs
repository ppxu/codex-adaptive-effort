import { randomUUID } from 'node:crypto';
import { CaeError, isObject, bounded, checkAbort } from './util.mjs';
import { inspectRequest, canContinue } from './context.mjs';

/** A single owner per session. Only a completed upstream response commits a lease. */
export class Controller {
  constructor(config, judge, { now = Date.now, emit = () => {}, shadowOnly = false } = {}) {
    if (shadowOnly && !['off', 'shadow'].includes(config.mode)) throw new CaeError('shadow_only_control');
    this.shadowOnly = shadowOnly;
    this.config = config; this.judge = judge; this.now = now; this.emit = emit;
    this.mode = config.mode; this.lockedEffort = null; this.revision = 0;
    this.sessions = new Map(); this.active = new Map(); this.judgeCalls = 0;
    this.failures = 0; this.circuitUntil = 0;
  }
  status() {
    return { mode: this.mode, shadowOnly: this.shadowOnly, lockedEffort: this.lockedEffort, revision: this.revision,
      model: this.config.model, supportedEfforts: this.config.supportedEfforts,
      judgeKind: this.config.judge.kind, judgeCalls: this.judgeCalls,
      judgeCallLimit: this.config.judge.maxCalls, circuitOpen: this.now() < this.circuitUntil,
      retainedSessions: this.sessions.size, activeRequests: this.active.size };
  }
  control(patch) {
    if (!isObject(patch) || Object.keys(patch).some(k => !['mode', 'lockedEffort'].includes(k)) || !Object.keys(patch).length)
      throw new CaeError('invalid_control');
    if ('mode' in patch && !['off', 'shadow', 'auto'].includes(patch.mode)) throw new CaeError('invalid_mode');
    if ('lockedEffort' in patch && patch.lockedEffort !== null && !this.config.supportedEfforts.includes(patch.lockedEffort)) throw new CaeError('unsupported_lock');
    if (this.shadowOnly && (patch.mode === 'auto' || ('lockedEffort' in patch && patch.lockedEffort !== null)))
      throw new CaeError('shadow_only_control');
    if ('mode' in patch) this.mode = patch.mode;
    if ('lockedEffort' in patch) this.lockedEffort = patch.lockedEffort;
    ++this.revision; this.sessions.clear();
    this.emit({ event: 'control', mode: this.mode, effort: this.lockedEffort, revision: this.revision });
    return this.status();
  }
  prune() {
    for (const [key, value] of this.sessions) if (value.expires <= this.now()) this.sessions.delete(key);
    while (this.sessions.size > 128) this.sessions.delete(this.sessions.keys().next().value);
  }
  async prepare(body, { sessionKey = null, signal, id = randomUUID() } = {}) {
    checkAbort(signal); this.prune();
    const owner = sessionKey ?? id;
    if (this.active.has(owner)) throw new CaeError('concurrent_session_request', 409);
    this.active.set(owner, id);
    const revision = this.revision;
    const originalEffort = body.reasoning?.effort;
    const tx = { id, owner, sessionKey, revision, mode: this.mode, model: body.model,
      originalEffort, effort: originalEffort, body, changed: false, lease: 0,
      source: 'bypass', reason: null, finished: false, sent: false, snapshot: null };
    const bypass = reason => { tx.reason = reason; this.sessions.delete(owner); return tx; };
    try {
      if (this.mode === 'off') return bypass('mode_off');
      if (body.model !== this.config.model) return bypass('different_model');
      if (body.reasoning !== undefined && !isObject(body.reasoning)) return bypass('unsupported_reasoning_shape');
      if (originalEffort !== undefined && !this.config.supportedEfforts.includes(originalEffort)) return bypass('unsupported_incoming_effort');
      const snapshot = inspectRequest(body); tx.snapshot = snapshot;
      if (!snapshot.eligible) return bypass(snapshot.reason);
      let result;
      if (this.lockedEffort !== null) {
        result = { effort: this.lockedEffort, lease: 1 }; tx.source = 'manual';
      } else {
        const prev = sessionKey ? this.sessions.get(sessionKey) : null;
        if (prev && prev.remaining > 0 && prev.revision === revision && canContinue(prev.snapshot, snapshot)) {
          result = { effort: prev.effort, lease: prev.remaining }; tx.source = 'lease';
          tx.leaseDeadline = prev.expires;
        } else {
          this.sessions.delete(owner);
          const started = this.now();
          let attempted = false;
          const judgeAbort = new AbortController();
          const abort = () => judgeAbort.abort();
          signal?.addEventListener('abort', abort, { once: true });
          try {
            if (this.judgeCalls >= this.config.judge.maxCalls) throw new CaeError('judge_call_budget');
            if (this.now() < this.circuitUntil) throw new CaeError('judge_circuit_open');
            ++this.judgeCalls; attempted = true;
            this.emit({ event: 'judge_started', requestId: id, model: body.model, judgeKind: this.config.judge.kind });
            result = await bounded(this.judge.evaluate({
              state: snapshot.state, model: body.model, supportedEfforts: this.config.supportedEfforts,
              baseline: this.config.baseline, maxLease: this.config.lease.maxGenerations,
            }, { signal: judgeAbort.signal }), this.config.judge.timeoutMs, signal);
            if (!isObject(result) || !this.config.supportedEfforts.includes(result.effort) || !Number.isInteger(result.lease) || result.lease < 1 || result.lease > this.config.lease.maxGenerations)
              throw new CaeError('judge_invalid_decision');
            this.failures = 0; this.circuitUntil = 0; tx.source = 'judge';
          } catch (err) {
            checkAbort(signal);
            if (!(err instanceof CaeError)) err = new CaeError('judge_failure');
            if (!['judge_call_budget', 'judge_circuit_open'].includes(err.code)) {
              if (++this.failures >= 3) this.circuitUntil = this.now() + 30000;
            }
            // Never reuse an expired low lease after an error. Keep the caller's
            // explicit setting; only use configured baseline when it was absent.
            result = { effort: originalEffort ?? this.config.baseline, lease: 1 };
            tx.source = 'fallback'; tx.reason = err.code;
          } finally {
            judgeAbort.abort(); signal?.removeEventListener('abort', abort);
            tx.judgeMs = Math.max(0, this.now() - started);
            if (attempted) this.emit({ event: 'judge_finished', requestId: id, model: body.model,
              judgeKind: this.config.judge.kind, judgeMs: tx.judgeMs,
              judgeInputTokens: result?.judgeInputTokens ?? null,
              reason: signal?.aborted ? 'cancelled' : tx.reason });
          }
        }
      }
      checkAbort(signal);
      if (this.revision !== revision) return bypass('stale_control_revision');
      tx.effort = result.effort;
      tx.leaseDeadline ??= this.now() + this.config.lease.ttlMs;
      tx.lease = sessionKey ? result.lease : 1;
      tx.confidence = typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1 ? result.confidence : null;
      tx.judgeInputTokens = result.judgeInputTokens ?? null;
      if (this.mode === 'auto' && tx.effort !== originalEffort) {
        tx.body = { ...body, reasoning: { ...(body.reasoning ?? {}), effort: tx.effort } };
        tx.changed = true;
      }
      this.emit({ event: 'decision', requestId: id, model: body.model, mode: tx.mode,
        source: tx.source, reason: tx.reason, proposedEffort: tx.effort,
        incomingEffort: originalEffort ?? null, changed: tx.changed,
        lease: tx.lease, confidence: tx.confidence, judgeMs: tx.judgeMs ?? 0,
        judgeInputTokens: tx.judgeInputTokens, stateChars: snapshot.stateChars, revision });
      return tx;
    } catch (error) {
      this.active.delete(owner); this.sessions.delete(owner); throw error;
    }
  }
  /** Last synchronous check immediately before creating an upstream request. */
  beforeSend(tx) {
    if (tx.finished || this.active.get(tx.owner) !== tx.id) throw new CaeError('invalid_transaction');
    if (this.revision !== tx.revision) {
      // Restore the original request, never a stale proposed value.
      tx.changed = false; tx.body = null; tx.lease = 0; tx.reason = 'stale_control_revision';
    }
    tx.prepared = true;
    this.emit({ event: 'request_prepared', requestId: tx.id, model: tx.model,
      changed: tx.changed, effort: tx.changed ? tx.effort : tx.originalEffort ?? null, reason: tx.reason });
  }
  markSent(tx) {
    tx.sent = true;
    this.emit({ event: 'request_sent', requestId: tx.id, model: tx.model, changed: tx.changed,
      effort: tx.changed ? tx.effort : tx.originalEffort ?? null, reason: tx.reason });
  }
  finish(tx, { completed = false } = {}) {
    if (tx.finished) return;
    tx.finished = true;
    if (this.active.get(tx.owner) === tx.id) this.active.delete(tx.owner);
    if (completed && tx.sent && tx.sessionKey && tx.lease > 1 && tx.snapshot?.eligible &&
        this.revision === tx.revision && ['judge', 'lease'].includes(tx.source)) {
      this.sessions.set(tx.sessionKey, { snapshot: tx.snapshot, effort: tx.effort,
        remaining: tx.lease - 1, revision: tx.revision,
        expires: tx.leaseDeadline ?? this.now() + this.config.lease.ttlMs });
      this.prune();
    } else this.sessions.delete(tx.owner);
  }
}
