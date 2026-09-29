import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { harness, body, append, fakeJudge, completedSse, eventually, sleep, config } from './helpers.mjs';
import { startProxy, forwardedHeaders } from '../src/proxy.mjs';

async function consume(res) { return Buffer.from(await res.arrayBuffer()); }
test('status and off controls remain available when all forwarding slots are occupied', { timeout: 10000 }, async t => {
  const h = await harness(t, { cfg: { mode: 'off' }, handler: (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': waiting\n\n');
  } });
  const responses = await Promise.all(Array.from({ length: 64 }, (_, i) =>
    h.request(body(), { headers: { session_id: `synthetic-${i}` } })));
  t.after(() => Promise.all(responses.map(r => r.body.cancel().catch(() => {}))));
  const rejected = await h.request(); assert.equal(rejected.status, 429); await rejected.text();
  const health = await fetch(h.base + '/health', { headers: h.headers });
  assert.equal(health.status, 200); assert.equal((await health.json()).activeRequests, 64);
  const control = await fetch(h.base + '/control', { method: 'POST', headers: h.headers, body: '{"mode":"off"}' });
  assert.equal(control.status, 200); assert.equal((await control.json()).mode, 'off');
});
test('shadow-only HTTP proxy preserves request and SSE bytes after rejecting an auto control', async t => {
  const h = await harness(t, { cfg: { mode: 'shadow' }, shadowOnly: true });
  const rejected = await fetch(h.base + '/control', { method: 'POST', headers: h.headers, body: JSON.stringify({ mode: 'auto' }) });
  assert.equal(rejected.status, 400); assert.equal((await rejected.json()).error.code, 'shadow_only_control');
  const bytes = '  ' + JSON.stringify(body(), null, 2) + '\n';
  const response = await h.request(bytes);
  assert.deepEqual(await consume(response), completedSse());
  assert.equal(h.records[0].bytes.toString(), bytes);
  assert.equal(h.judge.calls, 1);
  assert.equal(h.events.find(e => e.event === 'decision').proposedEffort, 'low');
  assert(h.events.filter(e => e.event === 'request_sent').every(e => !e.changed));
});
test('real loopback auto request changes effort only; SSE bytes are identical', async t => {
  const h = await harness(t); const b = body(); const res = await h.request(b);
  assert.equal(res.status, 200); assert.deepEqual(await consume(res), completedSse());
  const received = JSON.parse(h.records[0].bytes); assert.equal(received.reasoning.effort, 'low');
  received.reasoning.effort = 'high'; assert.deepEqual(received, b);
  await eventually(() => h.events.some(e => e.event === 'upstream_outcome'));
  const out = h.events.find(e => e.event === 'upstream_outcome'); assert.equal(out.inputTokens, 100); assert.equal(out.reasoningTokens, 8);
  assert.equal(out.completed, true); assert.equal(h.records.length, 1);
});
for (const ending of ['\r', '\n', '\r\n']) test(`SSE ${JSON.stringify(ending)} metadata parsing preserves upstream BOM and bytes`, async t => {
  const bytes = Buffer.from('\uFEFF' + completedSse().toString('utf8').replaceAll('\r\n', ending));
  const h = await harness(t, { handler: (_req, res) => {
    res.writeHead(200, { 'content-type': 'Text/Event-Stream; charset=utf-8' });
    for (let i = 0; i < bytes.length; i += 7) res.write(bytes.subarray(i, i + 7));
    res.end();
  } });
  assert.deepEqual(await consume(await h.request()), bytes);
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, true); assert.equal(h.events.at(-1).outputTokens, 20);
});
test('stream request observes headerless SSE without changing bytes or response headers', async t => {
  const h = await harness(t, { handler: (_req, res) => {
    res.writeHead(200); res.end(completedSse());
  } });
  const b = body(), response = await h.request(b);
  assert.equal(response.headers.get('content-type'), null);
  assert.deepEqual(await consume(response), completedSse());
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, true);
  assert.equal(h.events.at(-1).inputTokens, 100);
  await consume(await h.request(append(b)));
  assert.equal(h.judge.calls, 1);
});
test('headerless SSE still requires a valid terminal and explicit stream request', async t => {
  const h = await harness(t, { handler: (_req, res, _record, hit) => {
    res.writeHead(200);
    res.end(hit === 1 ? 'data: [DONE]\n\n' : completedSse());
  } });
  await consume(await h.request());
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, false);
  assert.equal(h.proxy.controller.sessions.size, 0);
  await consume(await h.request(body({ stream: false })));
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, false);
  assert.equal(h.proxy.controller.sessions.size, 0);
});
test('explicit JSON content type takes precedence over requested streaming', async t => {
  const bytes = JSON.stringify({ id: 'synthetic-json', status: 'completed', usage: { output_tokens: 3 } });
  const h = await harness(t, { handler: (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(bytes);
  } });
  assert.equal(await (await h.request()).text(), bytes);
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, true);
  assert.equal(h.events.at(-1).outputTokens, 3);
});
test('non-object SSE frames pass through byte-for-byte without losing a later completion', async t => {
  const bytes = Buffer.concat([Buffer.from('data: null\n\ndata: []\n\n'), completedSse()]);
  const h = await harness(t, { handler: (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(bytes);
  } });
  const b = body(); assert.deepEqual(await consume(await h.request(b)), bytes);
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, true);
  await consume(await h.request(append(b))); assert.equal(h.judge.calls, 1);
});
test('JSON completed status without identity cannot establish a reusable lease', async t => {
  const bytes = JSON.stringify({ status: 'completed', usage: { output_tokens: 3 } });
  const h = await harness(t, { handler: (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(bytes);
  } });
  const b = body(); assert.equal(await (await h.request(b)).text(), bytes);
  await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.events.at(-1).completed, false); assert.equal(h.proxy.controller.sessions.size, 0);
  await consume(await h.request(append(b))); assert.equal(h.judge.calls, 2);
});
test('unknown history bypass retains original bytes and never calls the evaluator, including manual lock', async t => {
  const h = await harness(t);
  const b = append(body(), { type: 'future_evidence', data: 'synthetic' });
  const bytes = '  ' + JSON.stringify(b, null, 2) + '\n';
  for (const lockedEffort of [null, 'low']) {
    h.proxy.controller.control({ mode: 'auto', lockedEffort });
    assert.deepEqual(await consume(await h.request(bytes)), completedSse());
    assert.equal(h.records.at(-1).bytes.toString(), bytes); assert.equal(h.judge.calls, 0);
    await eventually(() => h.proxy.controller.active.size === 0);
    assert.equal(h.proxy.controller.sessions.size, 0);
  }
});
test('shadow preserves original JSON bytes, whitespace and Unicode', async t => {
  const h = await harness(t, { cfg: { mode: 'shadow' } }); const raw = '\n  ' + JSON.stringify(body(), null, 3) + '\n';
  await consume(await h.request(raw)); assert.equal(h.records[0].bytes.toString(), raw); assert.equal(h.judge.calls, 1);
});
test('off preserves original bytes and does not call judge', async t => {
  const h = await harness(t, { cfg: { mode: 'off' } }); const raw = JSON.stringify(body());
  await consume(await h.request(raw)); assert.equal(h.records[0].bytes.toString(), raw); assert.equal(h.judge.calls, 0);
});
test('local token and cookies never reach upstream; auth stays on upstream path only', async t => {
  const h = await harness(t); await consume(await h.request(body(), { headers: { cookie: 'private=cookie', 'x-cae-session': 'local-session' } }));
  const headers = h.records[0].headers;
  assert.equal(headers.authorization, 'Bearer synthetic-upstream-token');
  assert.equal(headers['x-cae-token'], undefined); assert.equal(headers['x-cae-session'], undefined); assert.equal(headers.cookie, undefined);
  const observations = JSON.stringify([h.judge.seen, h.events]);
  assert.ok(!observations.includes(h.token)); assert.ok(!observations.includes('synthetic-upstream-token')); assert.ok(!observations.includes('private=cookie'));
});
test('missing local token is rejected without upstream or judge call', async t => {
  const h = await harness(t); const res = await fetch(h.base + '/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) });
  assert.equal(res.status, 401); await res.text(); assert.equal(h.records.length, 0); assert.equal(h.judge.calls, 0);
});
for (const header of [{ origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'same-origin' }])
  test(`browser requests refused: ${Object.keys(header)[0]}`, async t => {
    const h = await harness(t); const res = await h.request(body(), { headers: header }); assert.equal(res.status, 403); await res.text(); assert.equal(h.records.length, 0);
  });
test('DNS rebinding host is refused even with a token', async t => {
  const h = await harness(t);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(h.base + '/health', { headers: { host: 'evil.invalid', 'x-cae-token': h.token } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});
test('health is authenticated and reveals no credential', async t => {
  const h = await harness(t); const res = await fetch(h.base + '/health', { headers: { 'x-cae-token': h.token } });
  const status = await res.json(); assert.equal(status.ok, true); assert.ok(!JSON.stringify(status).includes(h.token));
});
test('request-size cap rejects before upstream work', async t => {
  const h = await harness(t, { cfg: { maxBodyBytes: 1024 } }); const res = await h.request(body({ input: 'x'.repeat(2048) }));
  assert.equal(res.status, 413); await res.text(); assert.equal(h.records.length, 0);
});
test('malformed JSON returns a safe error without echoing payload', async t => {
  const h = await harness(t); const res = await h.request('{private-data'); assert.equal(res.status, 400);
  assert.ok(!(await res.text()).includes('private-data')); assert.equal(h.records.length, 0);
});
test('unknown routes cannot act as an arbitrary HTTP proxy', async t => {
  const h = await harness(t); const res = await h.request(body(), { path: '/v1/files' }); assert.equal(res.status, 404); await res.text(); assert.equal(h.records.length, 0);
});
test('compressed request rejected rather than misparsed', async t => {
  const h = await harness(t); const res = await h.request(body(), { headers: { 'content-encoding': 'gzip' } }); assert.equal(res.status, 415); await res.text(); assert.equal(h.records.length, 0);
});
for (const [name, value] of [
  ['a model selected outside the pin', body({ model: 'other-model' })],
  ['existing configuration update', append(body(), { type: 'configuration_update', reasoning: { effort: 'medium' } })],
  ['delta continuation', body({ previous_response_id: 'resp_previous' })],
  ['compaction item', append(body(), { type: 'compaction', encrypted_content: 'private-compaction' })],
  ['image-dependent evidence', body({ input: [{ role: 'user', content: [{ type: 'input_text', text: 'What changed?' }, { type: 'input_image', image_url: 'data:image/png;base64,AAA' }] }] })],
]) test(`bypass retains complete request: ${name}`, async t => {
  const h = await harness(t); await consume(await h.request(value)); assert.deepEqual(JSON.parse(h.records[0].bytes), value); assert.equal(h.judge.calls, 0);
});
test('standalone compact route is byte-preserving and does not call judge', async t => {
  const h = await harness(t); const raw = JSON.stringify(body(), null, 2);
  await consume(await h.request(raw, { path: '/v1/responses/compact' })); assert.equal(h.records[0].bytes.toString(), raw); assert.equal(h.judge.calls, 0);
});
test('models route forwards only to configured backend', async t => {
  const h = await harness(t); await consume(await h.request(null, { method: 'GET', path: '/v1/models?client_version=synthetic' }));
  assert.equal(h.records[0].url, '/v1/models?client_version=synthetic'); assert.equal(h.judge.calls, 0);
});
test('upstream HTTP error returned without retries', async t => {
  const h = await harness(t, { handler: (_req, res) => { res.writeHead(429, { 'content-type': 'application/json' }); res.end('{"error":{"code":"synthetic_limit"}}'); } });
  const res = await h.request(); assert.equal(res.status, 429); assert.match(await res.text(), /synthetic_limit/); assert.equal(h.records.length, 1);
  await eventually(() => h.proxy.controller.active.size === 0); assert.equal(h.proxy.controller.sessions.size, 0);
});
test('redirect refused instead of forwarding credentials to a new destination', async t => {
  const h = await harness(t, { handler: (_req, res) => { res.writeHead(302, { location: 'https://example.invalid/steal' }); res.end(); } });
  const res = await h.request(); assert.equal(res.status, 502); assert.match(await res.text(), /redirect_refused/); assert.equal(h.records.length, 1);
});
test('non-stream JSON responses preserve bytes and observe usage', async t => {
  const text = JSON.stringify({ id: 'resp_json', status: 'completed', output: [], usage: { input_tokens: 5, output_tokens: 3 } });
  const h = await harness(t, { handler: (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(text); } });
  const res = await h.request(body({ stream: false })); assert.equal(await res.text(), text);
  await eventually(() => h.events.some(e => e.event === 'upstream_outcome')); assert.equal(h.events.at(-1).inputTokens, 5);
});
test('missing terminal event does not establish completion or a lease', async t => {
  const h = await harness(t, { handler: (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'); } });
  await consume(await h.request()); await eventually(() => h.proxy.controller.active.size === 0);
  assert.equal(h.proxy.controller.sessions.size, 0); assert.equal(h.events.at(-1).completed, false); assert.equal(h.events.at(-1).inputTokens, null);
});
test('stream interruption never triggers transparent replay', async t => {
  const h = await harness(t, { handler: async (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"type":"response.created"}\n\n'); await sleep(20); res.destroy(); } });
  const res = await h.request(); await assert.rejects(res.text()); await eventually(() => h.proxy.controller.active.size === 0); assert.equal(h.records.length, 1);
});
test('cancel during judge prevents any upstream request', async t => {
  let called = false, release;
  const judge = { evaluate() { called = true; return new Promise(r => { release = r; }); } };
  const h = await harness(t, { judge }); const a = new AbortController();
  const pending = h.request(body(), { signal: a.signal }); pending.catch(() => {});
  await eventually(() => called); a.abort(); await assert.rejects(pending);
  await eventually(() => h.proxy.controller.active.size === 0);
  release({ effort: 'low', lease: 3 }); await sleep(15); assert.equal(h.records.length, 0);
});
test('cancel during upstream stream closes upstream and clears lease', async t => {
  let upstreamClosed = false;
  const h = await harness(t, { handler: (_req, res) => {
    res.on('close', () => { upstreamClosed = true; }); res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"type":"response.created"}\n\n');
  } });
  const a = new AbortController(); const res = await h.request(body(), { signal: a.signal });
  a.abort(); await assert.rejects(res.text()); await eventually(() => upstreamClosed && h.proxy.controller.active.size === 0);
  assert.equal(h.records.length, 1); assert.equal(h.proxy.controller.sessions.size, 0);
});
test('native client closing after a valid completed SSE event preserves completion and lease', async t => {
  let upstreamClosed = false;
  const h = await harness(t, { handler: (_req, res) => {
    res.on('close', () => { upstreamClosed = true; });
    res.writeHead(200); res.write(completedSse()); // Native client need not wait for HTTP EOF.
  } });
  await new Promise((resolve, reject) => {
    const req = http.request(h.base + '/v1/responses', { method: 'POST', headers: h.headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; if (data.includes('response.completed')) { res.destroy(); resolve(); } });
      res.on('error', reject);
    });
    req.on('error', reject); req.end(JSON.stringify(body()));
  });
  await eventually(() => upstreamClosed && h.proxy.controller.active.size === 0);
  const outcome = h.events.find(e => e.event === 'upstream_outcome');
  assert.equal(outcome.completed, true); assert.equal(outcome.httpStatus, 200);
  assert.equal(outcome.terminal, 'response.completed'); assert.equal(outcome.inputTokens, 100);
  assert.equal(h.proxy.controller.sessions.size, 1);
});
test('second request for active session receives 409 instead of racing', async t => {
  let release, entered = false;
  const h = await harness(t, { judge: { evaluate() { entered = true; return new Promise(r => { release = r; }); } } });
  const first = h.request(); await eventually(() => entered); const second = await h.request(); assert.equal(second.status, 409); await second.text();
  release({ effort: 'low', lease: 2 }); await consume(await first); assert.equal(h.records.length, 1);
});
test('authenticated manual control changes next request without a judge call', async t => {
  const h = await harness(t);
  const control = await fetch(h.base + '/control', { method: 'POST', headers: h.headers, body: '{"lockedEffort":"medium"}' }); assert.equal(control.status, 200); await control.text();
  await consume(await h.request()); assert.equal(JSON.parse(h.records[0].bytes).reasoning.effort, 'medium'); assert.equal(h.judge.calls, 0);
});
test('real HTTP continuation reuses a completed lease', async t => {
  const h = await harness(t); const b = body(); await consume(await h.request(b)); await eventually(() => h.proxy.controller.active.size === 0);
  await consume(await h.request(append(b))); assert.equal(h.judge.calls, 1);
});
test('explicit WebSocket upgrade gets 426, not a fabricated compatible response', async t => {
  const h = await harness(t);
  const text = await new Promise((resolve, reject) => {
    const socket = net.connect(h.proxy.port, '127.0.0.1', () => socket.write(`GET /v1/responses HTTP/1.1\r\nHost: 127.0.0.1:${h.proxy.port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));
    let data = ''; socket.on('data', b => { data += b.toString(); }); socket.on('end', () => resolve(data)); socket.on('error', reject);
  });
  assert.match(text, /426 Upgrade Required/); assert.equal(h.records.length, 0);
});
test('external upstream cannot start without explicit enable flag', async () => {
  await assert.rejects(startProxy(config(), { token: 'a'.repeat(64), judge: fakeJudge() }), /upstream_not_enabled/);
});
test('hop-by-hop nominated header is not forwarded', () => {
  const h = forwardedHeaders({ connection: 'x-private', 'x-private': 'remove', authorization: 'keep', 'x-cae-token': 'remove' });
  assert.equal(h['x-private'], undefined); assert.equal(h.authorization, 'keep'); assert.equal(h['x-cae-token'], undefined);
});
