import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { defaultConfig } from '../src/config.mjs';
import { codexArgs } from '../src/codex.mjs';
import { CaeError } from '../src/util.mjs';
import { startProxy } from '../src/proxy.mjs';
import { eventually, body, completedSse } from './helpers.mjs';
import { DESKTOP_ARGS, TESTED_DESKTOP, checkDesktopVersion, validateDesktopCapabilities, validateDesktopConfig,
  verifyDesktopProvider, selectDescendants, parseProcessRows, startDesktop, desktopControl, desktopSocket } from '../src/desktop.mjs';
const fixture = fileURLToPath(new URL('./fixtures/desktop-config.mjs', import.meta.url));
function config() { const c = defaultConfig('synthetic-model', ['low', 'medium', 'high'], 'medium'); c.upstream.kind = 'chatgpt'; return c; }
const capture = { source: 'synthetic metadata', observedAt: '2026-01-01T00:00:00Z', models: [{ model: 'synthetic-model', baseline: 'medium', supportedEfforts: ['low', 'medium', 'high'] }] };
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cae-d-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const c = config(); c.port = port;
  const path = join(dir, 'config.json'); writeFileSync(path, JSON.stringify(c)); writeFileSync(join(dir, 'local.key'), 'a'.repeat(64), { mode: 0o600 });
  return { path, dir, c, options: { configPath: path, auth: 'chatgpt', enableUpstream: true, startupTimeoutMs: 5000 } };
}
function dependencies({ announce = true, verifyError = false } = {}) {
  return { inspect: async () => ({ binary: 'synthetic', executable: 'synthetic', ...TESTED_DESKTOP }), probe: async () => capture,
    verify: async () => { if (verifyError) throw new CaeError('desktop_effective_provider_mismatch'); },
    spawnApp: (_exe, _args, opts) => spawn(process.execPath, ['-e', `${announce ? 'console.log("initialize_handshake_result outcome=success");' : ''}setInterval(()=>{},1000);`], opts),
    track: child => async () => { if (child.exitCode !== null || child.signalCode !== null) return; const exit = once(child, 'exit'); child.kill(); await exit; } };
}

test('desktop rejects unvalidated versions, billing route, Jev and auto startup', () => {
  checkDesktopVersion(TESTED_DESKTOP);
  assert.throws(() => checkDesktopVersion({ ...TESTED_DESKTOP, cli: 'new version' }), /desktop_version_not_validated/);
  for (const c of [{ ...config(), mode: 'auto' }, { ...config(), upstream: { kind: 'api' } },
    { ...config(), judge: { ...config().judge, kind: 'typesafe' } }]) assert.throws(() => validateDesktopConfig(c));
  validateDesktopConfig(config()); validateDesktopCapabilities(config(), capture);
  assert.throws(() => validateDesktopCapabilities({ ...config(), supportedEfforts: ['ultra'] }, capture), /capabilities_changed/);
});
test('native metadata preflight catches original desktop scope bug and accepts repaired args', async () => {
  const c = config();
  await assert.rejects(verifyDesktopProvider(process.execPath, [fixture, 'ok', ...codexArgs(c, 'chatgpt'), ...DESKTOP_ARGS], c), /effective_provider_mismatch/);
  const result = await verifyDesktopProvider(process.execPath, [fixture, 'ok', ...codexArgs(c, 'chatgpt', DESKTOP_ARGS)], c);
  assert.deepEqual(result, { provider: 'cae', model: 'synthetic-model', effort: 'medium' });
});
for (const retry of ['request_max_retries', 'stream_max_retries']) test(`desktop preflight refuses effective ${retry}`, async () => {
  const c = config();
  const args = codexArgs(c, 'chatgpt', [...DESKTOP_ARGS, '-c', `model_providers.cae.${retry}=2`]);
  await assert.rejects(verifyDesktopProvider(process.execPath, [fixture, 'ok', ...args], c), /effective_provider_mismatch/);
});
for (const [scenario, code] of [['mismatch', 'effective_provider_mismatch'], ['secret', 'effective_provider_mismatch'],
  ['rpc-error', 'config_rpc_error'], ['malformed', 'config_invalid_json'], ['null', 'config_invalid_message'], ['hang', 'config_timeout']]) {
  test('desktop preflight fails closed: ' + scenario, async () => {
    await assert.rejects(verifyDesktopProvider(process.execPath, [fixture, scenario, ...codexArgs(config(), 'chatgpt', DESKTOP_ARGS)], config(),
      { timeoutMs: scenario === 'hang' ? 100 : 3000 }), e => e.code.endsWith(code) && !e.message.includes('synthetic-private'));
  });
}
test('process tracking excludes unrelated processes and recycled parents', () => {
  const tracked = selectDescendants([{ pid: 10, ppid: 1, identity: 'root' }, { pid: 11, ppid: 10, identity: 'child' },
    { pid: 12, ppid: 11, identity: 'helper' }, { pid: 20, ppid: 1, identity: 'daily' }], 10);
  assert.deepEqual([...tracked.keys()], [10, 11, 12]);
  selectDescendants([{ pid: 10, ppid: 1, identity: 'recycled' }, { pid: 30, ppid: 10, identity: 'unrelated' }], 10, tracked);
  assert(!tracked.has(30));
});
test('process birth identity survives title changes but detects reused PID', () => {
  const before = parseProcessRows('10 1 Mon Sep 28 12:00:00 2026 /synthetic/node')[0];
  const renamed = parseProcessRows('10 1 Mon Sep 28 12:00:00 2026 synthetic-helper')[0];
  const reused = parseProcessRows('10 1 Mon Sep 28 12:00:10 2026 synthetic-helper')[0];
  assert.equal(before.identity, renamed.identity); assert.notEqual(before.identity, reused.identity);
});
test('native metadata preflight aborts without waiting for its timeout', async () => {
  const controller = new AbortController();
  const check = verifyDesktopProvider(process.execPath, [fixture, 'hang', ...codexArgs(config(), 'chatgpt', DESKTOP_ARGS)], config(),
    { signal: controller.signal, timeoutMs: 30000 });
  controller.abort(); await assert.rejects(check, /desktop_start_cancelled/);
});
test('desktop lifecycle authenticates status/stop, rejects duplicate start and releases port', async t => {
  const s = await setup(t), deps = dependencies();
  const desktop = await startDesktop(s.options, deps); t.after(() => desktop.stop());
  await desktopControl(s.path, 'bridge-ready');
  await eventually(() => desktop.state().phase === 'running', 3000);
  assert.equal((await desktopControl(s.path, 'status')).effectiveProvider, 'cae');
  await assert.rejects(startDesktop(s.options, deps), /desktop_instance_or_port_in_use/);
  assert.equal((await desktopControl(s.path, 'status')).phase, 'running');
  const unauthenticated = await new Promise((resolve, reject) => {
    const socket = createConnection(desktopSocket(s.path)); socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify({ token: 'bad', action: 'stop' }) + '\n'));
    socket.on('data', b => { resolve(JSON.parse(String(b))); socket.destroy(); });
  });
  assert.equal(unauthenticated.error, 'local_auth_required'); assert.equal(desktop.state().phase, 'running');
  const result = await desktopControl(s.path, 'stop'); assert.equal(result.phase, 'stopped'); await desktop.done;
  await assert.rejects(fetch(`http://127.0.0.1:${s.c.port}/health`));
  const wrapper = readFileSync(join(s.dir, 'desktop-bridge'), 'utf8'); assert(!wrapper.includes('a'.repeat(64)));
});
test('provider mismatch prevents desktop spawn and releases owned socket', async t => {
  const s = await setup(t); let spawned = false; const deps = dependencies({ verifyError: true }); deps.spawnApp = () => { spawned = true; };
  await assert.rejects(startDesktop(s.options, deps), /effective_provider_mismatch/);
  assert.equal(spawned, false); assert.equal(existsSync(join(s.dir, 'desktop-bridge')), false);
  await assert.rejects(desktopControl(s.path, 'status'));
});
test('non-object desktop control frames cannot crash or stop the supervisor', async t => {
  const s = await setup(t), desktop = await startDesktop(s.options, dependencies());
  t.after(() => desktop.stop());
  for (const value of [null, [], 42, false, 'text']) {
    await new Promise((resolve, reject) => {
      const socket = createConnection(desktopSocket(s.path));
      socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('control frame did not close')); });
      socket.on('error', reject); socket.on('close', resolve); socket.resume();
      socket.on('connect', () => socket.write(JSON.stringify(value) + '\n'));
    });
    assert.equal((await desktopControl(s.path, 'status')).ok, true);
  }
});
test('occupied proxy port is not hijacked or closed by failed desktop startup', async t => {
  const s = await setup(t), occupied = createServer(socket => socket.end());
  await new Promise(r => occupied.listen(s.c.port, '127.0.0.1', r)); t.after(() => new Promise(r => occupied.close(r)));
  await assert.rejects(startDesktop(s.options, dependencies()), /desktop_instance_or_port_in_use/);
  assert.equal(occupied.listening, true);
});
test('missing desktop handshake times out and cleans up', async t => {
  const s = await setup(t);
  const desktop = await startDesktop({ ...s.options, startupTimeoutMs: 100 }, dependencies({ announce: false }));
  await assert.rejects(desktop.done, /desktop_start_timeout/);
  await assert.rejects(fetch(`http://127.0.0.1:${s.c.port}/health`));
});
test('handshake without verified bridge is not readiness', async t => {
  const s = await setup(t);
  const desktop = await startDesktop({ ...s.options, startupTimeoutMs: 150 }, dependencies());
  await assert.rejects(desktop.done, /desktop_start_timeout/);
  assert.equal(desktop.state().bridgeChecks, 0);
});
test('closing owned desktop stops its proxy and a fresh instance can start', async t => {
  const s = await setup(t), deps = dependencies(); let child;
  const original = deps.spawnApp; deps.spawnApp = (...args) => child = original(...args);
  const desktop = await startDesktop(s.options, deps);
  await desktopControl(s.path, 'bridge-ready'); await eventually(() => desktop.state().phase === 'running', 3000);
  child.kill(); await desktop.done;
  const next = await startDesktop(s.options, dependencies()); t.after(() => next.stop());
  await desktopControl(s.path, 'bridge-ready'); await eventually(() => next.state().phase === 'running', 3000);
  await next.stop(); await next.done;
});
test('stop during metadata preflight prevents app launch', async t => {
  const s = await setup(t), deps = dependencies(); let release, entered;
  const gate = new Promise(r => release = r), preflight = new Promise(r => entered = r);
  deps.verify = async (_binary, _args, _config, { signal }) => { entered(); signal.addEventListener('abort', release, { once: true }); await gate; };
  let spawned = false; deps.spawnApp = () => { spawned = true; };
  const starting = startDesktop(s.options, deps);
  const rejected = assert.rejects(starting, /desktop_start_cancelled/); await preflight;
  await desktopControl(s.path, 'stop'); release();
  await rejected; assert.equal(spawned, false);
});
test('desktop Jev requires explicit opt-in and missing key fails before native startup', async t => {
  const s = await setup(t), deps = dependencies(); deps.env = {};
  deps.inspect = () => { assert.fail('must reject before native inspection'); };
  await assert.rejects(startDesktop({ ...s.options, enableJev: true }, deps), /missing_typesafe_key/);
  const cli = spawnSync(process.execPath, ['bin/cae.mjs', 'desktop', 'start', '--auth', 'chatgpt', '--enable-upstream', '--enable-jev'],
    { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
  assert.equal(cli.status, 1); assert.equal(cli.stderr.trim(), 'CAE: missing_typesafe_key');
  const c = { ...s.c, judge: { ...s.c.judge, kind: 'typesafe' } };
  assert.throws(() => validateDesktopConfig(c), /desktop_jev_not_enabled/);
  validateDesktopConfig(c, { enableJev: true });
  assert.throws(() => validateDesktopConfig({ ...c, mode: 'auto' }, { enableJev: true }), /off_or_shadow/);
});
test('desktop Jev is bounded process-only shadow; HTTP controls cannot enable auto or locks', async t => {
  const s = await setup(t), deps = dependencies(); let proxy, calls = 0, spawnedEnv;
  const original = readFileSync(s.path, 'utf8');
  deps.env = { ...process.env, TYPESAFE_API_KEY: 'synthetic-desktop-jev-key' };
  const spawnApp = deps.spawnApp;
  deps.spawnApp = (...args) => { spawnedEnv = args[2].env; return spawnApp(...args); };
  deps.startProxy = async (...args) => proxy = await startProxy(...args);
  deps.judgeFetch = async (url, request) => {
    ++calls; assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(request.headers.authorization, 'Bearer synthetic-desktop-jev-key');
    return new Response(JSON.stringify({ answers: { effort: { choice: 'low' }, lease: { choice: '1' } } }));
  };
  const desktop = await startDesktop({ ...s.options, enableJev: true }, deps); t.after(() => desktop.stop());
  await desktopControl(s.path, 'bridge-ready'); await eventually(() => desktop.state().phase === 'running', 3000);
  const status = await desktopControl(s.path, 'status');
  assert.equal(status.judgeKind, 'typesafe'); assert.equal(status.shadowOnly, true); assert.equal(status.mode, 'shadow');
  assert.equal(status.judgeCallLimit, 8); assert.equal(proxy.controller.config.judge.timeoutMs, 1500);
  assert.equal(spawnedEnv.TYPESAFE_API_KEY, undefined); assert.equal(readFileSync(s.path, 'utf8'), original);
  const headers = { 'x-cae-token': 'a'.repeat(64), 'content-type': 'application/json' };
  const control = async patch => fetch(`http://127.0.0.1:${s.c.port}/control`, { method: 'POST', headers, body: JSON.stringify(patch) });
  for (const patch of [{ mode: 'auto' }, { lockedEffort: 'high' }]) {
    const response = await control(patch); assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'shadow_only_control');
  }
  const b = { model: 'synthetic-model', reasoning: { effort: 'medium' }, input: '无敏感合成任务' };
  // Exercise preparation only; never send synthetic-model to a real executor.
  for (let i = 0; i < 9; ++i) {
    const tx = await proxy.controller.prepare(b); assert.equal(tx.changed, false); assert.equal(tx.body, b);
    assert.equal(tx.source, i < 8 ? 'judge' : 'fallback');
    if (i === 8) assert.equal(tx.reason, 'judge_call_budget');
    proxy.controller.finish(tx);
  }
  assert.equal(calls, 8);
  assert.equal((await control({ mode: 'off' })).status, 200);
  assert.equal((await control({ mode: 'shadow' })).status, 200);
  assert.equal(proxy.controller.judgeCalls, 8); // Mode toggles do not renew budget.
  await desktop.stop(); await desktop.done;
  const log = readFileSync(join(s.dir, 'events.jsonl'), 'utf8');
  assert(!log.includes('synthetic-desktop-jev-key')); assert(!log.includes('无敏感合成任务'));
  assert.equal(log.split('\n').filter(Boolean).map(JSON.parse).filter(r => r.event === 'decision' && r.source === 'judge').length, 8);
  const next = await startDesktop(s.options, dependencies()); t.after(() => next.stop());
  assert.equal(next.state().judgeKind, 'baseline'); assert.equal(next.state().shadowOnly, false);
  await next.stop(); await next.done;
});
test('desktop Jev respects stricter existing timeout and budget and preserves off startup', async t => {
  const s = await setup(t), deps = dependencies();
  s.c.mode = 'off'; s.c.judge.maxCalls = 2; s.c.judge.timeoutMs = 100;
  writeFileSync(s.path, JSON.stringify(s.c));
  deps.env = { ...process.env, TYPESAFE_API_KEY: 'synthetic-only' }; let runtime;
  deps.startProxy = async (c, opts) => { runtime = c; return startProxy(c, opts); };
  deps.judgeFetch = () => assert.fail('startup must not call Jev');
  const desktop = await startDesktop({ ...s.options, enableJev: true }, deps); t.after(() => desktop.stop());
  assert.equal(runtime.judge.maxCalls, 2); assert.equal(runtime.judge.timeoutMs, 100);
  assert.equal(desktop.state().mode, 'off'); assert.equal(desktop.state().judgeCalls, 0);
  await desktop.stop(); await desktop.done;
});

test('desktop auto opt-in requires Jev, is start-only, and never permits auto startup', async t => {
  const s = await setup(t), deps = dependencies();
  deps.inspect = () => assert.fail('must reject before native inspection');
  await assert.rejects(startDesktop({ ...s.options, allowJevAuto: true }, deps), /desktop_auto_requires_jev/);
  deps.env = {};
  await assert.rejects(startDesktop({ ...s.options, enableJev: true, allowJevAuto: true }, deps), /missing_typesafe_key/);
  for (const [args, error] of [
    [['desktop', 'start', '--auth', 'chatgpt', '--enable-upstream'], 'desktop_auto_requires_jev'],
    [['desktop', 'status'], 'desktop_auto_start_only'],
    [['serve'], 'desktop_auto_start_only'],
    [['desktop', 'start', '--auth', 'chatgpt', '--enable-upstream', '--enable-jev'], 'missing_typesafe_key'],
  ]) {
    const cli = spawnSync(process.execPath, ['bin/cae.mjs', ...args, '--allow-jev-auto'],
      { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
    assert.equal(cli.status, 1); assert.equal(cli.stderr.trim(), 'CAE: ' + error);
  }
  assert.throws(() => validateDesktopConfig({ ...s.c, mode: 'auto' }, { enableJev: true, allowJevAuto: true }), /off_or_shadow/);
});

test('desktop timeout override rejects invalid values, wrong commands and missing Jev opt-in before native startup', async t => {
  const s = await setup(t), deps = dependencies();
  deps.inspect = () => assert.fail('must reject before native inspection');
  await assert.rejects(startDesktop({ ...s.options, jevTimeoutMs: 2000 }, deps), /desktop_timeout_requires_jev/);
  for (const value of [0, 1501, 2001, NaN, Infinity, '2000', null])
    await assert.rejects(startDesktop({ ...s.options, enableJev: true, jevTimeoutMs: value }, deps), /desktop_invalid_jev_timeout/);
  for (const [args, code] of [
    [['desktop', 'status', '--jev-timeout-ms', '2000'], 'desktop_timeout_start_only'],
    [['serve', '--jev-timeout-ms', '2000'], 'desktop_timeout_start_only'],
    [['desktop', 'start', '--auth', 'chatgpt', '--enable-upstream', '--jev-timeout-ms', '2000'], 'desktop_timeout_requires_jev'],
    ...['', '2001', '2e3', 'NaN'].map(value => [['desktop', 'start', '--jev-timeout-ms', value], 'desktop_invalid_jev_timeout']),
  ]) {
    const cli = spawnSync(process.execPath, ['bin/cae.mjs', ...args], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
    assert.equal(cli.status, 1); assert.equal(cli.stderr.trim(), 'CAE: ' + code);
  }
});

test('desktop 2000 ms timeout is process-only, retains call budget and restores 1500 ms on restart', async t => {
  const s = await setup(t), deps = dependencies(); let proxy;
  s.c.judge.maxCalls = 2; writeFileSync(s.path, JSON.stringify(s.c));
  const disk = readFileSync(s.path, 'utf8');
  deps.env = { ...process.env, TYPESAFE_API_KEY: 'synthetic-timeout-key' };
  deps.startProxy = async (...args) => proxy = await startProxy(...args);
  deps.judgeFetch = async (_url, request) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify({ answers: { effort: { choice: 'low' }, lease: { choice: '1' } } }))), 1700);
    request.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('synthetic abort')); }, { once: true });
  });
  // Same delayed synthetic response exercises both deadlines, without any external executor request.
  for (const timeout of [2000, undefined, 1500]) {
    const desktop = await startDesktop({ ...s.options, enableJev: true, allowJevAuto: true, jevTimeoutMs: timeout }, deps);
    t.after(() => desktop.stop());
    const status = await desktopControl(s.path, 'status');
    assert.equal(status.judgeTimeoutMs, timeout ?? 1500); assert.equal(status.judgeCallLimit, 2);
    assert.equal(status.mode, 'shadow'); assert.equal(status.judgeCalls, 0);
    proxy.controller.control({ mode: 'auto' });
    const b = body({ reasoning: { effort: 'medium' } }), tx = await proxy.controller.prepare(b);
    assert.equal(tx.source, timeout === 2000 ? 'judge' : 'fallback');
    assert.equal(tx.changed, timeout === 2000);
    assert.equal(tx.body.reasoning.effort, timeout === 2000 ? 'low' : 'medium');
    assert.equal(tx.reason, timeout === 2000 ? null : 'judge_timeout');
    proxy.controller.finish(tx);
    proxy.controller.control({ mode: 'off' });
    assert.equal(proxy.controller.status().judgeTimeoutMs, timeout ?? 1500);
    assert.equal(proxy.controller.status().judgeCalls, 1);
    assert.equal(readFileSync(s.path, 'utf8'), disk);
    await desktop.stop(); await desktop.done;
  }
});

test('desktop auto opt-in changes only effort over HTTP, preserves fallback/off bytes and resets permission on restart', async t => {
  const s = await setup(t), deps = dependencies(); let calls = 0, runtime, spawnedEnv;
  s.c.mode = 'off'; s.c.judge.maxCalls = 4; s.c.judge.timeoutMs = 100;
  writeFileSync(s.path, JSON.stringify(s.c)); const original = readFileSync(s.path, 'utf8');
  const received = [], events = [], responseBytes = completedSse();
  const upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received.push({ bytes: Buffer.concat(chunks), headers: req.headers });
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(responseBytes);
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  t.after(() => { upstream.closeAllConnections(); return new Promise(r => upstream.close(r)); });
  deps.env = { ...process.env, TYPESAFE_API_KEY: 'synthetic-auto-key' };
  const spawnApp = deps.spawnApp;
  deps.spawnApp = (...args) => { spawnedEnv = args[2].env; return spawnApp(...args); };
  deps.startProxy = (c, opts) => {
    runtime = c;
    // Only the test substitutes an upstream; no synthetic request can leave loopback.
    return startProxy({ ...c, upstream: { kind: 'mock', baseUrl: `http://127.0.0.1:${upstream.address().port}/v1` } },
      { ...opts, emit: event => { events.push(event); opts.emit(event); } });
  };
  deps.judgeFetch = async (_url, request) => {
    ++calls;
    assert.equal(request.headers.authorization, 'Bearer synthetic-auto-key');
    if (calls === 4) return new Promise((_resolve, reject) => request.signal.addEventListener('abort',
      () => reject(new Error('synthetic timeout')), { once: true }));
    return new Response(JSON.stringify({ answers: { effort: { choice: ['low', 'high', 'ultra'][calls - 1] }, lease: { choice: '1' } } }));
  };
  const desktop = await startDesktop({ ...s.options, enableJev: true, allowJevAuto: true }, deps);
  t.after(() => desktop.stop());
  await desktopControl(s.path, 'bridge-ready'); await eventually(() => desktop.state().phase === 'running', 3000);
  assert.equal(desktop.state().shadowOnly, false); assert.equal(desktop.state().mode, 'off');
  assert.equal(calls, 0); assert.equal(runtime.judge.maxCalls, 4); assert.equal(runtime.judge.timeoutMs, 100);
  assert.equal(spawnedEnv.TYPESAFE_API_KEY, undefined);
  const base = `http://127.0.0.1:${s.c.port}`;
  // This test deliberately restarts the listener on the same port; do not reuse its old client socket.
  const headers = { 'x-cae-token': 'a'.repeat(64), 'content-type': 'application/json', authorization: 'Bearer synthetic-executor', connection: 'close' };
  const control = async mode => {
    const response = await fetch(base + '/control', { method: 'POST', headers, body: JSON.stringify({ mode }) });
    assert.equal(response.status, 200); return response.json();
  };
  const b = body({ reasoning: { effort: 'medium', summary: 'auto' } });
  const raw = '  ' + JSON.stringify(b, null, 2) + '\n';
  const request = async (bytes = raw) => {
    const response = await fetch(base + '/v1/responses', { method: 'POST', headers, body: bytes });
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), responseBytes);
    await eventually(() => desktop.state().activeRequests === 0);
    return received.at(-1).bytes.toString();
  };
  assert.equal(await request(), raw); assert.equal(calls, 0);
  await control('auto');
  for (const effort of ['low', 'high']) {
    const sent = JSON.parse(await request());
    assert.equal(sent.reasoning.effort, effort);
    sent.reasoning.effort = 'medium'; assert.deepEqual(sent, b);
    assert.equal(events.filter(e => e.event === 'request_sent').at(-1).changed, true);
    assert.equal(received.at(-1).headers.authorization, 'Bearer synthetic-executor');
    assert.equal(received.at(-1).headers['x-cae-token'], undefined);
  }
  for (const value of [{ ...b, model: 'other-model' }, { ...b, previous_response_id: 'synthetic-history' }]) {
    const bytes = JSON.stringify(value, null, 2); assert.equal(await request(bytes), bytes);
  }
  assert.equal(calls, 2);
  for (const reason of ['judge_invalid_choice', 'judge_timeout', 'judge_call_budget']) {
    assert.equal(await request(), raw);
    const decision = events.filter(e => e.event === 'decision').at(-1);
    assert.equal(decision.source, 'fallback'); assert.equal(decision.reason, reason);
  }
  assert.equal(calls, 4);
  await control('shadow'); await control('off'); await control('auto');
  assert.equal(desktop.state().judgeCalls, 4); assert.equal(await request(), raw);
  await control('off'); assert.equal(await request(), raw); assert.equal(calls, 4);
  assert.equal(readFileSync(s.path, 'utf8'), original);
  await desktop.stop(); await desktop.done;
  const next = await startDesktop({ ...s.options, enableJev: true }, deps); t.after(() => next.stop());
  assert.equal(next.state().shadowOnly, true); assert.equal(next.state().mode, 'off');
  const rejected = await fetch(base + '/control', { method: 'POST', headers, body: JSON.stringify({ mode: 'auto' }) });
  assert.equal(rejected.status, 400); assert.equal((await rejected.json()).error.code, 'shadow_only_control');
  await next.stop(); await next.done;
  const log = readFileSync(join(s.dir, 'events.jsonl'), 'utf8');
  assert(!log.includes('synthetic-auto-key')); assert(!log.includes('synthetic-executor')); assert(!log.includes(b.input[0].content));
});
