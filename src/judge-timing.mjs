import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';
import { performance } from 'node:perf_hooks';

const context = new AsyncLocalStorage();
/** Observe fetch without changing its dispatcher, pooling, endpoint or request bytes. */
export function judgeTiming({ signal, onTiming = () => {} } = {}) {
  const started = performance.now(), owner = {}, requests = new WeakSet(), subscriptions = [];
  let closed = false;
  const data = { judgeStage: 'started', judgeRequestCreatedMs: null, judgeSendStartMs: null,
    judgeRequestSentMs: null, judgeResponseHeadersMs: null, judgeResponseBodyMs: null, judgeValidatedMs: null };
  const elapsed = () => Math.round((performance.now() - started) * 10) / 10;
  const publish = () => { try { onTiming({ ...data, judgeObservedMs: elapsed() }); } catch { /* Diagnostics cannot break traffic. */ } };
  function mark(stage, field) {
    if (closed) return;
    data.judgeStage = stage;
    if (field && data[field] === null) data[field] = elapsed();
    publish();
  }
  function subscribe(name, handler) {
    const c = channel(name);
    const safe = message => { if (!closed) { try { handler(message); } catch { /* Unknown diagnostic shape: leave unknown. */ } } };
    c.subscribe(safe); subscriptions.push([c, safe]);
  }
  subscribe('undici:request:create', ({ request }) => {
    if (context.getStore() !== owner) return;
    requests.add(request); mark('created', 'judgeRequestCreatedMs');
  });
  for (const [name, stage, field] of [
    ['undici:client:sendHeaders', 'sending', 'judgeSendStartMs'],
    ['undici:request:bodySent', 'waiting_headers', 'judgeRequestSentMs'],
    ['undici:request:headers', 'reading_body', 'judgeResponseHeadersMs'],
  ]) subscribe(name, ({ request }) => { if (requests.has(request)) mark(stage, field); });
  function stop() {
    if (closed) return;
    publish(); closed = true;
    for (const [c, listener] of subscriptions) c.unsubscribe(listener);
    signal?.removeEventListener('abort', stop);
  }
  signal?.addEventListener('abort', stop, { once: true });
  publish();
  if (signal?.aborted) stop();
  return { run: fn => context.run(owner, fn), mark, stop };
}
