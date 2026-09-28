import { StringDecoder } from 'node:string_decoder';
import { usageOf } from './audit.mjs';
import { isObject } from './util.mjs';

/** Observe a bounded copy of terminal metadata; never rewrite the byte stream. */
export class ResponseObserver {
  constructor(contentType, limit = 2 * 1024 * 1024) {
    this.sse = String(contentType ?? '').includes('text/event-stream');
    this.limit = limit; this.buffer = ''; this.decoder = new StringDecoder('utf8');
    this.dropping = false; this.overflow = false; this.createdId = null;
    this.terminal = null; this.completed = false; this.usage = usageOf(null);
  }
  push(chunk) {
    this.buffer += this.decoder.write(chunk);
    if (!this.sse) {
      if (this.buffer.length > this.limit) { this.buffer = ''; this.overflow = true; }
      return;
    }
    let match;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      if (!this.dropping && frame.length <= this.limit) this.frame(frame);
      this.dropping = false;
    }
    if (this.buffer.length > this.limit) { this.buffer = this.buffer.slice(-4); this.dropping = true; this.overflow = true; }
  }
  frame(text) {
    const data = text.split(/\r?\n/).filter(s => s.startsWith('data:')).map(s => s.slice(5).replace(/^ /, '')).join('\n');
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
        this.terminal = typeof body.status === 'string' ? body.status : null;
        this.completed = body.status === 'completed' && typeof body.id === 'string' && body.id.length > 0;
        this.usage = usageOf(body);
      } catch { /* Unknown, not zero. */ }
    }
    this.buffer = '';
    return { terminal: this.terminal, completed: this.completed, ...this.usage };
  }
}
