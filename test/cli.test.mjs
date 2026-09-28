import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';
import { config, body, completedSse, eventually } from './helpers.mjs';
const runFile = promisify(execFile), cli = fileURLToPath(new URL('../bin/cae.mjs', import.meta.url));

test('actual CLI serve/status/control/lock/report/stop pipeline is executable', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cae-cli-')); let child; let stderr = '';
  const observed = [];
  const upstream = http.createServer(async (req, res) => {
    const bytes = []; for await (const c of req) bytes.push(c); observed.push(JSON.parse(Buffer.concat(bytes)));
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(completedSse());
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const c = config({ mode: 'shadow', port: 0, upstream: { kind: 'mock', baseUrl: `http://127.0.0.1:${upstream.address().port}/v1` } });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(c)); writeFileSync(join(dir, 'local.key'), 'c'.repeat(64), { mode: 0o600 });
  child = spawn(process.execPath, [cli, 'serve', '--config', 'config.json'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { stderr += b; });
  await eventually(() => { try { return !!JSON.parse(output).listening; } catch { return false; } }, 3000);
  const port = Number(JSON.parse(output).listening.split(':')[1]);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ ...c, port }));
  const run = async (...args) => JSON.parse((await runFile(process.execPath, [cli, ...args, '--config', 'config.json'], { cwd: dir, timeout: 5000 })).stdout);
  const status = await run('status'); assert.equal(status.mode, 'shadow'); assert.equal(status.auditHealthy, true);
  await run('control', 'auto'); await run('lock', 'low');
  const r = await fetch(`http://127.0.0.1:${port}/v1/responses`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cae-token': 'c'.repeat(64) }, body: JSON.stringify(body()) });
  assert.equal(r.status, 200); await r.text(); assert.equal(observed[0].reasoning.effort, 'low');
  const report = await run('report'); assert.equal(report.changedRequests, 1); assert.equal(report.measuredSavings, null);
  await run('unlock'); await run('control', 'off'); assert.equal((await run('status')).mode, 'off');
  const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
  assert.equal(stderr, ''); assert(!output.includes('c'.repeat(64)));
});
test('CLI Jev enable is separately gated before any provider request', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cae-cli-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const c = config(); c.judge.kind = 'typesafe'; writeFileSync(join(dir, 'config.json'), JSON.stringify(c));
  await assert.rejects(runFile(process.execPath, [cli, 'serve', '--config', 'config.json', '--enable-upstream'], { cwd: dir }), e => e.stderr.includes('jev_external_processing_not_enabled'));
});
