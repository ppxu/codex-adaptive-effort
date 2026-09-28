#!/usr/bin/env node
/** Fixed synthetic evaluator-only experiment. Never starts an executor or proxy. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { defaultConfig } from '../src/config.mjs';
import { inspectRequest } from '../src/context.mjs';
import { Controller } from '../src/controller.mjs';
import { TypeSafeJudge, judgeRequest } from '../src/judge.mjs';
import { CaeError, digest, checkAbort } from '../src/util.mjs';

const corpus = JSON.parse(readFileSync(new URL('../examples/jev-shadow-cases.json', import.meta.url), 'utf8'));
export function shadowPlan(capabilities, model) {
  const entry = capabilities?.models?.find(m => m.model === model);
  if (!entry) throw new CaeError('model_missing_from_capabilities');
  const config = defaultConfig(entry.model, entry.supportedEfforts, entry.baseline);
  config.judge = { ...config.judge, kind: 'typesafe', maxCalls: 8, timeoutMs: 1500 };
  const cases = corpus.cases.map(item => {
    const body = { model, reasoning: { effort: config.baseline }, input: item.input };
    const snapshot = inspectRequest(body);
    if (item.bypass ? snapshot.reason !== item.bypass : !snapshot.eligible) throw new CaeError('fixture_eligibility_changed');
    return { ...item, body, request: snapshot.eligible ? judgeRequest({ state: snapshot.state,
      model, supportedEfforts: config.supportedEfforts, baseline: config.baseline, maxLease: config.lease.maxGenerations }) : null };
  });
  if (cases.filter(c => c.request).length !== config.judge.maxCalls) throw new CaeError('fixture_call_count_changed');
  const contract = { corpusVersion: corpus.version, mode: 'shadow', endpoint: 'https://api.typesafe.ai/v1/systemone',
    maxCalls: config.judge.maxCalls, timeoutMs: config.judge.timeoutMs, retries: 0, executorCalls: 0,
    model, baseline: config.baseline, supportedEfforts: config.supportedEfforts,
    cases: cases.map(({ id, request, bypass, review }) => ({ id, request, bypass: bypass ?? null, review })) };
  return { ...contract, planHash: digest(contract), capabilityObservedAt: capabilities.observedAt ?? null,
    capabilitySource: capabilities.source ?? 'operator-supplied', config, preparedCases: cases };
}
export function previewPlan(plan) {
  const { config, preparedCases, ...preview } = plan;
  return preview;
}
export async function runShadow(plan, { enabled = false, approvedPlan, apiKey, signal, fetchImpl } = {}) {
  if (!enabled) throw new CaeError('explicit_enable_jev_required');
  if (approvedPlan !== plan.planHash) throw new CaeError('approved_plan_mismatch');
  if (plan.model === 'synthetic-model') throw new CaeError('synthetic_model_refused');
  checkAbort(signal);
  const judge = new TypeSafeJudge({ apiKey, fetchImpl });
  let lastAnswer, lastTiming;
  const controller = new Controller(plan.config, { async evaluate(input, options) {
    lastAnswer = await judge.evaluate(input, { ...options,
      onTiming: data => { lastTiming = data; options.onTiming?.(data); } }); return lastAnswer;
  } });
  const report = { schema: 1, startedAt: new Date().toISOString(), planHash: plan.planHash,
    mode: 'shadow', executorCalls: 0, requestedJudgeModel: plan.config.judge.model,
    model: plan.model, baseline: plan.baseline, supportedEfforts: plan.supportedEfforts,
    capabilityObservedAt: plan.capabilityObservedAt, timeoutMs: plan.timeoutMs,
    maxCalls: plan.maxCalls, retries: 0, complete: false, rows: [] };
  for (const item of plan.preparedCases) {
    lastAnswer = null; lastTiming = null;
    let tx;
    try {
      checkAbort(signal);
      const before = JSON.stringify(item.body);
      tx = await controller.prepare(item.body, { sessionKey: item.id, signal });
      const unchanged = !tx.changed && JSON.stringify(tx.body) === before && JSON.stringify(item.body) === before;
      const valid = unchanged && (item.bypass ? tx.source === 'bypass' && tx.reason === item.bypass : tx.source === 'judge');
      report.rows.push({ id: item.id, source: tx.source, reason: tx.reason, unchanged, ...lastTiming,
        incomingEffort: plan.baseline, proposedEffort: tx.effort, lease: tx.lease,
        confidence: tx.confidence ?? null, judgeMs: tx.judgeMs ?? null,
        judgeInputTokens: tx.judgeInputTokens ?? null, judgeOutputTokens: lastAnswer?.judgeOutputTokens ?? null,
        reportedJudgeModel: lastAnswer?.judgeModel ?? null, protocolPassed: valid, review: item.review });
      // Stop on first provider/protocol failure; never retry, and never call an executor.
      if (!valid) break;
    } catch (error) {
      report.rows.push({ id: item.id, protocolPassed: false,
        reason: error instanceof CaeError ? error.code : 'shadow_experiment_failed' });
      break;
    } finally { if (tx) controller.finish(tx); }
  }
  report.judgeCalls = controller.judgeCalls;
  report.complete = report.rows.length === plan.preparedCases.length && report.rows.every(r => r.protocolPassed);
  report.finishedAt = new Date().toISOString();
  report.semanticReview = 'pending; fixture hypotheses are not accuracy labels';
  return report;
}
async function main() {
  const { values } = parseArgs({ options: { capabilities: { type: 'string' }, model: { type: 'string' },
    'enable-jev': { type: 'boolean' }, 'approved-plan': { type: 'string' } } });
  if (!values.capabilities || !values.model) throw new CaeError('capabilities_and_model_required');
  const plan = shadowPlan(JSON.parse(readFileSync(values.capabilities, 'utf8')), values.model);
  if (!values['enable-jev']) { console.log(JSON.stringify(previewPlan(plan), null, 2)); return; }
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const report = await runShadow(plan, { enabled: true, approvedPlan: values['approved-plan'],
      apiKey: process.env.TYPESAFE_API_KEY, signal: abort.signal });
    console.log(JSON.stringify(report, null, 2));
    if (!report.complete) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof CaeError ? error.code : 'shadow_experiment_failed');
    process.exitCode = 1;
  });
}
