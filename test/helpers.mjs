import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { defaultConfig } from '../src/config.mjs';
import { startProxy } from '../src/proxy.mjs';

export const MODEL = 'synthetic-model';
export const body = (extra = {}) => ({ model: MODEL, reasoning: { effort: 'high', summary: 'auto' },
  input: [{ role: 'user', content: '修正这个已知位置的拼写错误，保留其他内容。' }],
  stream: true, store: false, service_tier: 'default', prompt_cache_key: 'synthetic-cache', ...extra });
export function append(b, item = { type: 'function_call_output', call_id: 'synthetic_call', output: 'ok' }) {
  return { ...b, input: [...b.input, item] };
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function eventually(check, timeout = 1000) {
  const start = Date.now();
  while (!check()) { if (Date.now() - start > timeout) throw new Error('condition did not become true'); await sleep(5); }
}
export const fakeJudge = (effort = 'low', lease = 3) => ({
  calls: 0, seen: [], async evaluate(input) { ++this.calls; this.seen.push(input); return { effort, lease, confidence: 0.75 }; },
});
export function config(extra = {}) {
  return { ...defaultConfig(MODEL, ['low', 'medium', 'high'], 'high'), mode: 'auto', ...extra };
}
export function completedSse(id = 'resp_synthetic') {
  return Buffer.from([
    { type: 'response.created', response: { id, status: 'in_progress' } },
    { type: 'response.output_text.delta', delta: '你好，测试通过。' },
    { type: 'response.completed', response: { id, status: 'completed', usage: { input_tokens: 100,
      input_tokens_details: { cached_tokens: 40 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 8 } } } },
  ].map(e => 'event: ' + e.type + '\r\ndata: ' + JSON.stringify(e) + '\r\n\r\n').join(''));
}
export async function harness(t, { cfg = {}, judge = fakeJudge(), handler } = {}) {
  const records = [], events = []; let hit = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const b of req) chunks.push(b);
      const record = { bytes: Buffer.concat(chunks), headers: req.headers, url: req.url, method: req.method };
      records.push(record); ++hit;
      if (handler) await handler(req, res, record, hit);
      else {
        const bytes = completedSse();
        res.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': 'synthetic-upstream' });
        for (let i = 0; i < bytes.length; i += 7) res.write(bytes.subarray(i, i + 7));
        res.end();
      }
    } catch { res.destroy(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const c = config({ ...cfg, port: 0, upstream: { kind: 'mock', baseUrl: `http://127.0.0.1:${server.address().port}/v1` } });
  const token = randomBytes(32).toString('hex');
  const proxy = await startProxy(c, { token, judge, emit: event => events.push(event) });
  const base = `http://127.0.0.1:${proxy.port}`;
  const headers = { 'content-type': 'application/json', 'x-cae-token': token, authorization: 'Bearer synthetic-upstream-token', 'session_id': 'synthetic-session' };
  const api = {
    proxy, server, records, events, config: c, judge, token, base, headers,
    async request(value = body(), opts = {}) {
      return fetch(base + (opts.path ?? '/v1/responses'), { method: opts.method ?? 'POST',
        headers: { ...headers, ...opts.headers }, body: (opts.method === 'GET') ? undefined : typeof value === 'string' ? value : JSON.stringify(value),
        signal: opts.signal });
    },
    async close() { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
  if (t) t.after(() => api.close());
  return api;
}
