import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { CaeError, isObject } from './util.mjs';
import { EFFORT_NAMES } from './config.mjs';

export function nativeEnvironment(source = process.env) {
  const env = { ...source }; delete env.TYPESAFE_API_KEY; return env;
}
export function doctor(binary = 'codex') {
  const check = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true, env: nativeEnvironment() });
  return { node: process.version, platform: process.platform, architecture: process.arch,
    codexFound: !check.error && check.status === 0,
    codexVersion: /codex[^\r\n]{0,50}\d[^\r\n]{0,50}/i.exec(check.stdout ?? '')?.[0] ?? null,
    credentialsReadByCAE: false, paidCallsMade: false,
    desktopCompatibility: 'pending local acceptance', websocketAdapter: 'not implemented' };
}
export function normalizeModel(m) {
  if (typeof m?.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(m.model)) return null;
  if (!Array.isArray(m.supportedReasoningEfforts)) return null;
  const efforts = m.supportedReasoningEfforts.map(e => e?.reasoningEffort);
  if (!Array.isArray(efforts) || !efforts.length || efforts.some(e => !EFFORT_NAMES.includes(e)) ||
      !efforts.includes(m.defaultReasoningEffort)) return null;
  return { model: m.model, supportedEfforts: [...new Set(efforts)], baseline: m.defaultReasoningEffort };
}
/** Only initialize + model/list. No turns, tool calls, credentials API or file API. */
export async function probeModels(binary = 'codex', { args = ['app-server'], timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: nativeEnvironment() });
    const rl = createInterface({ input: child.stdout });
    let settled = false, nextId = 2, expected = 1, pages = 0, outputBytes = 0;
    const models = []; const cursors = new Set();
    const timer = setTimeout(() => finish(new CaeError('codex_probe_timeout')), timeoutMs);
    function finish(error) {
      if (settled) return; settled = true; clearTimeout(timer); rl.close(); child.stdin.end(); child.kill();
      const killTimer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1000);
      killTimer.unref(); child.once('exit', () => clearTimeout(killTimer));
      if (error) reject(error);
      else resolve({ schema: 1, observedAt: new Date().toISOString(), source: 'codex app-server model/list', models,
        skippedUnsupportedEntries: skipped, paidGenerations: 0 });
    }
    let skipped = 0;
    function send(msg) { if (!settled) child.stdin.write(JSON.stringify(msg) + '\n'); }
    function list(cursor) {
      if (++pages > 20) { finish(new CaeError('codex_probe_page_limit')); return; }
      expected = nextId++;
      send({ id: expected, method: 'model/list', params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } });
    }
    child.stdout.on('data', b => { outputBytes += b.length; if (outputBytes > 4 * 1024 * 1024) finish(new CaeError('codex_probe_output_limit')); });
    child.once('error', () => finish(new CaeError('codex_not_available')));
    child.stdin.on('error', () => finish(new CaeError('codex_probe_pipe_error')));
    child.once('exit', () => { if (!settled) finish(new CaeError('codex_probe_exited')); });
    rl.on('line', line => {
      if (settled) return;
      let msg; try { msg = JSON.parse(line); } catch { finish(new CaeError('codex_probe_invalid_json')); return; }
      if (!isObject(msg)) { finish(new CaeError('codex_probe_invalid_message')); return; }
      if (msg.id !== expected) return;
      if (msg.error) { finish(new CaeError('codex_probe_rpc_error')); return; }
      if (expected === 1) { send({ method: 'initialized', params: {} }); list(); return; }
      if (!Array.isArray(msg.result?.data)) { finish(new CaeError('codex_probe_invalid_models')); return; }
      for (const entry of msg.result.data) { const m = normalizeModel(entry); if (m) models.push(m); else ++skipped; }
      const cursor = msg.result.nextCursor;
      if (cursor === null || cursor === undefined) { finish(); return; }
      if (typeof cursor !== 'string' || cursors.has(cursor)) { finish(new CaeError('codex_probe_cursor_loop')); return; }
      cursors.add(cursor); list(cursor);
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'codex_adaptive_effort', version: '0.1.0-alpha.1' } } });
  });
}
export function codexArgs(config, auth, passthrough = []) {
  if (!['api', 'chatgpt'].includes(auth) || config.upstream.kind !== auth) throw new CaeError('auth_route_mismatch');
  if (!config.port) throw new CaeError('fixed_port_required_for_codex');
  const pairs = {
    model: config.model,
    model_reasoning_effort: config.baseline,
    model_provider: 'cae',
    'model_providers.cae.name': 'CAE experimental local effort controller',
    'model_providers.cae.base_url': `http://127.0.0.1:${config.port}/v1`,
    'model_providers.cae.wire_api': 'responses',
    'model_providers.cae.supports_websockets': false,
    'model_providers.cae.request_max_retries': 0,
    'model_providers.cae.stream_max_retries': 0,
    'model_providers.cae.env_http_headers': null,
  };
  if (auth === 'chatgpt') pairs['model_providers.cae.requires_openai_auth'] = true;
  else { pairs['model_providers.cae.requires_openai_auth'] = false; pairs['model_providers.cae.env_key'] = 'OPENAI_API_KEY'; }
  const overrides = Object.entries(pairs).flatMap(([key, value]) => ['-c', `${key}=${value === null ? '{"x-cae-token"="CAE_LOCAL_TOKEN"}' : JSON.stringify(value)}`]);
  // Desktop supplies root -c flags and app-server-local -c flags. Native CLI
  // discards the root config collection when the subcommand has its own.
  // Recognize the desktop prefix without mistaking an exec prompt or a config
  // value for a subcommand; other launch shapes keep their existing ordering.
  let command = 0;
  while (command < passthrough.length) {
    if (['-c', '--config'].includes(passthrough[command]) && command + 1 < passthrough.length) command += 2;
    else if (passthrough[command].startsWith('--config=')) ++command;
    else break;
  }
  if (passthrough[command] === 'app-server')
    return [...passthrough.slice(0, command + 1), ...overrides, ...passthrough.slice(command + 1)];
  return [...overrides, ...passthrough];
}
