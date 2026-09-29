import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

function prose(text) {
  let fence = null;
  return text.split(/\r?\n/).map(line => {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (match && !fence) { fence = match[1]; return ''; }
    if (match && fence && match[1][0] === fence[0] && match[1].length >= fence.length) { fence = null; return ''; }
    return fence ? '' : line;
  }).join('\n');
}
function anchors(text) {
  const seen = new Set([...text.matchAll(/<(?:a|span)\s+id="([^"]+)"[^>]*>/g)].map(m => m[1]));
  for (const match of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1].toLowerCase().replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    let id = base, suffix = 0;
    while (seen.has(id)) id = `${base}-${++suffix}`;
    seen.add(id);
  }
  return seen;
}
/** Validate the inline relative links used by this repository, entirely offline.
 * Only supplied public paths are read; missing/private targets are never opened.
 */
export function checkDocumentation(root, paths) {
  const available = new Set(paths), documents = new Map(), errors = []; let checked = 0;
  for (const path of paths.filter(p => p.endsWith('.md'))) {
    const text = prose(readFileSync(join(root, path), 'utf8'));
    documents.set(path, { text, anchors: anchors(text) });
  }
  for (const [path, { text }] of documents) {
    for (const match of text.matchAll(/\[[^\]\n]*\]\((?:<([^>\n]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
      const href = match[1] ?? match[2];
      if (/^(?:https?:|mailto:|\/\/)/i.test(href)) continue;
      ++checked;
      const [pathname, hash] = href.split('#', 2);
      let target, anchor;
      try {
        target = pathname ? posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(pathname))) : path;
        anchor = hash === undefined ? '' : decodeURIComponent(hash);
      } catch { errors.push(`invalid_document_link: ${path}`); continue; }
      if (pathname.startsWith('/') || !available.has(target)) { errors.push(`missing_document_target: ${path} -> ${href}`); continue; }
      if (anchor && documents.has(target) && !documents.get(target).anchors.has(anchor))
        errors.push(`missing_document_anchor: ${path} -> ${href}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { documents: documents.size, links: checked };
}
