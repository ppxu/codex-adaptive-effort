import { StringDecoder } from 'node:string_decoder';
import { usageOf } from './audit.mjs';
import { isObject } from './util.mjs';

/** Observe a bounded copy of terminal metadata; never rewrite the byte stream. */
export class ResponseObserver {
  constructor(contentType, limit = 2 * 1024 * 1024) {
    this.sse = String(contentType ?? '').split(';')[0].trim().toLowerCase() === 'text/event-stream';
    this.limit = limit; this.buffer = ''; this.decoder = new StringDecoder('utf8');
    this.dropping = false; this.overflow = false; this.createdId = null;
    this.atStart = true; this.skipLf = false;
    this.terminal = null; this.completed = false; this.usage = usageOf(null);
  }
  push(chunk) {
    if (!this.sse && this.overflow) return;
    let text = this.decoder.write(chunk);
    if (this.sse && text) {
      if (this.atStart) { text = text.replace(/^\uFEFF/, ''); this.atStart = false; }
      if (this.skipLf && text.startsWith('\n')) text = text.slice(1);
      this.skipLf = text.endsWith('\r');
      // SSE permits CR, LF and CRLF, including CRLF split across chunks. This
      // normalization is only for the observer; the relay keeps original bytes.
      text = text.replace(/\r\n?/g, '\n');
    }
    this.buffer += text;
    if (!this.sse) {
      if (this.buffer.length > this.limit) { this.buffer = ''; this.overflow = true; }
      return;
    }
    let boundary;
    while ((boundary = this.buffer.indexOf('\n\n')) !== -1) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      if (!this.dropping && frame.length <= this.limit) this.frame(frame);
      this.dropping = false;
    }
    if (this.buffer.length > this.limit) { this.buffer = this.buffer.slice(-4); this.dropping = true; this.overflow = true; }
  }
  frame(text) {
    const data = text.split('\n').filter(s => s.startsWith('data:')).map(s => s.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (!isObject(event)) return;
    if (event.type === 'response.created') this.createdId = event.response?.id ?? null;
    if (['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)) {
      this.terminal = event.type;
      this.completed = event.type === 'response.completed' &&
        typeof event.response?.id === 'string' && event.response.id.length > 0 &&
        event.response.status === 'completed' &&
        (!this.createdId || this.createdId === event.response.id);
      this.usage = usageOf(event.response);
    }
    if (event.type === 'error') { this.terminal = 'error'; this.completed = false; }
  }
  end() {
    this.buffer += this.decoder.end();
    if (!this.sse && !this.overflow) {
      try {
        const body = JSON.parse(this.buffer);
        this.terminal = ['completed', 'failed', 'incomplete', 'in_progress', 'queued', 'cancelled'].includes(body.status) ? body.status : null;
        this.completed = body.status === 'completed' && typeof body.id === 'string' && body.id.length > 0;
        this.usage = usageOf(body);
      } catch { /* Unknown, not zero. */ }
    }
    this.buffer = '';
    return { terminal: this.terminal, completed: this.completed, ...this.usage };
  }
}
