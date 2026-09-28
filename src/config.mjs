import { readFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { CaeError, isObject } from './util.mjs';

export const EFFORT_NAMES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export const UPSTREAMS = Object.freeze({
  api: 'https://api.openai.com/v1',
  chatgpt: 'https://chatgpt.com/backend-api/codex',
});
export function validateConfig(c) {
  if (!isObject(c) || c.version !== 1) throw new CaeError('config_version');
  const allowed = ['version', 'model', 'supportedEfforts', 'baseline', 'mode', 'port', 'upstream',
    'tokenFile', 'logFile', 'judge', 'lease', 'maxBodyBytes', 'upstreamTimeoutMs', 'capabilitySource'];
  if (Object.keys(c).some(k => !allowed.includes(k))) throw new CaeError('unknown_config_field');
  if (typeof c.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(c.model)) throw new CaeError('config_model');
  if (!Array.isArray(c.supportedEfforts) || c.supportedEfforts.length < 1 || c.supportedEfforts.length > EFFORT_NAMES.length ||
      new Set(c.supportedEfforts).size !== c.supportedEfforts.length ||
      c.supportedEfforts.some(v => !EFFORT_NAMES.includes(v))) throw new CaeError('config_efforts');
  if (!c.supportedEfforts.includes(c.baseline)) throw new CaeError('config_baseline');
  if (!['off', 'shadow', 'auto'].includes(c.mode)) throw new CaeError('config_mode');
  if (!Number.isInteger(c.port) || c.port < 0 || c.port > 65535) throw new CaeError('config_port');
  if (!isObject(c.upstream)) throw new CaeError('config_upstream');
  if (c.upstream.kind === 'mock') {
    let url;
    try { url = new URL(c.upstream.baseUrl); } catch { throw new CaeError('config_mock_url'); }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !['', '/', '/v1'].includes(url.pathname))
      throw new CaeError('config_mock_url');
  } else if (!UPSTREAMS[c.upstream.kind] || c.upstream.baseUrl !== undefined) throw new CaeError('config_upstream');
  if (typeof c.tokenFile !== 'string' || !c.tokenFile || typeof c.logFile !== 'string' || !c.logFile) throw new CaeError('config_paths');
  if (!isObject(c.judge) || !['baseline', 'typesafe'].includes(c.judge.kind)) throw new CaeError('config_judge');
  if (typeof c.judge.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(c.judge.model)) throw new CaeError('config_judge_model');
  for (const [v, lo, hi, code] of [
    [c.judge.timeoutMs, 50, 30000, 'config_judge_timeout'],
    [c.judge.maxCalls, 0, 100000, 'config_judge_budget'],
    [c.lease?.maxGenerations, 1, 4, 'config_lease'],
    [c.lease?.ttlMs, 100, 300000, 'config_lease_ttl'],
    [c.maxBodyBytes, 1024, 32 * 1024 * 1024, 'config_body_limit'],
    [c.upstreamTimeoutMs, 100, 3600000, 'config_upstream_timeout'],
  ]) if (!Number.isInteger(v) || v < lo || v > hi) throw new CaeError(code);
  return structuredClone(c);
}
export function defaultConfig(model, supportedEfforts, baseline) {
  return validateConfig({
    version: 1, model, supportedEfforts, baseline, mode: 'shadow', port: 4318,
    upstream: { kind: 'api' }, tokenFile: 'local.key', logFile: 'events.jsonl',
    judge: { kind: 'baseline', model: 'jev-latest', timeoutMs: 1500, maxCalls: 100 },
    lease: { maxGenerations: 4, ttlMs: 30000 }, maxBodyBytes: 8 * 1024 * 1024,
    upstreamTimeoutMs: 300000, capabilitySource: 'operator-supplied; not live-verified',
  });
}
export function loadConfig(path) {
  const absolute = resolve(path);
  let value;
  try { value = JSON.parse(readFileSync(absolute, 'utf8')); }
  catch { throw new CaeError('cannot_read_config'); }
  const config = validateConfig(value);
  config.tokenFile = resolve(dirname(absolute), config.tokenFile);
  config.logFile = resolve(dirname(absolute), config.logFile);
  if (config.tokenFile === config.logFile) throw new CaeError('config_path_collision');
  return config;
}
export function readLocalToken(path) {
  try {
    const st = lstatSync(path);
    if (!st.isFile() || st.isSymbolicLink()) throw new Error();
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) throw new Error();
    const token = readFileSync(path, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error();
    return token;
  } catch { throw new CaeError('invalid_or_insecure_local_token'); }
}
export function upstreamBase(c) {
  return c.upstream.kind === 'mock' ? c.upstream.baseUrl.replace(/\/$/, '') : UPSTREAMS[c.upstream.kind];
}
