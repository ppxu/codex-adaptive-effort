import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createServer, createConnection } from 'node:net';
import { mkdirSync, existsSync, writeFileSync, chmodSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { CaeError, digest, equalSecret, isObject } from './util.mjs';
import { defaultConfig, loadConfig, readLocalToken } from './config.mjs';
import { codexArgs, probeModels, nativeEnvironment } from './codex.mjs';
import { startProxy } from './proxy.mjs';
import { BaselineJudge, TypeSafeJudge } from './judge.mjs';
import { Audit } from './audit.mjs';
import { VERSION } from './version.mjs';

const run = promisify(execFile);
const pause = ms => new Promise(r => setTimeout(r, ms));
export const DESKTOP_ARGS = ['-c', 'features.code_mode_host=true', 'app-server', '--analytics-default-enabled',
  '-c', 'plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled=true'];
export const TESTED_DESKTOP = { version: '26.924.22138', build: '11645', cli: 'codex-cli 0.158.0-alpha.2.1' };
export function desktopSocket(configPath) {
  const name = `cae-${digest(resolve(configPath)).slice(0, 16)}`;
  return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), name + '.sock');
}
export function checkDesktopVersion(info) {
  if (info.version !== TESTED_DESKTOP.version || info.build !== TESTED_DESKTOP.build || info.cli !== TESTED_DESKTOP.cli)
    throw new CaeError('desktop_version_not_validated');
}
export async function inspectDesktop(appPath = '/Applications/ChatGPT.app') {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new CaeError('desktop_requires_macos_arm64');
  const app = realpathSync(appPath), plist = join(app, 'Contents/Info.plist');
  const env = nativeEnvironment();
  const value = async key => (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { timeout: 5000, env })).stdout.trim();
  let info;
  try {
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R=identifier "com.openai.codex" and anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"', app], { timeout: 15000, env });
    const executable = join(app, 'Contents/MacOS/ChatGPT');
    const binary = join(app, 'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex');
    info = { app, executable, binary, version: await value('CFBundleShortVersionString'), build: await value('CFBundleVersion'),
      cli: (await run(binary, ['--version'], { timeout: 5000, env })).stdout.trim() };
  } catch { throw new CaeError('desktop_bundle_verification_failed'); }
  checkDesktopVersion(info); return info;
}

export function validateDesktopCapabilities(config, capture) {
  const model = capture.models.find(m => m.model === config.model);
  if (!model || !model.supportedEfforts.includes(config.baseline) ||
      config.supportedEfforts.some(e => !model.supportedEfforts.includes(e))) throw new CaeError('desktop_capabilities_changed');
}
export function validateDesktopConfig(config, { enableJev = false } = {}) {
  if (config.upstream.kind !== 'chatgpt') throw new CaeError('desktop_requires_chatgpt_route');
  if (config.judge.kind !== 'baseline' && !enableJev) throw new CaeError('desktop_jev_not_enabled');
  if (!['off', 'shadow'].includes(config.mode)) throw new CaeError('desktop_start_requires_off_or_shadow');
  if (!config.port) throw new CaeError('fixed_port_required_for_codex');
}

/** Config metadata only. Never starts a thread or a generation; never exposes native error bodies. */
export async function verifyDesktopProvider(binary, args, config, { timeoutMs = 15000, signal } = {}) {
  if (signal?.aborted) throw new CaeError('desktop_start_cancelled');
  return new Promise((resolveCheck, reject) => {
    const env = { ...process.env }; delete env.CODEX_CLI_PATH; delete env.CAE_LOCAL_TOKEN; delete env.TYPESAFE_API_KEY;
    const child = spawn(binary, args, { env, stdio: ['pipe', 'pipe', 'ignore'] });
    const rl = createInterface({ input: child.stdout }); let settled = false, bytes = 0;
    const timer = setTimeout(() => finish(new CaeError('desktop_config_timeout')), timeoutMs);
    const abort = () => finish(new CaeError('desktop_start_cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    function finish(error, result) {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      rl.close(); child.stdin.end(); child.kill();
      const complete = () => { if (error) reject(error); else resolveCheck(result); };
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) { complete(); return; }
      const kill = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1000); kill.unref();
      child.once('exit', () => { clearTimeout(kill); complete(); });
    }
    function send(m) { if (!settled) child.stdin.write(JSON.stringify(m) + '\n'); }
    child.on('error', () => finish(new CaeError('codex_not_available')));
    child.stdin.on('error', () => finish(new CaeError('desktop_config_pipe_error')));
    child.on('exit', () => { if (!settled) finish(new CaeError('desktop_config_exited')); });
    child.stdout.on('data', b => { bytes += b.length; if (bytes > 4 * 1024 * 1024) finish(new CaeError('desktop_config_output_limit')); });
    rl.on('line', line => {
      if (settled) return;
      let msg; try { msg = JSON.parse(line); } catch { finish(new CaeError('desktop_config_invalid_json')); return; }
      if (!isObject(msg)) { finish(new CaeError('desktop_config_invalid_message')); return; }
      if (msg.id !== 1 && msg.id !== 2) return;
      if (msg.error) { finish(new CaeError('desktop_config_rpc_error')); return; }
      if (msg.id === 1) { send({ method: 'initialized', params: {} }); send({ id: 2, method: 'config/read', params: { includeLayers: false } }); return; }
      const c = msg.result?.config, provider = c?.model_providers?.cae;
      if (c?.model_provider !== 'cae' || c.model !== config.model || c.model_reasoning_effort !== config.baseline ||
          provider?.base_url !== `http://127.0.0.1:${config.port}/v1` || provider?.wire_api !== 'responses' ||
          provider?.requires_openai_auth !== true || provider?.supports_websockets !== false ||
          provider?.request_max_retries !== 0 || provider?.stream_max_retries !== 0 ||
          provider?.env_http_headers?.['x-cae-token'] !== 'CAE_LOCAL_TOKEN' || provider?.env_key != null || provider?.experimental_bearer_token != null) {
        finish(new CaeError('desktop_effective_provider_mismatch')); return;
      }
      finish(null, { provider: 'cae', model: c.model, effort: c.model_reasoning_effort });
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'cae_desktop_preflight', version: VERSION } } });
  });
}

export function desktopControl(configPath, action, { timeoutMs = 5000 } = {}) {
  const c = loadConfig(configPath), token = readLocalToken(c.tokenFile);
  return new Promise((resolveControl, reject) => {
    const socket = createConnection(desktopSocket(configPath)); let text = '', done = false;
    const finish = (error, result) => { if (done) return; done = true; socket.destroy(); error ? reject(error) : resolveControl(result); };
    socket.setTimeout(timeoutMs, () => finish(new CaeError('desktop_control_timeout')));
    socket.on('error', () => finish(new CaeError('desktop_not_running_or_stale_socket')));
    socket.on('connect', () => socket.write(JSON.stringify({ action, token }) + '\n'));
    socket.on('data', b => {
      text += b; if (text.length > 16384) { finish(new CaeError('desktop_control_invalid_reply')); return; }
      if (!text.includes('\n')) return;
      try { const value = JSON.parse(text.split('\n')[0]); finish(value.error ? new CaeError(value.error) : null, value); }
      catch { finish(new CaeError('desktop_control_invalid_reply')); }
    });
    socket.on('end', () => { if (!done) finish(new CaeError('desktop_control_closed')); });
  });
}

// Capture ownership while parents are alive; recheck birth identity before signalling.
export function selectDescendants(rows, root, tracked = new Map()) {
  const current = new Map(rows.map(r => [r.pid, r]));
  if (!tracked.size && current.has(root)) tracked.set(root, current.get(root).identity);
  let added = true;
  while (added) {
    added = false;
    for (const row of rows) if (!tracked.has(row.pid) && tracked.get(row.ppid) === current.get(row.ppid)?.identity) {
      if (!tracked.has(row.ppid)) continue;
      tracked.set(row.pid, row.identity); added = true;
    }
  }
  return tracked;
}
export function parseProcessRows(stdout) {
  return stdout.trim().split('\n').flatMap(line => {
    const fields = line.trim().split(/\s+/); if (fields.length < 8) return [];
    // Executable titles can change after startup; birth time is the identity guard.
    return [{ pid: Number(fields[0]), ppid: Number(fields[1]), identity: fields.slice(2, 7).join(' ') }];
  });
}
async function processRows() {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,ppid=,lstart=,comm='], { timeout: 5000, env: { ...nativeEnvironment(), LC_ALL: 'C' } });
  return parseProcessRows(stdout);
}
export function trackDesktop(child) {
  const tracked = new Map(); let pending = null, failure = false;
  const capture = () => {
    pending ??= processRows().then(rows => selectDescendants(rows, child.pid, tracked))
      .catch(() => { failure = true; }).finally(() => { pending = null; });
    return pending;
  };
  void capture(); const timer = setInterval(capture, 500); timer.unref();
  return async () => {
    clearInterval(timer); await capture();
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      const rows = await processRows();
      for (const row of rows) if (tracked.get(row.pid) === row.identity) {
        try { process.kill(row.pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw new CaeError('desktop_cleanup_failed'); }
      }
      await pause(signal === 'SIGTERM' ? 1500 : 200);
    }
    const remaining = (await processRows()).filter(row => tracked.get(row.pid) === row.identity);
    if (remaining.length || failure) throw new CaeError('desktop_cleanup_not_verified');
  };
}

export async function startDesktop(options, dependencies = {}) {
  const environment = dependencies.env ?? process.env;
  const inspect = dependencies.inspect ?? inspectDesktop, probe = dependencies.probe ?? probeModels;
  const verify = dependencies.verify ?? verifyDesktopProvider;
  if (!options.enableUpstream) throw new CaeError('upstream_not_enabled');
  if (options.auth !== 'chatgpt') throw new CaeError('desktop_requires_chatgpt_route');
  if (options.allowJevAuto && !options.enableJev) throw new CaeError('desktop_auto_requires_jev');
  if (options.jevTimeoutMs !== undefined) {
    if (!options.enableJev) throw new CaeError('desktop_timeout_requires_jev');
    if (![1500, 2000].includes(options.jevTimeoutMs)) throw new CaeError('desktop_invalid_jev_timeout');
  }
  if (options.enableJev && !environment.TYPESAFE_API_KEY?.trim()) throw new CaeError('missing_typesafe_key');
  const configPath = resolve(options.configPath), dir = dirname(configPath);
  const app = await inspect(options.appPath);
  const capture = await probe(app.binary);
  if (!existsSync(configPath)) {
    const model = capture.models.find(m => m.model === options.model);
    if (!model) throw new CaeError('desktop_init_requires_discovered_model');
    const c = defaultConfig(model.model, model.supportedEfforts, options.baseline ?? model.baseline);
    c.upstream.kind = 'chatgpt'; c.port = 4319;
    c.capabilitySource = `${capture.source} at ${capture.observedAt}`;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, 'local.key'), randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
    writeFileSync(configPath, JSON.stringify(c, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  const st = lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (process.platform !== 'win32' && (st.mode & 0o077))) throw new CaeError('desktop_private_directory_required');
  const c = loadConfig(configPath); validateDesktopConfig(c, options); validateDesktopCapabilities(c, capture);
  // Process-only opt-in. Keep the call cap; only an explicit timeout option overrides the disk timeout.
  if (options.enableJev) c.judge = { ...c.judge, kind: 'typesafe',
    maxCalls: Math.min(c.judge.maxCalls, 8), timeoutMs: options.jevTimeoutMs ?? Math.min(c.judge.timeoutMs, 1500) };
  const judge = options.enableJev ? new TypeSafeJudge({ apiKey: environment.TYPESAFE_API_KEY,
    model: c.judge.model, fetchImpl: dependencies.judgeFetch }) : new BaselineJudge();
  if ((options.model && options.model !== c.model) || (options.baseline && options.baseline !== c.baseline)) throw new CaeError('desktop_config_selection_mismatch');
  const token = readLocalToken(c.tokenFile), socketPath = desktopSocket(configPath);
  let proxy, audit, child, cleanupChild, stopping = false, phase = 'starting', bridgeChecks = 0, connected = false, startupTimer, stopPromise;
  const preflightAbort = new AbortController(); let preflight;
  let resolveDone, rejectDone; const done = new Promise((yes, no) => { resolveDone = yes; rejectDone = no; });
  done.catch(() => {});
  const state = () => ({ ok: true, phase, label: 'CAE DESKTOP · 实验实例', desktopPid: child?.pid ?? null,
    configPath, providerName: 'CAE experimental local effort controller', effectiveProvider: bridgeChecks ? 'cae' : null,
    newLocalThreadsOnly: true, sharedCodexHome: true,
    bridgeChecks, connected, appVersion: app.version, cliVersion: app.cli, ...proxy?.controller.status() });
  const sockets = new Set();
  const control = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); let input = '';
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', b => {
      input += b; if (input.length > 4096) { socket.destroy(); return; }
      if (!input.includes('\n')) return;
      socket.removeAllListeners('data'); let message;
      try { message = JSON.parse(input.split('\n')[0]); } catch { socket.destroy(); return; }
      if (!isObject(message)) { socket.destroy(); return; }
      if (!equalSecret(message.token, token)) { socket.end(JSON.stringify({ error: 'local_auth_required' }) + '\n'); return; }
      if (message.action === 'bridge-ready') { ++bridgeChecks; maybeReady(); }
      else if (!['status', 'stop'].includes(message.action)) { socket.end(JSON.stringify({ error: 'desktop_unknown_action' }) + '\n'); return; }
      if (message.action === 'stop') {
        socket.setTimeout(15000);
        void stop().then(() => socket.end(JSON.stringify({ ok: true, phase: 'stopped' }) + '\n'), () => socket.end(JSON.stringify({ error: 'desktop_cleanup_not_verified' }) + '\n'));
      } else socket.end(JSON.stringify(state()) + '\n');
    });
  });
  function maybeReady() {
    if (!stopping && phase === 'starting' && connected && bridgeChecks) {
      phase = 'running'; clearTimeout(startupTimer); options.onState?.(state());
    }
  }
  async function stop(error) {
    if (stopPromise) return stopPromise;
    stopping = true; phase = 'stopping'; clearTimeout(startupTimer);
    stopPromise = (async () => {
      let failure = error;
      preflightAbort.abort(); await preflight?.catch(() => {});
      try { if (cleanupChild) await cleanupChild(); } catch (e) { failure ??= e; }
      try { if (proxy) await proxy.close(); } catch { failure ??= new CaeError('desktop_proxy_cleanup_failed'); }
      audit?.close(); phase = 'stopped';
      // Stop accepting clients; allow the authenticated stop caller to receive its result.
      control.close();
      process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
      const timer = setTimeout(() => { for (const s of sockets) s.destroy(); }, 1000); timer.unref();
      if (failure) { rejectDone(failure); throw failure; } resolveDone(state()); return state();
    })();
    stopPromise.catch(() => {}); return stopPromise;
  }
  const onSignal = () => { void stop().catch(() => {}); };
  try {
    await new Promise((yes, no) => { control.once('error', no); control.listen(socketPath, yes); });
    if (process.platform !== 'win32') chmodSync(socketPath, 0o600);
    process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
    control.on('error', () => { void stop(new CaeError('desktop_control_failed')).catch(() => {}); });
    preflight = verify(app.binary, codexArgs(c, 'chatgpt', DESKTOP_ARGS), c, { signal: preflightAbort.signal });
    await preflight;
    if (stopping) throw new CaeError('desktop_start_cancelled');
    audit = new Audit(c.logFile);
    proxy = await (dependencies.startProxy ?? startProxy)(c, { token, judge, allowUpstream: true,
      shadowOnly: options.enableJev === true && options.allowJevAuto !== true,
      emit: record => audit.emit(record), auditHealthy: () => !audit.failed });
    if (stopping) { await proxy.close(); throw new CaeError('desktop_start_cancelled'); }
    const userData = join(dir, 'desktop-user-data'), bridge = join(dir, 'desktop-bridge');
    mkdirSync(userData, { recursive: true, mode: 0o700 });
    const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
    const bridgeBin = fileURLToPath(new URL('../bin/cae-desktop-bridge.mjs', import.meta.url));
    // Refuse to follow an existing symlink when refreshing our generated launcher.
    if (existsSync(bridge) && (!lstatSync(bridge).isFile() || lstatSync(bridge).isSymbolicLink())) throw new CaeError('desktop_bridge_path_invalid');
    writeFileSync(bridge, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(bridgeBin)} ${quote(configPath)} ${quote(app.binary)} "$@"\n`, { mode: 0o700 });
    const env = { ...environment, CODEX_ELECTRON_USER_DATA_PATH: userData, CODEX_CLI_PATH: bridge, CODEX_APP_SERVER_FORCE_CLI: '1' };
    delete env.CAE_LOCAL_TOKEN; delete env.TYPESAFE_API_KEY;
    child = (dependencies.spawnApp ?? spawn)(app.executable, ['--user-data-dir=' + userData], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    cleanupChild = (dependencies.track ?? trackDesktop)(child);
    child.once('error', () => { void stop(new CaeError('desktop_spawn_failed')).catch(() => {}); });
    child.once('exit', () => { if (!stopping) void stop(phase === 'running' ? null : new CaeError('desktop_exited_before_ready')).catch(() => {}); });
    // Do not persist native output: it may contain account details or task text.
    for (const stream of [child.stdout, child.stderr]) {
      let buffer = '';
      stream.on('data', b => {
        buffer += b; if (buffer.length > 65536) buffer = buffer.slice(-65536);
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) if (/initialize_handshake_result[^\n]*outcome=success\b/.test(line)) { connected = true; maybeReady(); }
      });
    }
    startupTimer = setTimeout(() => { void stop(new CaeError('desktop_start_timeout')).catch(() => {}); }, options.startupTimeoutMs ?? 45000);
    options.onState?.(state());
    return { done, stop, state };
  } catch (error) {
    // A competing instance owns its socket. Never unlink or signal that instance.
    const safe = error instanceof CaeError ? error : new CaeError(error.code === 'EADDRINUSE' ? 'desktop_instance_or_port_in_use' : 'desktop_start_failed');
    await stop(safe).catch(() => {}); throw safe;
  }
}
