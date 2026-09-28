import { openSync, writeSync, closeSync, constants, fchmodSync } from 'node:fs';
import { CaeError, knownNumber, isObject } from './util.mjs';

const FIELDS = new Set(['event', 'requestId', 'model', 'mode', 'effort', 'source', 'reason', 'revision',
  'proposedEffort', 'incomingEffort', 'changed', 'lease', 'confidence', 'judgeMs', 'judgeInputTokens',
  'judgeKind', 'stateChars', 'httpStatus', 'terminal', 'inputTokens', 'cachedInputTokens', 'outputTokens',
  'reasoningTokens', 'durationMs', 'completed']);
export class Audit {
  constructor(path) {
    this.failed = false;
    try {
      this.fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0), 0o600);
      if (process.platform !== 'win32') fchmodSync(this.fd, 0o600);
    } catch { throw new CaeError('cannot_open_audit_log'); }
  }
  emit(record) {
    const clean = { schema: 1, time: new Date().toISOString() };
    for (const [key, value] of Object.entries(record)) {
      if (!FIELDS.has(key)) continue;
      if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) clean[key] = value;
      else if (typeof value === 'string' && value.length < 200) clean[key] = value;
    }
    try { writeSync(this.fd, JSON.stringify(clean) + '\n'); }
    catch { this.failed = true; } // Do not interrupt a model stream for a logging failure.
  }
  close() { if (this.fd !== undefined) { closeSync(this.fd); this.fd = undefined; } }
}
export function usageOf(response) {
  const u = response?.usage;
  return { inputTokens: knownNumber(u?.input_tokens), cachedInputTokens: knownNumber(u?.input_tokens_details?.cached_tokens),
    outputTokens: knownNumber(u?.output_tokens), reasoningTokens: knownNumber(u?.output_tokens_details?.reasoning_tokens) };
}
export function report(records) {
  records = records.filter(isObject);
  const outcomes = records.filter(r => r.event === 'upstream_outcome');
  const decisions = records.filter(r => r.event === 'decision');
  const summary = {
    decisions: decisions.length, requests: outcomes.length,
    completed: outcomes.filter(r => r.completed).length,
    changedRequests: records.filter(r => r.event === 'request_sent' && r.changed).length,
    sources: {}, tokenObservations: {}, measuredSavings: null,
    note: 'Observed usage only. Reasoning tokens are a subset of output tokens; do not add them again. Missing is not zero. Shadow traffic still uses the original effort. No counterfactual or quality equivalence is established.',
  };
  for (const r of decisions) summary.sources[r.source] = (summary.sources[r.source] ?? 0) + 1;
  for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningTokens']) {
    const values = outcomes.map(r => knownNumber(r[key])).filter(v => v !== null);
    summary.tokenObservations[key] = { observedSum: values.length ? values.reduce((a, b) => a + b, 0) : null,
      knownRequests: values.length, unknownRequests: outcomes.length - values.length };
  }
  const judgeOutcomes = records.filter(r => r.event === 'judge_finished');
  const knownJudgeUsage = judgeOutcomes.map(r => knownNumber(r.judgeInputTokens)).filter(v => v !== null);
  summary.evaluator = {
    attempts: records.filter(r => r.event === 'judge_started').length,
    externalAttempts: records.filter(r => r.event === 'judge_started' && r.judgeKind === 'typesafe').length,
    observedInputTokens: knownJudgeUsage.length ? knownJudgeUsage.reduce((a, b) => a + b, 0) : null,
    unknownInputUsage: judgeOutcomes.length - knownJudgeUsage.length,
    observedDurationMs: judgeOutcomes.reduce((n, r) => n + (knownNumber(r.judgeMs) ?? 0), 0),
    note: 'Cancelled/timed-out evaluator calls may be billable even when usage is unknown. No dollar estimate.'
  };
  return summary;
}
