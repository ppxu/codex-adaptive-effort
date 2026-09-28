// Synthetic app-server fixture only. Never reads auth or contacts a provider.
import { createInterface } from 'node:readline';
const scenario = process.argv[2] ?? 'ok';
const rl = createInterface({ input: process.stdin });
let initialized = false, listed = false;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
rl.on('line', line => {
  const m = JSON.parse(line);
  if (scenario === 'silent') return;
  if (m.method === 'initialize') {
    if (scenario === 'invalid') { process.stdout.write('not-json\n'); return; }
    send({ id: m.id, result: { userAgent: 'synthetic' } }); return;
  }
  if (m.method === 'initialized') { initialized = true; return; }
  if (m.method !== 'model/list' || !initialized) { send({ id: m.id, error: { code: -1 } }); return; }
  const model = { model: 'synthetic-model', defaultReasoningEffort: 'high',
    supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] };
  if (scenario === 'rpc-error') { send({ id: m.id, error: { code: -1, message: 'private native error' } }); return; }
  if (scenario === 'bad-model') { send({ id: m.id, result: { data: [{ model: 'synthetic', supportedReasoningEfforts: 42 }], nextCursor: null } }); return; }
  if (scenario === 'loop') { send({ id: m.id, result: { data: [], nextCursor: 'same' } }); return; }
  if (scenario === 'pages' && !listed) { listed = true; send({ id: m.id, result: { data: [model], nextCursor: 'next' } }); return; }
  send({ method: 'irrelevant/notification', params: {} });
  send({ id: m.id, result: { data: [model], nextCursor: null } });
});
