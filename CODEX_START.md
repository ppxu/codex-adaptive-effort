# Maintainer handoff

This repository is already implemented and published at [ppxu/codex-adaptive-effort](https://github.com/ppxu/codex-adaptive-effort). Continue maintaining the existing code. Do not rerun repository creation, rebuild the architecture, install upstream routers or treat historical plans as current tasks.

1. Read `AGENTS.md`, `README.md`, `docs/LIMITATIONS.md`, `docs/LOCAL_ACCEPTANCE.md` and `docs/VALIDATION.md`.
2. Inspect the branch, source commit, worktree changes and origin. Preserve all existing changes; do not reset, clean or force-push. Check CI for the actual commit.
3. Run `npm ci --ignore-scripts` and `npm run verify` when relevant; report the observed result. Reuse complete results only when the tested source is unchanged and their time/commit are identified.
4. For native compatibility work, use `doctor` and the native `model/list` probe. Query metadata only unless real generation is explicitly authorized. Use actual model IDs and capabilities.
5. Make the smallest relevant change, add regression coverage for defects and update English documentation. Keep historical evidence dated and distinguish synthetic tests from real acceptance.
6. Review staged files for private data. Publish only original source, synthetic tests and sanitized documentation through ordinary Git/PR workflows. Check the new commit's CI after pushing.

Never read native login files, cookies, keychains or secrets; never change global Codex configuration, approval/sandbox settings or account/billing routes. The native client retains responsibility for login. `.cae`, capability captures, raw logs, credentials and real task histories remain local.

See [Publishing](docs/PUBLISHING.md) for existing-repository maintenance and [Local validation](docs/LOCAL_VALIDATION.md) for explicitly authorized experiments. A change in one installed desktop version is not a compatibility promise for all versions.
