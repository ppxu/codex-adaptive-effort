import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { once } from 'node:events';
import { defaultConfig } from '../src/config.mjs';
import { codexArgs } from '../src/codex.mjs';
import { CaeError } from '../src/util.mjs';
import { startProxy } from '../src/proxy.mjs';
import { eventually } from './helpers.mjs';
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
for (const [scenario, code] of [['mismatch', 'effective_provider_mismatch'], ['secret', 'effective_provider_mismatch'],
  ['rpc-error', 'config_rpc_error'], ['malformed', 'config_invalid_json'], ['hang', 'config_timeout']]) {
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
