import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeJudge, BaselineJudge, parseAnswers, questions } from '../src/judge.mjs';
const efforts = ['low', 'medium', 'high'];
const valid = () => ({ answers: { effort: { choice: 'medium', confidence: 0.8 }, lease: { choice: '2', confidence: 0.7 } }, usage: { input_tokens: 12 } });
const input = { state: { latestUser: '继续', task: '测试任务' }, model: 'synthetic-model', supportedEfforts: efforts, baseline: 'high', maxLease: 4 };

test('typed contract offers only supported efforts, not model routing', () => {
  const q = questions(efforts, 4); assert.deepEqual(Object.keys(q), ['effort', 'lease']);
  assert.deepEqual(Object.keys(q.effort.criteria), efforts); assert.equal(Object.keys(q.lease.criteria).length, 4);
});
test('valid response parses typed choices and reports conservative diagnostic confidence', () => {
  assert.deepEqual(parseAnswers(valid(), efforts, 4), { effort: 'medium', lease: 2, confidence: 0.7, judgeInputTokens: 12 });
});
for (const [name, mutate] of [
  ['unsupported effort', p => p.answers.effort.choice = 'max'],
  ['unbounded lease', p => p.answers.lease.choice = '20'],
  ['numeric not string choice', p => p.answers.lease.choice = 2],
  ['missing question', p => delete p.answers.effort],
  ['incomplete distribution', p => p.answers.effort.probabilities = { low: 0.5, medium: 0.5 }],
  ['invalid sum', p => p.answers.effort.probabilities = { low: 0.3, medium: 0.4, high: 0.1 }],
  ['contradictory winner', p => p.answers.effort.probabilities = { low: 0.7, medium: 0.2, high: 0.1 }],
]) test('rejects ' + name, () => { const p = valid(); mutate(p); assert.throws(() => parseAnswers(p, efforts, 4)); });
test('invalid confidence is unknown, not a success rate', () => {
  const p = valid(); p.answers.effort.confidence = 9; p.answers.lease.confidence = true;
  assert.equal(parseAnswers(p, efforts, 4).confidence, null);
});
test('TypeSafe request uses dedicated key and bounded state through fixed endpoint', async () => {
  let observed;
  const j = new TypeSafeJudge({ apiKey: 'synthetic-only-jev-key', fetchImpl: async (url, req) => {
    observed = { url, req }; return new Response(JSON.stringify(valid()), { status: 200 });
  } });
  const answer = await j.evaluate(input);
  assert.equal(observed.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(observed.req.headers.authorization, 'Bearer synthetic-only-jev-key');
  assert.equal(observed.req.redirect, 'error');
  const payload = JSON.parse(observed.req.body);
  assert.equal(payload.state.latestUser, '继续'); assert.equal(payload.state.executingModel, input.model);
  assert.equal(answer.effort, 'medium'); assert(!observed.req.body.includes('synthetic-only-jev-key'));
});
for (const status of [401, 402, 429, 500]) test('Jev HTTP ' + status + ' has no retry or body echo', async () => {
  let calls = 0; const j = new TypeSafeJudge({ apiKey: 'synthetic', fetchImpl: async () => { ++calls; return new Response('PRIVATE UPSTREAM ERROR', { status }); } });
  await assert.rejects(j.evaluate(input), e => e.code === `judge_http_${status}` && !e.message.includes('PRIVATE'));
  assert.equal(calls, 1);
});
test('oversized evaluator response rejected', async () => {
  const j = new TypeSafeJudge({ apiKey: 'synthetic', fetchImpl: async () => new Response('a'.repeat(70000)) });
  await assert.rejects(j.evaluate(input), e => e.code === 'judge_response_too_large');
});
test('invalid evaluator JSON rejected', async () => {
  const j = new TypeSafeJudge({ apiKey: 'synthetic', fetchImpl: async () => new Response('not json') });
  await assert.rejects(j.evaluate(input), e => e.code === 'judge_invalid_json');
});
test('cancelled evaluation never contacts provider', async () => {
  let calls = 0; const j = new TypeSafeJudge({ apiKey: 'synthetic', fetchImpl: async () => { ++calls; } });
  await assert.rejects(j.evaluate(input, { signal: AbortSignal.abort() })); assert.equal(calls, 0);
});
test('baseline judge is explicitly not adaptive', async () => {
  const result = await new BaselineJudge().evaluate(input); assert.equal(result.effort, 'high'); assert.equal(result.lease, 1);
});
test('missing separate Jev key refuses live evaluator construction', () => assert.throws(() => new TypeSafeJudge({ apiKey: '' })));
