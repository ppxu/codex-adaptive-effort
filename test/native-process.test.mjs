import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { waitForNative } from '../src/codex.mjs';

test('native process preserves exit status and releases signal handlers', async () => {
  const signals = new EventEmitter();
  const child = spawn(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'ignore' });
  assert.equal(await waitForNative(child, { signals }), 7);
  assert.equal(signals.listenerCount('SIGINT'), 0); assert.equal(signals.listenerCount('SIGTERM'), 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) test(`native process forwards ${signal} to its owned child`, async t => {
  const signals = new EventEmitter();
  const child = spawn(process.execPath, ['-e', 'process.send("ready"); setInterval(() => {}, 1000);'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const exit = waitForNative(child, { signals });
  await once(child, 'message'); signals.emit(signal);
  assert.notEqual(await exit, 0);
  assert(child.exitCode !== null || child.signalCode !== null);
  assert.equal(signals.listenerCount(signal), 0);
});

test('native process termination escalates when a POSIX child ignores SIGTERM', { skip: process.platform === 'win32' }, async t => {
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); process.send("ready"); setInterval(() => {}, 1000);'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const signals = new EventEmitter(), exit = waitForNative(child, { signals, killTimeoutMs: 50 });
  await once(child, 'message'); signals.emit('SIGTERM'); signals.emit('SIGTERM');
  await exit; assert.equal(child.signalCode, 'SIGKILL'); assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('failed native spawn returns a sanitized error and releases signal handlers', async () => {
  const signals = new EventEmitter();
  await assert.rejects(waitForNative(spawn('cae-synthetic-missing-binary', [], { stdio: 'ignore' }), { signals }), /codex_not_available/);
  assert.equal(signals.listenerCount('SIGINT'), 0); assert.equal(signals.listenerCount('SIGTERM'), 0);
});
