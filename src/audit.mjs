import { openSync, writeSync, closeSync, constants, fchmodSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { CaeError, knownNumber, isObject } from './util.mjs';

const FIELDS = new Set(['event', 'requestId', 'model', 'mode', 'effort', 'source', 'reason', 'revision',
  'proposedEffort', 'incomingEffort', 'changed', 'lease', 'confidence', 'judgeMs', 'judgeInputTokens',
  'judgeKind', 'stateChars', 'httpStatus', 'terminal', 'inputTokens', 'cachedInputTokens', 'outputTokens',
  'reasoningTokens', 'durationMs', 'completed']);
const TIMING_FIELDS = ['judgeRequestCreatedMs', 'judgeSendStartMs', 'judgeRequestSentMs',
  'judgeResponseHeadersMs', 'judgeResponseBodyMs', 'judgeValidatedMs', 'judgeObservedMs'];
const TIMING_STAGES = new Set(['started', 'created', 'sending', 'waiting_headers', 'reading_body', 'validating', 'completed']);
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
      if (TIMING_FIELDS.includes(key)) { clean[key] = knownNumber(value); continue; }
      if (key === 'judgeStage') { if (TIMING_STAGES.has(value)) clean[key] = value; continue; }
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
function reportAccumulator() {
  const tokenFields = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningTokens'];
  let judgeOutcomes = 0, knownJudgeUsage = 0;
  const summary = {
    decisions: 0, requests: 0, completed: 0, changedRequests: 0,
    sources: {}, tokenObservations: {}, measuredSavings: null,
    note: 'Observed usage only. Reasoning tokens are a subset of output tokens; do not add them again. Missing is not zero. Shadow traffic still uses the original effort. No counterfactual or quality equivalence is established.',
  };
  for (const key of tokenFields) summary.tokenObservations[key] = { observedSum: null, knownRequests: 0, unknownRequests: 0 };
  summary.evaluator = {
    attempts: 0, externalAttempts: 0, observedInputTokens: null, unknownInputUsage: 0, observedDurationMs: 0,
    note: 'Cancelled/timed-out evaluator calls may be billable even when usage is unknown. No dollar estimate.',
    timeoutStages: {},
  };
  return {
    add(r) {
      if (!isObject(r)) return;
      if (r.event === 'decision') {
        ++summary.decisions;
        const source = ['bypass', 'manual', 'lease', 'judge', 'fallback'].includes(r.source) ? r.source : 'unknown';
        summary.sources[source] = (summary.sources[source] ?? 0) + 1;
      }
      if (r.event === 'request_sent' && r.changed === true) ++summary.changedRequests;
      if (r.event === 'upstream_outcome') {
        ++summary.requests;
        if (r.completed === true) ++summary.completed;
        for (const key of tokenFields) {
          const value = knownNumber(r[key]), observation = summary.tokenObservations[key];
          if (value === null) ++observation.unknownRequests;
          else { ++observation.knownRequests; observation.observedSum = (observation.observedSum ?? 0) + value; }
        }
      }
      const evaluator = summary.evaluator;
      if (r.event === 'judge_started') {
        ++evaluator.attempts;
        if (r.judgeKind === 'typesafe') ++evaluator.externalAttempts;
      }
      if (r.event === 'judge_finished') {
        ++judgeOutcomes;
        const usage = knownNumber(r.judgeInputTokens);
        if (usage !== null) { ++knownJudgeUsage; evaluator.observedInputTokens = (evaluator.observedInputTokens ?? 0) + usage; }
        evaluator.observedDurationMs += knownNumber(r.judgeMs) ?? 0;
        if (r.reason === 'judge_timeout') {
          const stage = TIMING_STAGES.has(r.judgeStage) ? r.judgeStage : 'unknown';
          evaluator.timeoutStages[stage] = (evaluator.timeoutStages[stage] ?? 0) + 1;
        }
      }
    },
    finish() {
      // A crash can leave a started attempt without a finish record. Do not
      // silently erase its unknown usage; old finish-only captures still work.
      summary.evaluator.unknownInputUsage = Math.max(summary.evaluator.attempts, judgeOutcomes) - knownJudgeUsage;
      return summary;
    },
  };
}
export function report(records) {
  const accumulator = reportAccumulator();
  for (const row of records) accumulator.add(row);
  return accumulator.finish();
}
/** Fold the log incrementally instead of retaining every line and parsed record. */
export async function reportFile(path) {
  const source = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input: source, crlfDelay: Infinity });
  const accumulator = reportAccumulator(); let malformedLines = 0;
  try {
    for await (const line of lines) {
      if (!line) continue;
      try { accumulator.add(JSON.parse(line)); } catch { ++malformedLines; }
    }
  } catch { throw new CaeError('cannot_read_log'); }
  finally { lines.close(); source.destroy(); }
  return { ...accumulator.finish(), malformedLines };
}
