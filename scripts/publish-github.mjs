#!/usr/bin/env node
/** Explicit opt-in publication from a fresh source export. No credential extraction. */
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { publicationFiles } from './publication.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
function run(cmd, args, { allowFailure = false, inherit = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', timeout: 120000, shell: false,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_HOST: 'github.com', GIT_TERMINAL_PROMPT: '0' } });
  if ((r.error || r.status !== 0) && !allowFailure) throw new Error(`${cmd === 'gh' ? 'github_cli' : cmd === 'git' ? 'git' : 'verification'}_command_failed`);
  return r;
}
try {
  const { values } = parseArgs({ options: { owner: { type: 'string' }, public: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } });
  if (!values.owner || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(values.owner)) throw new Error('specify_owner_login');
  const repo = `${values.owner}/codex-adaptive-effort`;
  const sources = publicationFiles(root);
  if (!values.public || values['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, target: repo, visibility: 'public', fileCount: sources.length,
      privateRuntimeFilesExcluded: true, note: 'No GitHub request or Git mutation. Use --public explicitly to create and push.', files: sources }, null, 2));
    process.exit(0);
  }
  // Do not publish an existing history that could contain removed credentials.
  // This helper is deliberately for the fresh source ZIP. Normal development
  // after initial publication uses normal git commits and pull requests.
  if (existsSync(join(root, '.git'))) throw new Error('fresh_source_export_required_existing_git_refused');
  run('git', ['--version']); run('gh', ['--version']);
  const user = run('gh', ['api', '--hostname', 'github.com', 'user', '--jq', '.login']).stdout.trim();
  if (user.toLowerCase() !== values.owner.toLowerCase()) throw new Error('authenticated_owner_mismatch');
  const view = run('gh', ['api', '--hostname', 'github.com', '--include', `repos/${repo}`], { allowFailure: true });
  if (view.status === 0) throw new Error('repository_already_exists_no_overwrite');
  if (!/^HTTP\/\S+\s+404\b/m.test(view.stdout ?? '')) throw new Error('repository_absence_not_confirmed');
  // Run offline verification before creating anything on GitHub.
  run(process.execPath, ['scripts/check.mjs'], { inherit: true });
  run(process.execPath, ['--test', ...readdirSync(join(root, 'test')).filter(n => n.endsWith('.test.mjs')).map(n => `test/${n}`)], { inherit: true });
  run(process.execPath, ['scripts/demo.mjs'], { inherit: true });
  const after = publicationFiles(root);
  if (JSON.stringify(sources) !== JSON.stringify(after)) throw new Error('source_changed_during_verification');
  run('git', ['init', '-b', 'main']);
  run('git', ['add', '--', ...sources.map(f => f.path)]);
  run('git', ['-c', 'user.name=Codex Adaptive Effort contributors', '-c', 'user.email=contributors@users.noreply.github.com',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'feat: experimental fixed-model adaptive effort controller']);
  run('gh', ['repo', 'create', repo, '--public', '--source', '.', '--remote', 'origin', '--push',
    '--description', 'Experimental fixed-model adaptive reasoning-effort controller for local Codex; Jev integration, shadow mode and bounded leases.'], { inherit: true });
  const metadata = JSON.parse(run('gh', ['repo', 'view', repo, '--json', 'url,isPrivate,defaultBranchRef']).stdout);
  if (metadata.isPrivate !== false || metadata.defaultBranchRef?.name !== 'main') throw new Error('post_publish_verification_failed');
  console.log(JSON.stringify({ published: true, url: metadata.url, commit: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
    note: 'Remote creation verified. Check the GitHub Actions result separately; it is not implied by push success.' }, null, 2));
} catch (error) {
  console.error(`Publication stopped: ${error.message}`);
  console.error('No force-push or repository deletion is performed. If gh is missing/not authenticated, install GitHub CLI and use its normal login flow. Never paste tokens into chat. If initialization already happened, inspect local git status and the remote before retrying manually.');
  process.exitCode = 1;
}
