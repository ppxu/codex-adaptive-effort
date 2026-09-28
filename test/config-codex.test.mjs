import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defaultConfig, validateConfig, loadConfig, readLocalToken } from '../src/config.mjs';
import { normalizeModel, probeModels, codexArgs, doctor, nativeEnvironment } from '../src/codex.mjs';
import { spawnSync } from 'node:child_process';
const c = () => defaultConfig('synthetic-model', ['low', 'medium', 'high'], 'high');
const fixture = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../bin/cae.mjs', import.meta.url));
function temp(t) { const p = mkdtempSync(join(tmpdir(), 'cae-test-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }

test('default config is shadow, separate baseline evaluator, no auto model', () => {
  assert.equal(c().mode, 'shadow'); assert.equal(c().judge.kind, 'baseline'); assert.equal(c().model, 'synthetic-model');
});
for (const [name, patch] of [ ['unknown field', { apiKey: 'synthetic' }], ['unsupported effort', { supportedEfforts: ['unlimited'] }],
  ['wrong baseline', { baseline: 'max' }], ['huge port', { port: 999999 }], ['redirect upstream', { upstream: { kind: 'api', baseUrl: 'https://other.example' } }],
  ['non-loopback mock', { upstream: { kind: 'mock', baseUrl: 'http://example.com:80' } }],
  ['unbounded lease', { lease: { maxGenerations: 50, ttlMs: 1000 } }], ['negative budget', { judge: { kind: 'typesafe', model: 'jev-latest', timeoutMs: 1000, maxCalls: -1 } }],
]) test('config rejects ' + name, () => assert.throws(() => validateConfig({ ...c(), ...patch })));
test('config paths resolve relative to config, not arbitrary CWD', t => {
  const p = temp(t); writeFileSync(join(p, 'config.json'), JSON.stringify(c()));
  assert.equal(loadConfig(join(p, 'config.json')).tokenFile, join(p, 'local.key'));
});
test('token permission and shape validation', t => {
  const p = join(temp(t), 'local.key'); writeFileSync(p, 'b'.repeat(64), { mode: 0o600 });
  assert.equal(readLocalToken(p), 'b'.repeat(64)); writeFileSync(p, 'too-short'); assert.throws(() => readLocalToken(p));
});
test('world-readable token refused on POSIX', { skip: process.platform === 'win32' }, t => {
  const p = join(temp(t), 'local.key'); writeFileSync(p, 'b'.repeat(64), { mode: 0o600 }); chmodSync(p, 0o644);
  assert.throws(() => readLocalToken(p));
});
test('token symlinks refused on POSIX', { skip: process.platform === 'win32' }, t => {
  const p = temp(t); writeFileSync(join(p, 'key'), 'b'.repeat(64), { mode: 0o600 }); symlinkSync(join(p, 'key'), join(p, 'link'));
  assert.throws(() => readLocalToken(join(p, 'link')));
});
test('model discovery handles malformed metadata without throwing', () => {
  assert.equal(normalizeModel({ model: 'synthetic', supportedReasoningEfforts: 42 }), null);
  assert.equal(normalizeModel({ model: 'synthetic', supportedReasoningEfforts: [null] }), null);
});
test('fake app-server probe observes supported efforts with no generation', async () => {
  const result = await probeModels(process.execPath, { args: [fixture] });
  assert.deepEqual(result.models[0].supportedEfforts, ['low', 'high']); assert.equal(result.paidGenerations, 0);
});
test('native environment strips evaluator key without changing native route or caller environment', () => {
  const source = { TYPESAFE_API_KEY: 'synthetic-jev', PATH: 'synthetic-path', OPENAI_API_KEY: 'synthetic-native' };
  assert.deepEqual(nativeEnvironment(source), { PATH: source.PATH, OPENAI_API_KEY: source.OPENAI_API_KEY });
  assert.equal(source.TYPESAFE_API_KEY, 'synthetic-jev');
});
test('model probe does not transmit evaluator key to actual native child process', () => {
  const code = `import {probeModels} from './src/codex.mjs';
    await probeModels(process.execPath, {args:[process.argv[1], 'reject-jev-key']});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, fixture], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, TYPESAFE_API_KEY: 'synthetic-only-key' },
  });
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
test('fake app-server pagination completes', async () => {
  const result = await probeModels(process.execPath, { args: [fixture, 'pages'] }); assert.equal(result.models.length, 2);
});
test('probe with ultra survives capability initialization and launch without widening efforts', async t => {
  const result = await probeModels(process.execPath, { args: [fixture, 'ultra'] });
  assert.equal(result.skippedUnsupportedEntries, 0);
  assert.deepEqual(result.models, [{ model: 'synthetic-model', baseline: 'medium',
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] }]);
  const p = temp(t), capture = join(p, 'capabilities.json'), target = join(p, 'isolated');
  writeFileSync(capture, JSON.stringify(result));
  const init = spawnSync(process.execPath, [cli, 'init', '--dir', target, '--model', 'synthetic-model',
    '--auth', 'chatgpt', '--capabilities', capture], { cwd: p, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const loaded = loadConfig(join(target, 'config.json'));
  assert.equal(loaded.baseline, 'medium');
  assert.deepEqual(loaded.supportedEfforts, result.models[0].supportedEfforts);
  assert(codexArgs({ ...loaded, baseline: 'ultra' }, 'chatgpt').includes('model_reasoning_effort="ultra"'));
});
test('ultra support retains rejection of unknown efforts and absent model capabilities', () => {
  assert.equal(normalizeModel({ model: 'synthetic-model', defaultReasoningEffort: 'high',
    supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'future' }] }), null);
  assert.throws(() => validateConfig({ ...c(), baseline: 'ultra' }), /config_baseline/);
  assert.equal(defaultConfig('synthetic-model', ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'], 'ultra').baseline, 'ultra');
});
test('unsupported model metadata counted, not silently fabricated', async () => {
  const result = await probeModels(process.execPath, { args: [fixture, 'bad-model'] }); assert.equal(result.skippedUnsupportedEntries, 1); assert.deepEqual(result.models, []);
});
for (const [scenario, code] of [['invalid', 'codex_probe_invalid_json'], ['rpc-error', 'codex_probe_rpc_error'], ['loop', 'codex_probe_cursor_loop'], ['silent', 'codex_probe_timeout']]) {
  test('probe safely stops: ' + scenario, async () => {
    await assert.rejects(probeModels(process.execPath, { args: [fixture, scenario], timeoutMs: scenario === 'silent' ? 100 : 3000 }), e => e.code === code);
  });
}
test('missing native binary is reported without consulting credentials', async () => {
  await assert.rejects(probeModels('cae-nonexistent-codex-test-binary'), e => e.code === 'codex_not_available');
  assert.equal(doctor('cae-nonexistent-codex-test-binary').codexFound, false);
});
test('launcher enforces explicit billing path and disables retry/websocket', () => {
  const v = c(); v.upstream.kind = 'chatgpt'; const args = codexArgs(v, 'chatgpt').join(' ');
  assert(args.includes('requires_openai_auth=true')); assert(args.includes('supports_websockets=false'));
  assert(args.includes('request_max_retries=0')); assert(!args.includes('OPENAI_API_KEY'));
  assert.throws(() => codexArgs(v, 'api')); assert(!args.includes('approval_policy')); assert(!args.includes('sandbox_mode'));
});
test('API launch only selected explicitly and does not contain a secret', () => {
  const args = codexArgs(c(), 'api'); assert(args.join(' ').includes('env_key="OPENAI_API_KEY"'));
  assert(args.join(' ').includes('CAE_LOCAL_TOKEN')); assert(!args.join(' ').includes('auth.json'));
});
test('CLI init creates isolated config and refuses overwriting', t => {
  const p = temp(t), target = join(p, 'isolated');
  const args = [cli, 'init', '--dir', target, '--model', 'synthetic-model', '--auth', 'chatgpt', '--efforts', 'low,high', '--baseline', 'high'];
  assert.equal(spawnSync(process.execPath, args, { cwd: p }).status, 0);
  const config = JSON.parse(readFileSync(join(target, 'config.json'))); assert.equal(config.upstream.kind, 'chatgpt'); assert.equal(config.mode, 'shadow');
  assert.equal(spawnSync(process.execPath, args, { cwd: p }).status, 1);
  assert.equal(readLocalToken(join(target, 'local.key')).length, 64);
});
test('CLI requires auth rather than silently choosing API spending', t => {
  const r = spawnSync(process.execPath, [cli, 'init', '--model', 'synthetic-model', '--efforts', 'low,high', '--baseline', 'high'], { cwd: temp(t), encoding: 'utf8' });
  assert.equal(r.status, 1); assert(r.stderr.includes('init_requires_model_and_auth'));
});

test('desktop app-server keeps CAE overrides in the subcommand config scope', t => {
  const p = temp(t), config = join(p, 'config.json'), value = c();
  value.upstream.kind = 'chatgpt'; writeFileSync(config, JSON.stringify(value));
  for (const prefix of [[], ['-c', 'features.code_mode_host=true'], ['--config=features.code_mode_host=true']]) {
    const desktop = [...prefix, 'app-server', '--analytics-default-enabled', '-c', 'plugins.example.enabled=true'];
    const r = spawnSync(process.execPath, [cli, 'launch-args', '--config', config, '--auth', 'chatgpt', '--', ...desktop], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const { args } = JSON.parse(r.stdout);
    // Native app-server uses its own -c collection when it has overrides.
    const effective = args.slice(args.indexOf('app-server') + 1);
    assert(effective.includes('model_provider="cae"'));
    assert(effective.includes('model="synthetic-model"'));
    assert(effective.includes('model_providers.cae.requires_openai_auth=true'));
    assert(effective.includes('plugins.example.enabled=true'));
    assert.deepEqual(args.slice(0, prefix.length), prefix);
  }
});

test('launcher does not confuse config values or exec prompts with app-server', t => {
  const p = temp(t), config = join(p, 'config.json'); writeFileSync(config, JSON.stringify(c()));
  for (const passthrough of [['exec', 'app-server'], ['-c', 'app-server', 'exec', 'hello'], ['--', 'app-server']]) {
    const r = spawnSync(process.execPath, [cli, 'launch-args', '--config', config, '--auth', 'api', '--', ...passthrough], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).args, [...codexArgs(c(), 'api'), ...passthrough]);
  }
});
