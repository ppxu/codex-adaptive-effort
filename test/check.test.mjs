import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('offline syntax checks exclude private root captures but still reject invalid public code', t => {
  const root = mkdtempSync(join(tmpdir(), 'cae-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'src'));
  for (const name of ['check.mjs', 'publication.mjs'])
    copyFileSync(new URL('../scripts/' + name, import.meta.url), join(root, 'scripts', name));
  for (const name of ['README.md', 'LICENSE']) writeFileSync(join(root, name), 'Synthetic fixture');
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'src', 'valid.mjs'), 'export const value = 1;');
  // Deliberately invalid synthetic files: parsing either would fail this check.
  for (const name of ['capabilities.local.json', 'auth.json', 'SOURCE_MANIFEST.json'])
    writeFileSync(join(root, name), 'not-json');
  const run = () => spawnSync(process.execPath, [join(root, 'scripts', 'check.mjs')], { encoding: 'utf8', timeout: 10000 });
  const valid = run(); assert.equal(valid.status, 0, valid.stderr);
  writeFileSync(join(root, 'src', 'invalid.mjs'), 'export const = ;');
  assert.equal(run().status, 1);
});
