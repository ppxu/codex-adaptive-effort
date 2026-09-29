import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('npm manifest has a complete explicit runtime allowlist and no lifecycle hooks or dependencies', () => {
  assert.notEqual(pkg.private, true); assert.equal(pkg.publishConfig.tag, 'alpha');
  assert.equal(pkg.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.equal(pkg.bin.cae, './bin/cae.mjs');
  for (const file of pkg.files) assert.match(file, /^(?:bin|src|docs)\/[A-Za-z0-9_.-]+$|^[A-Za-z0-9_.-]+$/);
  for (const dir of ['bin', 'src']) for (const file of readdirSync(join(root, dir)).filter(f => f.endsWith('.mjs')))
    assert(pkg.files.includes(`${dir}/${file}`), `Runtime file missing from npm package: ${dir}/${file}`);
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly', 'publish', 'postpublish'])
    assert.equal(pkg.scripts[hook], undefined);
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies'])
    assert.equal(Object.keys(pkg[key] ?? {}).length, 0);
});

test('packed tarball excludes private files and installs a working global cae command offline', { timeout: 60000 }, t => {
  const temp = mkdtempSync(join(tmpdir(), 'cae-npm-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(temp, 'source'), prefix = join(temp, 'prefix'), work = join(temp, 'work');
  mkdirSync(source); mkdirSync(work);
  const expected = [...new Set(['package.json', 'README.md', 'LICENSE', ...pkg.files])].sort();
  for (const file of expected) {
    mkdirSync(dirname(join(source, file)), { recursive: true });
    copyFileSync(join(root, file), join(source, file));
  }
  const sentinel = 'SYNTHETIC_PRIVATE_PACKAGE_SENTINEL';
  for (const file of ['.cae/local.key', '.env', '.npmrc', 'auth.json', 'capabilities.local.json', 'SOURCE_MANIFEST.json',
    'events.jsonl', 'src/auth.json', 'src/debug.local.mjs', 'docs/task.local.md']) {
    mkdirSync(dirname(join(source, file)), { recursive: true });
    writeFileSync(join(source, file), file === '.npmrc' ? '# ' + sentinel : sentinel);
  }
  const userConfig = join(temp, 'user.npmrc'), globalConfig = join(temp, 'global.npmrc');
  writeFileSync(userConfig, ''); writeFileSync(globalConfig, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    ['path', 'systemroot', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'lc_all'].includes(name.toLowerCase())));
  const npmCli = process.env.npm_execpath ?? realpathSync(join(dirname(process.execPath),
    process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'npm'));
  const npm = (...args) => {
    const result = spawnSync(process.execPath, [npmCli, ...args, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
      '--cache', join(temp, 'cache'), '--userconfig', userConfig, '--globalconfig', globalConfig],
    { cwd: source, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const [capture] = JSON.parse(npm('pack', '--json', '--pack-destination', temp));
  assert.deepEqual(capture.files.map(f => f.path).sort(), expected);
  // Also pack the actual checkout: npm implicitly includes README/LICENSE variants.
  // A fixture alone would miss an unexpected implicitly included source-root file.
  const [actual] = JSON.parse(npm('pack', root, '--json', '--pack-destination', temp));
  assert.deepEqual(actual.files.map(f => f.path).sort(), expected);
  npm('install', '--global', '--prefix', prefix, join(temp, actual.filename));
  const installed = join(prefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', pkg.name);
  for (const file of expected) {
    const bytes = readFileSync(join(installed, file));
    assert(!bytes.includes(sentinel)); assert.deepEqual(bytes, readFileSync(join(source, file)));
  }
  const shim = join(prefix, process.platform === 'win32' ? 'cae.cmd' : 'bin/cae');
  assert(existsSync(shim));
  // Only fixed flags reach the Windows command shim; no user-controlled shell arguments.
  for (const flag of ['--version', '--help']) {
    const result = spawnSync(shim, [flag], { cwd: work, env, encoding: 'utf8', timeout: 5000, shell: process.platform === 'win32' });
    assert.equal(result.status, 0, result.stderr);
    assert(result.stdout.includes(pkg.version));
  }
  const cli = (...args) => spawnSync(process.execPath, [join(installed, 'bin/cae.mjs'), ...args],
    { cwd: work, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(cli('init', '--dir', '.cae', '--model', 'synthetic-model', '--auth', 'chatgpt', '--efforts', 'low,high', '--baseline', 'high').status, 0);
  const launched = cli('launch-args', '--auth', 'chatgpt'); assert.equal(launched.status, 0, launched.stderr);
  assert(JSON.parse(launched.stdout).args.includes('model="synthetic-model"'));
  const desktop = cli('desktop', 'start');
  assert.equal(desktop.status, 1); assert.match(desktop.stderr, /upstream_not_enabled/);
  assert(existsSync(join(installed, 'bin/cae-desktop-bridge.mjs')));
  assert.equal(existsSync(join(installed, '.cae')), false);
});
