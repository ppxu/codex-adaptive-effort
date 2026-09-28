import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['.git', '.cae', 'node_modules'].includes(e.name)) return [];
    const path = join(dir, e.name); return e.isDirectory() ? walk(path) : [path];
  });
}
let checked = 0;
for (const path of walk(root)) {
  if (path.endsWith('.mjs')) {
    const r = spawnSync(process.execPath, ['--check', resolve(path)], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1); ++checked;
  }
  if (path.endsWith('.json')) JSON.parse(readFileSync(path, 'utf8'));
}
console.log(`Syntax checked ${checked} JavaScript modules; JSON parsed successfully.`);
