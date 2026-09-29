import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { publicationFiles } from './publication.mjs';
import { checkDocumentation } from './docs.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
let checked = 0;
// Share the publication boundary: local captures and credentials are not source.
const files = publicationFiles(root);
for (const file of files) {
  const path = join(root, file.path);
  if (path.endsWith('.mjs')) {
    const r = spawnSync(process.execPath, ['--check', resolve(path)], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1); ++checked;
  }
  if (path.endsWith('.json')) JSON.parse(readFileSync(path, 'utf8'));
}
console.log(`Syntax checked ${checked} JavaScript modules; JSON parsed successfully.`);
const docs = checkDocumentation(root, files.map(f => f.path));
console.log(`Checked ${docs.links} local links in ${docs.documents} public Markdown documents.`);
