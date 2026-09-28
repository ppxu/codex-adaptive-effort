import { createHash, timingSafeEqual } from 'node:crypto';

export class CaeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'CaeError';
    this.code = code;
    this.status = status;
  }
}
export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObject(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const digest = (v) => createHash('sha256').update(typeof v === 'string' ? v : stable(v)).digest('hex');
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function checkAbort(signal) {
  if (signal?.aborted) throw new CaeError('cancelled', 499);
}
export async function bounded(promise, ms, signal) {
  checkAbort(signal);
  let timer, onAbort;
  const gate = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new CaeError('judge_timeout', 504)), ms);
    onAbort = () => reject(new CaeError('cancelled', 499));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([promise, gate]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
export function shortText(text, limit) {
  if (typeof text !== 'string') return '';
  // Slice by Unicode code points, not UTF-16 halves. Bounds are characters, NOT tokens.
  const points = Array.from(text);
  if (points.length <= limit) return text;
  const half = Math.floor((limit - 18) / 2);
  return points.slice(0, half).join('') + '\n[… truncated …]\n' + points.slice(-half).join('');
}
export function parseJson(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new CaeError('invalid_json'); }
}
export const knownNumber = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
