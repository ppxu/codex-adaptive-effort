import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRequest, canContinue, redact } from '../src/context.mjs';
import { body, append } from './helpers.mjs';

test('bounded state keeps Chinese follow-up context, not just latest short reply', () => {
  const b = body({ input: [{ role: 'user', content: '调查多文件状态的一致性问题' },
    { role: 'assistant', content: '准备检查重启后的行为' }, { role: 'user', content: '继续' }] });
  const s = inspectRequest(b).state;
  assert.equal(s.task, '调查多文件状态的一致性问题'); assert.equal(s.latestUser, '继续');
});
test('bounded evaluator never receives system instructions or encrypted reasoning', () => {
  const b = body({ instructions: 'PRIVATE SYSTEM', tools: [{ name: 'PRIVATE TOOL' }], input: [
    { role: 'system', content: 'PRIVATE MESSAGE' }, { type: 'reasoning', encrypted_content: 'PRIVATE REASONING' },
    { role: 'user', content: '公开任务' }] });
  const s = inspectRequest(b); assert.equal(s.eligible, true);
  assert(!JSON.stringify(s.state).includes('PRIVATE')); assert.equal(b.input[1].encrypted_content, 'PRIVATE REASONING');
});
test('large evidence stays bounded in characters and records omissions', () => {
  const tools = Array.from({ length: 10 }, (_, i) => ({ type: 'function_call_output', call_id: String(i), output: '中文'.repeat(20000) }));
  const s = inspectRequest(body({ input: [{ role: 'user', content: '长'.repeat(10000) }, ...tools] }));
  assert.equal(s.state.omittedToolCalls, 7); assert(s.stateChars < 7000);
});
test('explicit errors invalidate leases; text saying error is not a synthetic failure', () => {
  const b = body(); const s = inspectRequest(b);
  const clean = inspectRequest(append(b, { type: 'function_call_output', output: 'string about an error' }));
  const err = inspectRequest(append(b, { type: 'function_call_output', output: '{"exit_code":1}' }));
  assert(canContinue(s, clean)); assert(!canContinue(s, err));
});
test('only strict full-history extension can reuse a decision', () => {
  const b = body(); const s = inspectRequest(b);
  assert(!canContinue(s, inspectRequest(b)));
  assert(!canContinue(s, inspectRequest(append(b, { role: 'user', content: '新任务' }))));
  assert(!canContinue(s, inspectRequest(append({ ...b, instructions: 'changed' }))));
  assert(canContinue(s, inspectRequest(append(b))));
});
test('well-known secret patterns redacted without mutating executor history', () => {
  const text = 'Bearer test-token /Users/private/work api_key=abc123 ghp_abcdefghijklmnopqrstuvwxyz';
  const b = body({ input: text }); const state = inspectRequest(b).state;
  for (const s of ['test-token', '/Users/private', 'abc123', 'ghp_abcdefghijklmnopqrstuvwxyz']) assert(!JSON.stringify(state).includes(s));
  assert.equal(b.input, text); assert(redact(text).includes('[REDACTED'));
});
test('image evidence bypasses rather than pretending text is complete', () => {
  const b = body({ input: [{ role: 'user', content: [{ type: 'input_text', text: '修复这个' }, { type: 'input_image', image_url: 'data:image/png;base64,synthetic' }] }] });
  assert.equal(inspectRequest(b).eligible, false);
});
for (const extra of [{ background: true }, { truncation: 'auto' }, { conversation: 'synthetic' },
  { context_management: [{ type: 'compaction', compact_threshold: 1000 }] }, { input: [] }]) {
  test('unsupported context is explicitly bypassed: ' + JSON.stringify(extra), () => assert.equal(inspectRequest(body(extra)).eligible, false));
}
