import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/controller.mjs';
import { config, fakeJudge, body, append } from './helpers.mjs';

function done(c, tx, completed = true) { c.beforeSend(tx); c.markSent(tx); c.finish(tx, { completed }); }
function setup(cfg = {}, judge = fakeJudge()) { return [new Controller(config(cfg), judge), judge]; }

test('auto modifies only reasoning.effort and does not mutate input', async () => {
  const [c] = setup(); const original = body(); const copy = structuredClone(original);
  const tx = await c.prepare(original); assert.equal(tx.changed, true); assert.equal(tx.body.reasoning.effort, 'low');
  const restored = structuredClone(tx.body); restored.reasoning.effort = 'high';
  assert.deepEqual(restored, original); assert.deepEqual(original, copy); done(c, tx);
});
test('shadow evaluates but forwards original object', async () => {
  const [c, j] = setup({ mode: 'shadow' }); const b = body(); const tx = await c.prepare(b);
  assert.equal(j.calls, 1); assert.equal(tx.changed, false); assert.equal(tx.body, b); assert.equal(tx.effort, 'low'); done(c, tx);
});
test('off never evaluates', async () => { const [c, j] = setup({ mode: 'off' }); const tx = await c.prepare(body()); assert.equal(j.calls, 0); assert.equal(tx.changed, false); done(c, tx); });
test('model change passes through without forcing pinned model', async () => {
  const [c, j] = setup(); const tx = await c.prepare(body({ model: 'another-model' }));
  assert.equal(tx.body.model, 'another-model'); assert.equal(j.calls, 0); done(c, tx);
});
test('unknown incoming effort bypasses', async () => {
  const [c, j] = setup(); const tx = await c.prepare(body({ reasoning: { effort: 'future' } }));
  assert.equal(tx.reason, 'unsupported_incoming_effort'); assert.equal(j.calls, 0); done(c, tx);
});
test('lease counts completed generations, including first', async () => {
  const [c, j] = setup(); let b = body();
  for (let i = 0; i < 4; ++i) { const tx = await c.prepare(b, { sessionKey: 'A' }); done(c, tx); b = append(b, { type: 'function_call_output', call_id: `call${i}`, output: 'ok' }); }
  assert.equal(j.calls, 2);
});
test('parallel tool results do not consume multiple generations', async () => {
  const [c, j] = setup(); const b = body(); done(c, await c.prepare(b, { sessionKey: 'A' }));
  let b2 = b; for (let i = 0; i < 4; ++i) b2 = append(b2, { type: 'function_call_output', output: 'ok', call_id: `c${i}` });
  const tx = await c.prepare(b2, { sessionKey: 'A' }); assert.equal(j.calls, 1); assert.equal(tx.lease, 2); done(c, tx);
});
test('missing identity forbids cross-call lease', async () => {
  const [c, j] = setup(); const b = body(); done(c, await c.prepare(b)); done(c, await c.prepare(append(b))); assert.equal(j.calls, 2);
});
test('same session cannot have two simultaneous owners', async () => {
  const [c] = setup(); const tx = await c.prepare(body(), { sessionKey: 'A' });
  await assert.rejects(c.prepare(body(), { sessionKey: 'A' }), /concurrent_session_request/); done(c, tx);
});
test('different sessions have isolated leases', async () => {
  const [c, j] = setup(); done(c, await c.prepare(body(), { sessionKey: 'A' }));
  done(c, await c.prepare(append(body()), { sessionKey: 'B' })); assert.equal(j.calls, 2);
});
for (const [name, transform] of [
  ['new user input', b => append(b, { role: 'user', content: '现在请排查偶发故障' })],
  ['history edit', b => ({ ...append(b), input: [{ role: 'user', content: 'changed' }] })],
  ['instructions change', b => append({ ...b, instructions: 'new constraints' })],
  ['tool definition change', b => append({ ...b, tools: [{ type: 'function', name: 'new-tool' }] })],
  ['explicit effort change', b => append({ ...b, reasoning: { effort: 'medium' } })],
  ['new structured tool failure', b => append(b, { type: 'function_call_output', output: '{"exit_code":1}' })],
]) test(`${name} invalidates prior lease`, async () => {
  const [c, j] = setup(); const b = body(); done(c, await c.prepare(b, { sessionKey: 'A' }));
  done(c, await c.prepare(transform(b), { sessionKey: 'A' })); assert.equal(j.calls, 2);
});
test('old tool failure alone does not force permanent reevaluation', async () => {
  const [c, j] = setup(); const b = append(body(), { type: 'function_call_output', output: '{"exit_code":1}' });
  done(c, await c.prepare(b, { sessionKey: 'A' })); done(c, await c.prepare(append(b), { sessionKey: 'A' })); assert.equal(j.calls, 1);
});
test('history rewind / duplicate payload cannot reuse a lease', async () => {
  const [c, j] = setup(); done(c, await c.prepare(body(), { sessionKey: 'A' }));
  done(c, await c.prepare(body(), { sessionKey: 'A' })); assert.equal(j.calls, 2);
});
test('lease expires from decision time, not last use', async () => {
  let now = 0; const j = fakeJudge(); const c = new Controller(config({ lease: { maxGenerations: 4, ttlMs: 100 } }), j, { now: () => now });
  const b = body(); const tx = await c.prepare(b, { sessionKey: 'A' }); now = 101; done(c, tx);
  done(c, await c.prepare(append(b), { sessionKey: 'A' })); assert.equal(j.calls, 2);
});
test('failed upstream does not commit lease', async () => {
  const [c, j] = setup(); done(c, await c.prepare(body(), { sessionKey: 'A' }), false);
  done(c, await c.prepare(append(body()), { sessionKey: 'A' })); assert.equal(j.calls, 2);
});
test('prepared-but-not-sent transaction cannot commit lease', async () => {
  const [c] = setup(); const tx = await c.prepare(body(), { sessionKey: 'A' }); c.beforeSend(tx); c.finish(tx, { completed: true }); assert.equal(c.sessions.size, 0);
});
test('manual lock suppresses judge and overrides effort in auto', async () => {
  const [c, j] = setup(); c.control({ lockedEffort: 'medium' }); const tx = await c.prepare(body());
  assert.equal(tx.body.reasoning.effort, 'medium'); assert.equal(j.calls, 0); done(c, tx);
});
test('invalid controls fail atomically', () => {
  const [c] = setup(); assert.throws(() => c.control({ mode: 'off', lockedEffort: 'future' }), /unsupported_lock/); assert.equal(c.mode, 'auto');
  assert.throws(() => c.control({ dangerous: true }), /invalid_control/);
});
test('control change after proposal prevents stale send', async () => {
  const [c] = setup(); const tx = await c.prepare(body()); c.control({ mode: 'off' });
  c.beforeSend(tx); assert.equal(tx.changed, false); assert.equal(tx.body, null); c.finish(tx);
});
test('control revision changed during judge causes bypass', async () => {
  let resolve; const c = new Controller(config(), { evaluate: () => new Promise(r => { resolve = r; }) });
  const pending = c.prepare(body()); c.control({ lockedEffort: 'high' }); resolve({ effort: 'low', lease: 3 });
  const tx = await pending; assert.equal(tx.changed, false); assert.equal(tx.reason, 'stale_control_revision'); done(c, tx);
});
test('cancelled judge never applies late result', async () => {
  let resolve; const [c] = setup({}, { evaluate: () => new Promise(r => { resolve = r; }) });
  const abort = new AbortController(); const promise = c.prepare(body(), { sessionKey: 'A', signal: abort.signal });
  abort.abort(); await assert.rejects(promise, /cancelled/); resolve({ effort: 'low', lease: 3 });
  assert.equal(c.active.size, 0); assert.equal(c.sessions.size, 0);
});
test('timeout preserves explicit incoming effort', async () => {
  const cfg = config(); cfg.judge.timeoutMs = 50;
  const c = new Controller(cfg, { evaluate: () => new Promise(() => {}) });
  const tx = await c.prepare(body()); assert.equal(tx.source, 'fallback'); assert.equal(tx.effort, 'high'); assert.equal(tx.changed, false); done(c, tx);
});
for (const result of [{ effort: 'unsupported', lease: 1 }, { effort: 'low', lease: 100 }, { effort: 'low', lease: true }, null])
  test(`invalid judge result safely falls back: ${JSON.stringify(result)}`, async () => {
    const [c] = setup({}, { evaluate: async () => result }); const tx = await c.prepare(body()); assert.equal(tx.source, 'fallback'); assert.equal(tx.changed, false); done(c, tx);
  });
test('call budget prevents additional judge requests without downgrading', async () => {
  const cfg = config(); cfg.judge.maxCalls = 1; const j = fakeJudge(); const c = new Controller(cfg, j);
  done(c, await c.prepare(body())); const tx = await c.prepare(body()); assert.equal(j.calls, 1); assert.equal(tx.reason, 'judge_call_budget'); assert.equal(tx.effort, 'high'); done(c, tx);
});
test('three judge failures open circuit; recovery retries after cooldown', async () => {
  let now = 0, calls = 0; const c = new Controller(config(), { async evaluate() { ++calls; throw new Error('private upstream detail'); } }, { now: () => now });
  for (let i = 0; i < 4; ++i) done(c, await c.prepare(body())); assert.equal(calls, 3);
  now = 30001; done(c, await c.prepare(body())); assert.equal(calls, 4);
});
test('completed shadow decisions can reuse a shadow lease without rewriting', async () => {
  const [c, j] = setup({ mode: 'shadow' }); done(c, await c.prepare(body(), { sessionKey: 'A' }));
  const tx = await c.prepare(append(body()), { sessionKey: 'A' }); assert.equal(tx.changed, false); assert.equal(j.calls, 1); done(c, tx);
});
