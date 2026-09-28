import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { shadowPlan, previewPlan, runShadow } from '../scripts/jev-shadow.mjs';

const capability = (model = 'operator-fixture') => ({ source: 'test fixture only', models: [
  { model, supportedEfforts: ['low', 'medium', 'high'], baseline: 'medium' },
] });
const plan = () => shadowPlan(capability(), 'operator-fixture');
function mock() {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ model: 'jev-fixture', usage: { input_tokens: 20, output_tokens: 5 },
      answers: { effort: { choice: 'low' }, lease: { choice: '4' } } }));
  } };
}
test('preview freezes eight exact requests and two deterministic bypasses using supplied capabilities', () => {
  const p = plan(), preview = previewPlan(p);
  assert.equal(preview.cases.filter(c => c.request).length, 8);
  assert.equal(preview.cases.filter(c => c.bypass).length, 2);
  assert.equal(preview.executorCalls, 0); assert.equal(preview.mode, 'shadow');
  assert.equal(preview.planHash, plan().planHash);
  assert(!('config' in preview)); assert(!('preparedCases' in preview));
  const requests = preview.cases.filter(c => c.request);
  for (const { request } of requests) assert.deepEqual(Object.keys(request.questions.effort.criteria), ['low', 'medium', 'high']);
  assert.equal(requests.find(c => c.id === 'tool-failure').request.state.recentTools[0].failed, true);
  assert.equal(requests.find(c => c.id === 'continue-complex').request.state.latestUser, '继续');
  const changed = capability(); changed.models[0].supportedEfforts.push('ultra');
  assert.notEqual(shadowPlan(changed, 'operator-fixture').planHash, p.planHash);
  assert.throws(() => shadowPlan(capability(), 'absent'), /model_missing_from_capabilities/);
});
test('live gates refuse missing opt-in, changed plan, synthetic executor and missing key before fetch', async () => {
  const p = plan(), fake = mock();
  const options = { enabled: true, approvedPlan: p.planHash, apiKey: 'fixture', fetchImpl: fake.fetchImpl };
  await assert.rejects(runShadow(p, { ...options, enabled: false }), /explicit_enable_jev_required/);
  await assert.rejects(runShadow(p, { ...options, approvedPlan: 'old-hash' }), /approved_plan_mismatch/);
  await assert.rejects(runShadow(p, { ...options, apiKey: '' }), /missing_typesafe_key/);
  const synthetic = shadowPlan(capability('synthetic-model'), 'synthetic-model');
  await assert.rejects(runShadow(synthetic, { ...options, approvedPlan: synthetic.planHash }), /synthetic_model_refused/);
  assert.equal(fake.calls.length, 0);
});
test('shadow exercises real adapter and controller, sends previewed bodies and never modifies incoming effort', async () => {
  const p = plan(), fake = mock();
  const report = await runShadow(p, { enabled: true, approvedPlan: p.planHash, apiKey: 'fixture', fetchImpl: fake.fetchImpl });
  assert.equal(report.complete, true); assert.equal(report.judgeCalls, 8); assert.equal(report.executorCalls, 0);
  assert.equal(fake.calls.length, 8);
  assert.deepEqual(fake.calls.map(c => c.body), previewPlan(p).cases.filter(c => c.request).map(c => c.request));
  assert(fake.calls.every(c => c.url === 'https://api.typesafe.ai/v1/systemone'));
  assert(report.rows.every(r => r.unchanged && r.incomingEffort === 'medium'));
  assert(report.rows.slice(0, 8).every(r => r.proposedEffort === 'low' && r.reportedJudgeModel === 'jev-fixture'));
  assert(report.rows.slice(0, 8).every(r => r.judgeStage === 'completed' && r.judgeSendStartMs === null));
  assert(report.rows.slice(8).every(r => !('judgeStage' in r)));
  assert.equal(report.semanticReview, 'pending; fixture hypotheses are not accuracy labels');
});
test('first provider failure stops suite without retry, body echo or invented zero usage', async () => {
  let calls = 0; const p = plan();
  const report = await runShadow(p, { enabled: true, approvedPlan: p.planHash, apiKey: 'fixture',
    fetchImpl: async () => { ++calls; return new Response('PRIVATE ERROR BODY', { status: 429 }); } });
  assert.equal(calls, 1); assert.equal(report.complete, false);
  assert.equal(report.rows[0].reason, 'judge_http_429'); assert.equal(report.rows[0].unchanged, true);
  assert.equal(report.rows[0].judgeInputTokens, null); assert(!JSON.stringify(report).includes('PRIVATE'));
});
test('production timeout aborts pending fetch and prevents later calls', async () => {
  let calls = 0, aborted = false; const p = plan();
  p.config.judge.timeoutMs = 50;
  const report = await runShadow(p, { enabled: true, approvedPlan: p.planHash, apiKey: 'fixture',
    fetchImpl: async (_url, { signal }) => {
      ++calls; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        aborted = true; reject(new Error('synthetic abort'));
      }, { once: true }));
    } });
  assert.equal(calls, 1); assert.equal(aborted, true); assert.equal(report.complete, false);
  assert.equal(report.rows[0].reason, 'judge_timeout');
  assert.equal(report.rows[0].judgeStage, 'started'); // Fake fetch has no native milestones.
  assert.equal(report.rows[0].judgeResponseHeadersMs, null);
});
test('cancelling an active evaluation records cancellation and stops remaining cases', async () => {
  let calls = 0; const p = plan(), abort = new AbortController();
  const report = await runShadow(p, { enabled: true, approvedPlan: p.planHash, apiKey: 'fixture', signal: abort.signal,
    fetchImpl: async (_url, { signal }) => {
      ++calls;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
        queueMicrotask(() => abort.abort());
      });
    } });
  assert.equal(calls, 1); assert.equal(report.complete, false);
  assert.equal(report.rows[0].reason, 'cancelled');
});
test('CLI errors reveal no paths, supplied credentials or raw file errors', () => {
  const r = spawnSync(process.execPath, ['scripts/jev-shadow.mjs', '--capabilities', '/nonexistent/private-fixture.json', '--model', 'operator-fixture'], { encoding: 'utf8' });
  assert.equal(r.status, 1); assert.equal(r.stderr.trim(), 'shadow_experiment_failed');
  assert.equal(r.stdout, '');
});
