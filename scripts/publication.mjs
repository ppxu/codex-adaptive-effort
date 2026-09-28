import { readdirSync, lstatSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOTS = ['.github', 'bin', 'docs', 'examples', 'scripts', 'src', 'test'];
const FILES = ['.gitignore', 'package.json', 'package-lock.json', 'README.md', 'README.en.md',
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CODEX_START.md', 'CHANGELOG.md'];
const EXTENSIONS = /(?:\.mjs|\.json|\.md|\.yml|\.yaml|\.txt|\.toml)$/;
/** Inspect current source only; never read .cae, auth.json, dotenv or Git credentials. */
export function publicationFiles(root) {
  const files = [];
  const inspect = path => {
    const st = lstatSync(path), name = relative(root, path).replaceAll('\\', '/');
    if (st.isSymbolicLink()) throw new Error('publication_symlink_refused');
    if (st.isDirectory()) {
      if (/(^|\/)(?:\.cae|\.git|node_modules|\.env[^/]*)(\/|$)/.test(name)) throw new Error('private_path_inside_public_root');
      for (const item of readdirSync(path)) inspect(join(path, item)); return;
    }
    if (/(^|\/)(?:auth|cookies|credentials)\.json$/i.test(name) || /\.local\.[^/]+$/.test(name)) throw new Error('private_capture_refused');
    if (!st.isFile() || (!FILES.includes(name) && !EXTENSIONS.test(name)) || st.size > 2 * 1024 * 1024)
      throw new Error('unexpected_public_file');
    const bytes = readFileSync(path), text = bytes.toString('utf8');
    if (bytes.includes(0) || /\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{32,}\b/.test(text) ||
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw new Error('possible_secret_in_public_source');
    files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  };
  for (const path of [...FILES, ...ROOTS]) if (existsSync(join(root, path))) inspect(join(root, path));
  if (!files.some(f => f.path === 'README.md') || !files.some(f => f.path === 'LICENSE')) throw new Error('publication_docs_missing');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
