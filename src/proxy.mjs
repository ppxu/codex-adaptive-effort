import http from 'node:http';
import https from 'node:https';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CaeError, equalSecret, isObject, parseJson, checkAbort } from './util.mjs';
import { validateConfig, upstreamBase } from './config.mjs';
import { Controller } from './controller.mjs';
import { ResponseObserver } from './stream.mjs';

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
export function forwardedHeaders(headers, response = false) {
  const remove = new Set(HOP);
  for (const name of String(headers.connection ?? '').split(',')) remove.add(name.trim().toLowerCase());
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (value === undefined || remove.has(key) || key.startsWith('x-cae-')) continue;
    if (['host', 'content-length', 'cookie', 'set-cookie', 'origin', 'referer', 'forwarded'].includes(key) || key.startsWith('x-forwarded-')) continue;
    if (!response && (key.startsWith('sec-') || key.startsWith('proxy-'))) continue;
    result[key] = value;
  }
  if (!response) result['accept-encoding'] = 'identity';
  return result;
}
function json(res, status, data) {
  if (res.destroyed || res.headersSent) return;
  const bytes = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length, 'cache-control': 'no-store' });
  res.end(bytes);
}
async function readBody(req, limit) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > limit) { req.resume(); throw new CaeError('request_too_large', 413); }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const timer = setTimeout(() => finish(new CaeError('request_body_timeout', 408)), 15000);
    function cleanup() {
      clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', abort); req.off('error', error);
    }
    function finish(err, result) { cleanup(); if (err) { req.resume(); reject(err); } else resolve(result); }
    function data(chunk) {
      size += chunk.length;
      if (size > limit) finish(new CaeError('request_too_large', 413));
      else chunks.push(chunk);
    }
    function end() { finish(null, Buffer.concat(chunks)); }
    function abort() { finish(new CaeError('cancelled', 499)); }
    function error() { finish(new CaeError('request_read_error')); }
    req.on('data', data); req.once('end', end); req.once('aborted', abort); req.once('error', error);
  });
}
export async function startProxy(config, { token, judge, emit = () => {}, allowUpstream = false, auditHealthy = () => true, shadowOnly = false } = {}) {
  const c = validateConfig(config);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new CaeError('invalid_local_token');
  if (c.upstream.kind !== 'mock' && !allowUpstream) throw new CaeError('upstream_not_enabled');
  const controller = new Controller(c, judge, { emit, shadowOnly });
  const sessionSalt = randomBytes(32);
  const aborters = new Set(); let port; let inflight = 0;
  const server = http.createServer(async (req, res) => {
    const aborter = new AbortController(); aborters.add(aborter);
    const close = () => { if (!res.writableFinished) aborter.abort(); };
    res.once('close', close); req.once('aborted', () => aborter.abort());
    let tx; let outcome; const started = Date.now(); const id = randomUUID();
    try {
      // Native Node fetch adds sec-fetch-mode; browsers also supply Origin or
      // the site/destination metadata. Token and Host checks remain mandatory.
      if (req.headers.origin !== undefined || ['sec-fetch-site', 'sec-fetch-dest', 'sec-fetch-user'].some(k => req.headers[k] !== undefined))
        throw new CaeError('browser_requests_forbidden', 403);
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) throw new CaeError('invalid_host', 403);
      if (!equalSecret(req.headers['x-cae-token'], token)) throw new CaeError('local_auth_required', 401);
      if (inflight >= 64) throw new CaeError('too_many_requests', 429);
      ++inflight;
      try {
        if (!req.url.startsWith('/') || req.url.startsWith('//')) throw new CaeError('invalid_path', 404);
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/health' && req.method === 'GET') { json(res, 200, { ok: true, auditHealthy: auditHealthy() === true, ...controller.status() }); return; }
        if (url.pathname === '/control') {
          if (req.method === 'GET') { json(res, 200, controller.status()); return; }
          if (req.method === 'POST') { json(res, 200, controller.control(parseJson(await readBody(req, 4096)))); return; }
          throw new CaeError('method_not_allowed', 405);
        }
        const path = url.pathname.replace(/^\/v1(?=\/)/, '');
        const generate = path === '/responses' && req.method === 'POST';
        const compact = path === '/responses/compact' && req.method === 'POST';
        const models = path === '/models' && req.method === 'GET';
        if (!generate && !compact && !models) throw new CaeError('unsupported_route', 404);
        if (c.upstream.kind !== 'mock' && !/^Bearer [^\r\n]+$/.test(req.headers.authorization ?? '')) throw new CaeError('upstream_auth_required', 401);
        if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new CaeError('compressed_requests_unsupported', 415);
        let bytes = models ? Buffer.alloc(0) : await readBody(req, c.maxBodyBytes);
        let expectsSse = false;
        if (generate) {
          if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new CaeError('json_required', 415);
          const body = parseJson(bytes);
          if (!isObject(body) || typeof body.model !== 'string') throw new CaeError('invalid_responses_request');
          expectsSse = body.stream === true;
          // prompt_cache_key is NOT a session identity. Without an explicit native
          // session header or local adapter header, there is no cross-call lease.
          const sid = req.headers['x-cae-session'] ?? req.headers.session_id;
          const sessionKey = typeof sid === 'string' && sid.length > 0 && sid.length < 300 ?
            createHmac('sha256', sessionSalt).update(`${req.headers.authorization ?? ''}\0${sid}`).digest('hex') : null;
          tx = await controller.prepare(body, { sessionKey, signal: aborter.signal, id });
          checkAbort(aborter.signal);
          controller.beforeSend(tx);
          if (tx.changed && tx.body) bytes = Buffer.from(JSON.stringify(tx.body));
        }
        checkAbort(aborter.signal);
        outcome = await relay(new URL(upstreamBase(c) + path + url.search), req, res, bytes,
          aborter.signal, c.upstreamTimeoutMs, () => { if (tx) controller.markSent(tx); }, expectsSse);
      } finally { --inflight; }
    } catch (error) {
      const safe = error instanceof CaeError ? error : new CaeError('proxy_transport_error', 502);
      if (!res.headersSent && !res.destroyed) json(res, safe.status, { error: { type: 'cae_error', code: safe.code } });
      else if (!res.writableFinished) res.destroy();
      outcome ??= { completed: false, terminal: safe.code, httpStatus: null };
    } finally {
      if (tx) {
        controller.finish(tx, { completed: outcome?.completed === true });
        emit({ event: 'upstream_outcome', requestId: id, model: tx.model,
          durationMs: Date.now() - started, ...outcome });
      }
      aborters.delete(aborter); res.off('close', close);
    }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.keepAliveTimeout = 3000;
  server.on('upgrade', (_req, socket) => {
    socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(c.port, '127.0.0.1', resolve); });
  port = server.address().port;
  return { port, controller, server,
    async close() {
      for (const a of aborters) a.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
async function relay(url, incoming, outgoing, bytes, signal, timeoutMs, onSent, expectsSse = false) {
  return new Promise((resolve, reject) => {
    let settled = false, observer, httpStatus;
    const headers = forwardedHeaders(incoming.headers);
    if (incoming.method === 'POST') { headers['content-length'] = bytes.length; headers['content-type'] = 'application/json'; }
    const client = (url.protocol === 'https:' ? https : http).request(url, { method: incoming.method, headers });
    const abort = () => client.destroy(new CaeError('cancelled', 499));
    const timer = setTimeout(() => client.destroy(new CaeError('upstream_timeout', 504)), timeoutMs);
    function finish(err, value) {
      if (settled) return;
      // Native clients may close immediately after response.completed, before
      // HTTP EOF. A validated terminal is authoritative; mid-stream cancellation is not.
      if (err && observer && httpStatus >= 200 && httpStatus < 300) {
        const observed = observer.end();
        if (observed.completed) { err = null; value = { ...observed, httpStatus }; }
      }
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (err) reject(err); else resolve(value);
    }
    signal.addEventListener('abort', abort, { once: true });
    client.once('error', err => finish(err instanceof CaeError ? err : new CaeError('upstream_connection_error', 502)));
    client.once('finish', onSent);
    client.once('response', async upstream => {
      if (upstream.statusCode >= 300 && upstream.statusCode < 400) {
        upstream.destroy(); finish(new CaeError('upstream_redirect_refused', 502)); return;
      }
      // Native streaming responses may omit Content-Type. Use the explicit
      // request hint only for observation; leave all response bytes/headers intact.
      httpStatus = upstream.statusCode;
      observer = new ResponseObserver(upstream.headers['content-type'] ?? (expectsSse ? 'text/event-stream' : undefined));
      outgoing.writeHead(upstream.statusCode, forwardedHeaders(upstream.headers, true));
      const tap = new Transform({ transform(chunk, _encoding, done) { observer.push(chunk); done(null, chunk); } });
      try {
        await pipeline(upstream, tap, outgoing);
        const observed = observer.end();
        finish(null, { ...observed, httpStatus: upstream.statusCode,
          completed: upstream.statusCode >= 200 && upstream.statusCode < 300 && observed.completed });
      } catch { finish(new CaeError(signal.aborted ? 'cancelled' : 'upstream_stream_interrupted', signal.aborted ? 499 : 502)); }
    });
    if (signal.aborted) abort();
    else client.end(bytes);
    // No automatic upstream retries, before or after any bytes. Codex may have
    // its own retry policy; the generated one-off launch configuration disables it.
  });
}
