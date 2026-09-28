import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResponseObserver } from '../src/stream.mjs';
import { Audit, usageOf, report } from '../src/audit.mjs';
import { completedSse } from './helpers.mjs';

test('UTF8 SSE fragmented byte-by-byte yields exact terminal usage', () => {
  const o = new ResponseObserver('text/event-stream'); for (const byte of completedSse()) o.push(Buffer.from([byte]));
  assert.deepEqual(o.end(), { completed: true, terminal: 'response.completed', inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, reasoningTokens: 8 });
});
test('mismatched response id is not accepted as completed', () => {
  const o = new ResponseObserver('text/event-stream');
  o.push(Buffer.from('data: {"type":"response.created","response":{"id":"a"}}\n\ndata: {"type":"response.completed","response":{"id":"b"}}\n\n'));
  assert.equal(o.end().completed, false);
});
test('DONE or text alone cannot establish successful completion', () => {
  const o = new ResponseObserver('text/event-stream'); o.push(Buffer.from('data: [DONE]\n\n')); const r = o.end();
  assert.equal(r.completed, false); assert.equal(r.outputTokens, null);
});
test('large intermediate events do not stop observing later small terminal', () => {
  const o = new ResponseObserver('text/event-stream', 500);
  for (let i = 0; i < 10; ++i) o.push(Buffer.from('a'.repeat(200))); o.push(Buffer.from('\n\n'));
  o.push(completedSse()); assert.equal(o.end().completed, true);
});
test('incomplete response may report usage but cannot commit a lease', () => {
  const o = new ResponseObserver('text/event-stream'); o.push(Buffer.from('data: {"type":"response.incomplete","response":{"usage":{"output_tokens":5}}}\n\n'));
  const r = o.end(); assert.equal(r.completed, false); assert.equal(r.outputTokens, 5);
});
test('missing or invalid counters are null, not zero', () => {
  assert.equal(usageOf({ usage: { input_tokens: -1, output_tokens: true } }).inputTokens, null);
  assert.equal(usageOf({ usage: { output_tokens: true } }).outputTokens, null);
  assert.equal(usageOf({ usage: { output_tokens: 0 } }).outputTokens, 0);
});
test('usage report excludes unknown counters from sums and does not claim savings', () => {
  const r = report([null, 'bad', { event: 'upstream_outcome', completed: true, inputTokens: 100, outputTokens: 20, reasoningTokens: 8 },
    { event: 'upstream_outcome', completed: false }, { event: 'request_sent', changed: true }]);
  assert.equal(r.measuredSavings, null); assert.equal(r.requests, 2); assert.equal(r.changedRequests, 1);
  assert.equal(r.tokenObservations.outputTokens.observedSum, 20); assert.equal(r.tokenObservations.outputTokens.unknownRequests, 1);
  assert.equal(r.tokenObservations.cachedInputTokens.observedSum, null);
});
test('audit writes allowlisted metadata only, with restrictive file mode', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cae-audit-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'events.jsonl'), a = new Audit(file);
  a.emit({ event: 'decision', effort: 'low', authorization: 'PRIVATE AUTH', prompt: 'PRIVATE PROMPT', state: { secret: 'PRIVATE STATE' }, sessionId: 'PRIVATE SESSION' }); a.close();
  const text = readFileSync(file, 'utf8'); assert(!text.includes('PRIVATE')); assert.equal(JSON.parse(text).effort, 'low');
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o077, 0);
});
test('logging failure does not throw into model stream', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cae-audit-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = new Audit(join(dir, 'log')); a.close(); assert.doesNotThrow(() => a.emit({ event: 'decision' })); assert.equal(a.failed, true);
});
test('audit refuses symlink on POSIX', { skip: process.platform === 'win32' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'cae-audit-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'target'), 'untouched'); symlinkSync(join(dir, 'target'), join(dir, 'link'));
  assert.throws(() => new Audit(join(dir, 'link'))); assert.equal(readFileSync(join(dir, 'target'), 'utf8'), 'untouched');
});
test('malformed completion without response identity/status is not trusted', () => {
  const o = new ResponseObserver('text/event-stream'); o.push(Buffer.from('data: {"type":"response.completed"}\n\n'));
  assert.equal(o.end().completed, false);
});
test('evaluator calls include failed attempts with unknown usage', () => {
  const r = report([{ event: 'judge_started', judgeKind: 'typesafe' },
    { event: 'judge_finished', judgeKind: 'typesafe', judgeMs: 15, judgeInputTokens: null, reason: 'cancelled' }]);
  assert.equal(r.evaluator.externalAttempts, 1); assert.equal(r.evaluator.unknownInputUsage, 1); assert.equal(r.evaluator.observedInputTokens, null);
});
