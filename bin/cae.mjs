#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { defaultConfig, loadConfig, readLocalToken } from '../src/config.mjs';
import { CaeError } from '../src/util.mjs';
import { BaselineJudge, TypeSafeJudge } from '../src/judge.mjs';
import { Audit, report } from '../src/audit.mjs';
import { startProxy } from '../src/proxy.mjs';
import { doctor, probeModels, codexArgs } from '../src/codex.mjs';

const HELP = `Codex Adaptive Effort 0.1.0-alpha.1 (Node >=22.16; no dependencies)

  cae doctor [--codex PATH]                 No credentials or network read by CAE
  cae probe [--codex PATH]                  Native initialize + model/list only
  cae init --model ID --auth chatgpt|api --capabilities FILE [--baseline EFFORT]
  cae init --model ID --auth chatgpt|api --efforts low,medium,high --baseline high
  cae serve --enable-upstream [--enable-jev] Start local proxy (foreground)
  cae status                               Authenticated local state
  cae control off|shadow|auto               Change next unsent request policy
  cae lock high / cae unlock               Explicit instance-wide lock
  cae codex --auth chatgpt|api -- [ARGS]     One-off launch, no config.toml writes
  cae launch-args --auth chatgpt|api         Print non-secret argv for inspection
  cae desktop start --auth chatgpt --enable-upstream [--model ID] [--enable-jev [--allow-jev-auto]]
  cae desktop status / desktop stop        Isolated macOS desktop instance
  cae report                              Observed usage, not savings claims

Shared: --config .cae/config.json; init: --dir .cae
serve Jev requires config judge.kind=typesafe, TYPESAFE_API_KEY and --enable-jev.
Desktop --enable-jev is process-only, shadow/off only, at most 8 evaluations.
Add --allow-jev-auto to permit control auto; startup still requires shadow/off.
Desktop --jev-timeout-ms 1500|2000 overrides only this process's Jev timeout.
An external upstream requires --enable-upstream and normal Codex auth.
Default is SHADOW with a baseline-only evaluator, not a complexity classifier.
`;
function print(value) { console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
async function localCall(c, path, body) {
  const response = await fetch(`http://127.0.0.1:${c.port}${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(3000),
    headers: { 'x-cae-token': readLocalToken(c.tokenFile), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new CaeError(`local_http_${response.status}`);
  return response.json();
}
async function main() {
  const input = process.argv.slice(2), dash = input.indexOf('--');
  const passthrough = dash < 0 ? [] : input.slice(dash + 1);
  const { values: v, positionals: p } = parseArgs({ args: dash < 0 ? input : input.slice(0, dash),
    allowPositionals: true, strict: true, options: {
      help: { type: 'boolean', short: 'h' }, config: { type: 'string', default: '.cae/config.json' },
      dir: { type: 'string', default: '.cae' }, model: { type: 'string' }, efforts: { type: 'string' },
      baseline: { type: 'string' }, auth: { type: 'string' }, capabilities: { type: 'string' },
      codex: { type: 'string', default: 'codex' }, 'enable-upstream': { type: 'boolean' }, 'enable-jev': { type: 'boolean' },
      app: { type: 'string' },
      'allow-jev-auto': { type: 'boolean' },
      'jev-timeout-ms': { type: 'string' },
    } });
  const command = p[0];
  if (!command || v.help) { print(HELP); return; }
  if (v['allow-jev-auto'] && (command !== 'desktop' || p[1] !== 'start')) throw new CaeError('desktop_auto_start_only');
  if (v['jev-timeout-ms'] !== undefined && (command !== 'desktop' || p[1] !== 'start')) throw new CaeError('desktop_timeout_start_only');
  if (v['jev-timeout-ms'] !== undefined && !['1500', '2000'].includes(v['jev-timeout-ms'])) throw new CaeError('desktop_invalid_jev_timeout');
  if (command === 'desktop') {
    if (p.length !== 2 || passthrough.length) throw new CaeError('desktop_invalid_arguments');
    if (input.some(x => x === '--codex' || x.startsWith('--codex='))) throw new CaeError('desktop_uses_verified_bundled_cli');
    const { startDesktop, desktopControl } = await import('../src/desktop.mjs');
    const explicitConfig = input.some(x => x === '--config' || x.startsWith('--config='));
    const configPath = explicitConfig ? v.config : '.cae/desktop/config.json';
    if (p[1] === 'start') {
      const desktop = await startDesktop({ configPath, model: v.model, baseline: v.baseline, auth: v.auth,
        enableUpstream: v['enable-upstream'], enableJev: v['enable-jev'], allowJevAuto: v['allow-jev-auto'],
        jevTimeoutMs: v['jev-timeout-ms'] === undefined ? undefined : Number(v['jev-timeout-ms']),
        appPath: v.app, onState: print });
      print(await desktop.done); return;
    }
    if (!['status', 'stop'].includes(p[1])) throw new CaeError('desktop_unknown_action');
    print(await desktopControl(configPath, p[1], { timeoutMs: p[1] === 'stop' ? 15000 : 5000 })); return;
  }
  if (command === 'doctor') { print(doctor(v.codex)); return; }
  if (command === 'probe') { print(await probeModels(v.codex)); return; }
  if (command === 'init') {
    if (!v.model || !['api', 'chatgpt'].includes(v.auth)) throw new CaeError('init_requires_model_and_auth');
    let efforts = v.efforts?.split(','), baseline = v.baseline, capabilitySource;
    if (v.capabilities) {
      const data = JSON.parse(readFileSync(v.capabilities, 'utf8'));
      const entry = data.models?.find(m => m.model === v.model);
      if (!entry) throw new CaeError('model_missing_from_capabilities');
      efforts = entry.supportedEfforts; baseline ??= entry.baseline;
      capabilitySource = `${data.source ?? 'provided capture'} at ${data.observedAt ?? 'unknown time'}; refresh after client upgrades`;
    }
    if (!efforts || !baseline) throw new CaeError('init_requires_capabilities_or_efforts_and_baseline');
    const config = defaultConfig(v.model, efforts, baseline); config.upstream.kind = v.auth;
    if (capabilitySource) config.capabilitySource = capabilitySource;
    const dir = resolve(v.dir);
    mkdirSync(dir, { mode: 0o700 }); // EEXIST intentionally refuses to overwrite.
    writeFileSync(resolve(dir, 'local.key'), randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
    writeFileSync(resolve(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    print('Created isolated CAE configuration. No Codex configuration or login files were touched.'); return;
  }
  const c = loadConfig(v.config);
  if (command === 'serve') {
    let judge;
    if (c.judge.kind === 'typesafe') {
      if (!v['enable-jev']) throw new CaeError('jev_external_processing_not_enabled');
      judge = new TypeSafeJudge({ apiKey: process.env.TYPESAFE_API_KEY, model: c.judge.model });
    } else judge = new BaselineJudge();
    const audit = new Audit(c.logFile);
    let proxy;
    try { proxy = await startProxy(c, { token: readLocalToken(c.tokenFile), judge,
      emit: record => audit.emit(record), auditHealthy: () => !audit.failed, allowUpstream: v['enable-upstream'] === true }); }
    catch (e) { audit.close(); throw e; }
    print({ listening: `127.0.0.1:${proxy.port}`, mode: c.mode, judge: c.judge.kind,
      upstream: c.upstream.kind, credentialsLogged: false, note: 'Foreground service. Stop and relaunch normal Codex to bypass it.' });
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await proxy.close(); audit.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop); return;
  }
  if (command === 'status') { print(await localCall(c, '/health')); return; }
  if (command === 'control') { print(await localCall(c, '/control', { mode: p[1] })); return; }
  if (command === 'lock') { print(await localCall(c, '/control', { lockedEffort: p[1] })); return; }
  if (command === 'unlock') { print(await localCall(c, '/control', { lockedEffort: null })); return; }
  if (command === 'report') {
    let text; try { text = readFileSync(c.logFile, 'utf8'); } catch { throw new CaeError('cannot_read_log'); }
    const records = []; let malformedLines = 0;
    for (const line of text.split('\n').filter(Boolean)) { try { records.push(JSON.parse(line)); } catch { ++malformedLines; } }
    print({ ...report(records), malformedLines }); return;
  }
  if (['codex', 'launch-args'].includes(command)) {
    const args = codexArgs(c, v.auth, passthrough);
    if (command === 'launch-args') { print({ command: v.codex, args, requiredEnvironmentNames: ['CAE_LOCAL_TOKEN', ...(v.auth === 'api' ? ['OPENAI_API_KEY'] : [])] }); return; }
    const health = await localCall(c, '/health');
    if (!health.ok || health.model !== c.model) throw new CaeError('proxy_health_mismatch');
    if (v.auth === 'api' && !process.env.OPENAI_API_KEY) throw new CaeError('missing_openai_api_key');
    const env = { ...process.env, CAE_LOCAL_TOKEN: readLocalToken(c.tokenFile) };
    delete env.TYPESAFE_API_KEY;
    const child = spawn(v.codex, args, { env, stdio: 'inherit', shell: false });
    child.once('error', () => { console.error('CAE: codex_not_available'); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 1; }); return;
  }
  throw new CaeError('unknown_command');
}
main().catch(error => {
  // Do not echo upstream bodies, environment, argument values or native stderr.
  console.error(`CAE: ${error instanceof CaeError ? error.code : 'command_failed_check_arguments_and_local_paths'}`);
  process.exitCode = 1;
});
