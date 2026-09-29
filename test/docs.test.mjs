import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocumentation } from '../scripts/docs.mjs';

test('documentation checks paths, Unicode and duplicate headings without fetching external URLs', t => {
  const root = mkdtempSync(join(tmpdir(), 'cae-docs-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'README.md'), '# Guide\n[local](docs/guide.md#安装)\n[duplicate](docs/guide.md#again-1)\n[remote](https://synthetic.invalid)\n```\n[example](missing.md)\n```');
  writeFileSync(join(root, 'docs/guide.md'), '# 安装\n## Again\n## Again\n[home](../README.md#guide)');
  const paths = ['README.md', 'docs/guide.md'];
  assert.deepEqual(checkDocumentation(root, paths), { documents: 2, links: 3 });
  writeFileSync(join(root, 'docs/guide.md'), '[bad](../README.md#missing)');
  assert.throws(() => checkDocumentation(root, paths), /missing_document_anchor/);
  writeFileSync(join(root, 'README.md'), '[private](auth.json)');
  assert.throws(() => checkDocumentation(root, paths), /missing_document_target/);
  writeFileSync(join(root, 'README.md'), '[bad](%FF.md)');
  assert.throws(() => checkDocumentation(root, paths), /invalid_document_link/);
});
