import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicationFiles } from '../scripts/publication.mjs';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cae-public-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'README.md'), '# Synthetic'); writeFileSync(join(root, 'LICENSE'), 'Synthetic'); mkdirSync(join(root, 'src')); return root;
}
test('publication excludes runtime config, keys and dotenv without reading them', t => {
  const root = fixture(t); mkdirSync(join(root, '.cae')); writeFileSync(join(root, '.cae/local.key'), 'synthetic');
  writeFileSync(join(root, '.env'), 'synthetic'); writeFileSync(join(root, 'src/main.mjs'), 'export const ok = true;');
  assert.deepEqual(publicationFiles(root).map(f => f.path).sort(), ['LICENSE', 'README.md', 'src/main.mjs']);
});
test('publication refuses suspicious real-shaped tokens in source', t => {
  const root = fixture(t); writeFileSync(join(root, 'src/main.mjs'), 'ghp_' + 'a'.repeat(40)); assert.throws(() => publicationFiles(root));
});
test('publication refuses unexpected binary file in public root', t => {
  const root = fixture(t); writeFileSync(join(root, 'src/binary.bin'), Buffer.from([0])); assert.throws(() => publicationFiles(root));
});
test('publication refuses nested private runtime directory', t => {
  const root = fixture(t); mkdirSync(join(root, 'src/.cae')); assert.throws(() => publicationFiles(root));
});
test('publication refuses symlinks in public roots', { skip: process.platform === 'win32' }, t => {
  const root = fixture(t); symlinkSync(join(root, 'LICENSE'), join(root, 'src/link.mjs')); assert.throws(() => publicationFiles(root));
});
test('publication refuses auth or local captures even under source roots', t => {
  const root = fixture(t); writeFileSync(join(root, 'src/auth.json'), '{"synthetic":"data"}'); assert.throws(() => publicationFiles(root));
});

test('publication includes language entry points and community templates in source exports', t => {
  const root = fixture(t);
  for (const name of ['README.en.md', 'README.zh-CN.md', 'CODE_OF_CONDUCT.md']) writeFileSync(join(root, name), '# Synthetic public document');
  mkdirSync(join(root, '.github/ISSUE_TEMPLATE'), { recursive: true });
  writeFileSync(join(root, '.github/ISSUE_TEMPLATE/bug_report.yml'), 'name: Synthetic');
  writeFileSync(join(root, '.github/pull_request_template.md'), '# Synthetic pull request');
  const names = publicationFiles(root).map(f => f.path);
  for (const name of ['README.en.md', 'README.zh-CN.md', 'CODE_OF_CONDUCT.md', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/pull_request_template.md']) assert(names.includes(name));
});
