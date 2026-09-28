import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defaultConfig, validateConfig, loadConfig, readLocalToken } from '../src/config.mjs';
import { normalizeModel, probeModels, codexArgs, doctor } from '../src/codex.mjs';
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
test('fake app-server pagination completes', async () => {
  const result = await probeModels(process.execPath, { args: [fixture, 'pages'] }); assert.equal(result.models.length, 2);
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
