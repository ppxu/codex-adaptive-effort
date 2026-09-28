import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { channel } from 'node:diagnostics_channel';
import { judgeTiming } from '../src/judge-timing.mjs';
import { TypeSafeJudge } from '../src/judge.mjs';
import { Controller } from '../src/controller.mjs';
import { config, body } from './helpers.mjs';

const input = { state: { latestUser: '合成测试' }, model: 'synthetic-model', supportedEfforts: ['low', 'medium', 'high'], baseline: 'medium', maxLease: 4 };
const answer = JSON.stringify({ answers: { effort: { choice: 'high' }, lease: { choice: '1' } } });
async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('native fetch milestones isolate simultaneous requests and exclude unrelated HTTP traffic', async t => {
  const url = await localServer(t, (req, res) => {
    req.resume(); req.on('end', () => {
      const timer = setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders();
        const bodyTimer = setTimeout(() => res.end(answer), 20);
        res.once('close', () => clearTimeout(bodyTimer));
      }, req.url === '/slow' ? 100 : 10);
      res.once('close', () => clearTimeout(timer));
    });
  });
  const results = {};
  async function evaluate(path) {
    const judge = new TypeSafeJudge({ apiKey: 'synthetic-only', fetchImpl: (_endpoint, opts) => fetch(url + path, opts) });
    const value = await judge.evaluate(input, { onTiming: d => { results[path] = d; } });
    assert.equal(value.effort, 'high');
  }
  await Promise.all([evaluate('/slow'), evaluate('/fast'), fetch(url + '/unrelated').then(r => r.text())]);
  for (const data of Object.values(results)) {
    assert.equal(data.judgeStage, 'completed');
    const marks = [data.judgeRequestCreatedMs, data.judgeSendStartMs, data.judgeRequestSentMs,
      data.judgeResponseHeadersMs, data.judgeResponseBodyMs, data.judgeValidatedMs, data.judgeObservedMs];
    assert(marks.every(v => typeof v === 'number' && v >= 0));
    assert(marks.every((v, i) => i === 0 || v >= marks[i - 1]));
    assert(data.judgeResponseBodyMs > data.judgeResponseHeadersMs);
    assert(!JSON.stringify(data).includes('synthetic-only'));
  }
  assert(results['/slow'].judgeResponseHeadersMs > results['/fast'].judgeResponseHeadersMs);
});
for (const phase of ['headers', 'body']) test('controller timeout keeps last observed ' + phase + ' stage and fallback unchanged', async t => {
  const url = await localServer(t, (req, res) => {
    req.resume();
    if (phase === 'body') { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); res.write('{'); }
  });
  const cfg = config({ mode: 'shadow' }); cfg.judge = { ...cfg.judge, kind: 'typesafe', timeoutMs: 150 };
  const events = [], snapshots = [];
  const judge = new TypeSafeJudge({ apiKey: 'synthetic-only', fetchImpl: (_url, opts) => fetch(url, opts) });
  const c = new Controller(cfg, { evaluate: (value, options) => judge.evaluate(value, {
    ...options, onTiming: data => { snapshots.push(data); options.onTiming(data); },
  }) }, { emit: e => events.push(e) });
  const incoming = body(), tx = await c.prepare(incoming);
  assert.equal(tx.source, 'fallback'); assert.equal(tx.reason, 'judge_timeout');
  assert.equal(tx.body, incoming); assert.equal(tx.changed, false); c.finish(tx);
  const finished = events.find(e => e.event === 'judge_finished');
  assert.equal(finished.judgeStage, phase === 'headers' ? 'waiting_headers' : 'reading_body');
  assert.equal(finished.judgeResponseBodyMs, null); assert.equal(finished.judgeValidatedMs, null);
  if (phase === 'headers') assert.equal(finished.judgeResponseHeadersMs, null);
  else assert.equal(typeof finished.judgeResponseHeadersMs, 'number');
  const count = snapshots.length;
  await new Promise(r => setTimeout(r, 30)); assert.equal(snapshots.length, count);
});
test('abort removes all subscriptions immediately, ignores late signals and concurrent unrelated requests', () => {
  const names = ['undici:request:create', 'undici:client:sendHeaders', 'undici:request:bodySent', 'undici:request:headers'];
  const before = names.map(n => channel(n).hasSubscribers), abort = new AbortController(), snapshots = [];
  const timing = judgeTiming({ signal: abort.signal, onTiming: d => snapshots.push(d) });
  const request = { headers: 'SECRET HEADER', body: 'PRIVATE TEXT' };
  channel(names[0]).publish({ request }); // outside tracked async context
  assert.equal(snapshots.at(-1).judgeStage, 'started');
  timing.run(() => channel(names[0]).publish({ request }));
  assert.equal(snapshots.at(-1).judgeStage, 'created');
  abort.abort(); const count = snapshots.length;
  channel(names[1]).publish({ request }); timing.mark('completed', 'judgeValidatedMs'); timing.stop();
  assert.equal(snapshots.length, count); assert.deepEqual(names.map(n => channel(n).hasSubscribers), before);
  assert(!JSON.stringify(snapshots).includes('SECRET')); assert(!JSON.stringify(snapshots).includes('PRIVATE'));
});
test('missing diagnostics stay unknown and telemetry callback failures cannot change successful answers', async () => {
  let snapshot;
  const judge = new TypeSafeJudge({ apiKey: 'synthetic-only', fetchImpl: async () => new Response(answer) });
  await judge.evaluate(input, { onTiming: d => snapshot = d });
  assert.equal(snapshot.judgeSendStartMs, null); assert.equal(snapshot.judgeRequestSentMs, null);
  assert.equal(snapshot.judgeStage, 'completed');
  assert.equal((await judge.evaluate(input, { onTiming: () => { throw new Error('diagnostic failure'); } })).effort, 'high');
});
test('HTTP and JSON errors preserve observed stage without echoing provider bodies', async () => {
  for (const [status, code, stage] of [[429, 'judge_http_429', 'reading_body'], [200, 'judge_invalid_json', 'validating']]) {
    let snapshot;
    const judge = new TypeSafeJudge({ apiKey: 'synthetic-only', fetchImpl: async () => new Response('PRIVATE PROVIDER BODY', { status }) });
    await assert.rejects(judge.evaluate(input, { onTiming: d => snapshot = d }), e => e.code === code);
    assert.equal(snapshot.judgeStage, stage); assert.equal(snapshot.judgeValidatedMs, null);
    assert(!JSON.stringify(snapshot).includes('PRIVATE'));
  }
});
