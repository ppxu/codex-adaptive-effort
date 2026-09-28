import { digest, isObject, shortText, stable } from './util.mjs';

/** Best-effort redaction; never a promise that an excerpt is safe to disclose. */
export function redact(text) {
  return String(text)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/\/(?:Users|home)\/[^/\s]+/g, '/[HOME]');
}
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(p => isObject(p) && ['input_text', 'output_text', 'text'].includes(p.type))
    .map(p => typeof p.text === 'string' ? p.text : '').join('\n');
}
function hasMedia(content) {
  return Array.isArray(content) && content.some(p => isObject(p) && /image|audio|video|file/.test(p.type ?? ''));
}
function supportedItem(item) {
  if (!isObject(item)) return false;
  if (item.type === undefined || item.type === 'message') {
    return ['user', 'assistant', 'system', 'developer'].includes(item.role) &&
      (typeof item.content === 'string' || (Array.isArray(item.content) && item.content.every(p =>
        isObject(p) && ['input_text', 'output_text', 'text'].includes(p.type) && typeof p.text === 'string')));
  }
  if (['function_call_output', 'custom_tool_call_output'].includes(item.type)) return typeof item.output === 'string';
  // Retain opaque reasoning and call records for history integrity, never evaluator text.
  return ['reasoning', 'function_call', 'custom_tool_call'].includes(item.type);
}
function failed(item) {
  if (item.is_error === true || item.success === false) return true;
  let out = item.output;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch { return false; } }
  return isObject(out) && (out.is_error === true || out.success === false ||
    (typeof out.exit_code === 'number' && out.exit_code !== 0) ||
    (typeof out.exitCode === 'number' && out.exitCode !== 0));
}
export function inspectRequest(body) {
  const items = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
  if (!Array.isArray(items)) return { eligible: false, reason: 'unsupported_input' };
  if (items.length > 4096) return { eligible: false, reason: 'history_item_limit' };
  if (body.previous_response_id || body.conversation) return { eligible: false, reason: 'delta_history' };
  if (body.background === true) return { eligible: false, reason: 'background_response' };
  if (items.some(i => isObject(i) && i.type === 'configuration_update')) return { eligible: false, reason: 'existing_configuration_update' };
  if (items.some(i => isObject(i) && /compaction/.test(i.type ?? '')) || body.context_management)
    return { eligible: false, reason: 'compaction_boundary' };
  if (body.truncation && body.truncation !== 'disabled') return { eligible: false, reason: 'automatic_truncation' };
  if (items.some(i => isObject(i) && (hasMedia(i.content) || (typeof i.output === 'object' && i.output !== null))))
    return { eligible: false, reason: 'media_or_structured_tool_evidence' };
  if (!items.every(supportedItem)) return { eligible: false, reason: 'unsupported_history_item' };
  const users = items.filter(i => isObject(i) && i.role === 'user');
  const latest = users.at(-1);
  if (!latest || !textOf(latest.content).trim()) return { eligible: false, reason: 'missing_user_goal' };
  const publicNotes = items.filter(i => isObject(i) && i.role === 'assistant').slice(-2);
  const tools = items.filter(i => isObject(i) && ['function_call_output', 'custom_tool_call_output'].includes(i.type));
  const errors = tools.filter(failed).map(i => digest(i));
  const clean = (text, max) => shortText(redact(text), max);
  const state = {
    task: clean(textOf(users.length > 1 ? users.at(-2).content : latest.content), 1800),
    latestUser: clean(textOf(latest.content), 2200),
    publicNotes: publicNotes.map(i => clean(textOf(i.content), 600)),
    recentTools: tools.slice(-3).map(i => ({
      result: clean(typeof i.output === 'string' ? i.output : '', 600), failed: failed(i),
    })),
    omittedToolCalls: Math.max(0, tools.length - 3),
    evidenceLimits: 'Bounded character excerpts; missing text remains unknown. No image understanding.',
  };
  // All integrity fingerprints are local only. No auth, session ids, encrypted reasoning,
  // tool definitions or system/developer instructions enter evaluator state.
  return {
    eligible: true, state, itemCount: items.length,
    itemHashes: items.map(digest),
    taskKey: digest(users.map(i => textOf(i.content))),
    constraintsKey: digest({ model: body.model, instructions: body.instructions ?? null, tools: body.tools ?? null }),
    errorsKey: digest(errors),
    reasoningKey: digest(body.reasoning ?? null),
    stateChars: Array.from(stable(state)).length,
  };
}
export function canContinue(previous, next) {
  return previous && next.eligible && previous.taskKey === next.taskKey &&
    previous.constraintsKey === next.constraintsKey && previous.errorsKey === next.errorsKey &&
    previous.reasoningKey === next.reasoningKey && next.itemCount > previous.itemCount &&
    previous.itemHashes.every((h, i) => next.itemHashes[i] === h);
}
