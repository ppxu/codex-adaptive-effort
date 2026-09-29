# Repository maintenance and publishing

The canonical public repository already exists: [ppxu/codex-adaptive-effort](https://github.com/ppxu/codex-adaptive-effort), default branch `main`. The package is prepared for npm publication with an explicit file allowlist and `alpha` dist-tag. It has not been published to the registry by this change; source availability is not an npm release or a desktop plugin release.

## Maintain the existing repository

Use ordinary Git and pull requests. Do not run the first-publication script in this checkout.

```bash
git status --short
git remote -v
git rev-parse HEAD
npm ci --ignore-scripts
npm run verify
git diff --check
```

Review the exact staged files. Exclude `.cae`, local capabilities, dotenv, logs, credentials, private paths and task histories. `scripts/publication.mjs` provides a source allowlist and best-effort secret scan; it is not a substitute for human review. Preserve existing uncommitted work.

After an authorized push, inspect CI for the exact source commit:

```bash
gh run list --commit "$(git rev-parse HEAD)"
```

A successful push is not a successful CI run, and a previous commit's CI does not validate a new commit. Do not force-push or recreate the repository to resolve a publishing problem.

## Version and release policy

The current source version is `0.1.0-alpha.1`; ongoing changes are listed under Unreleased. Do not infer a Git tag, GitHub Release or npm publication from a changelog heading. A release is a separate maintainer decision that should identify the tested commit, relevant compatibility evidence and known limitations. Package preparation does not create a registry release.

## Publish an authorized npm alpha

First review the staged source and the exact commit's CI, then build and inspect the package:

```bash
npm ci --ignore-scripts
npm run verify
npm pack --ignore-scripts --dry-run --json
npm pack --ignore-scripts
```

The archive must contain only the explicit runtime/docs allowlist plus npm's standard README/LICENSE/package metadata. npm automatically includes README/LICENSE variants: do not place private content in such files, and inspect the actual archive list even when `files` is explicit. Tests check both a synthetic staging directory and the actual checkout's archive, then install the latter into a temporary prefix offline and verify command resolution and runtime imports. There are no install, prepare or publish hooks; run verification explicitly before publishing. Stop any CAE experiment before replacing its installed package.

Only after the maintainer authorizes the exact version and has normal npm publish access:

```bash
npm publish ./codex-adaptive-effort-0.1.0-alpha.1.tgz --ignore-scripts \
  --access public --tag alpha --registry https://registry.npmjs.org/
npm view codex-adaptive-effort@0.1.0-alpha.1 version dist.integrity \
  --registry https://registry.npmjs.org/
```

Use npm's normal interactive authentication/OTP flow when required; never paste tokens into issues, shell arguments or source. Check that the registry integrity matches the reviewed archive and verify the `alpha` dist-tag before claiming release success. A missing package lookup does not reserve its name or prove ownership. After confirmed publication, update [installation availability](NPM.md) and the README. Publishing a package does not validate new native desktop versions.

## Fresh exports only: legacy first-publication helper

`scripts/publish-github.mjs` exists for an explicitly authorized, fresh source export without `.git`, targeting a new personal repository. It refuses existing history or an existing remote repository. It is not an update command.

```bash
node scripts/publish-github.mjs --owner YOUR_LOGIN --dry-run
# Only for an explicitly requested new public repository from a fresh export:
node scripts/publish-github.mjs --owner YOUR_LOGIN --public
```

Dry-run scans local publishable files without contacting GitHub or changing Git. Actual publication requires normal GitHub CLI authentication, a matching personal account and a confirmed missing target. The helper runs offline checks and does not extract tokens, change global credentials, delete repositories or force-push.

If publication partially succeeds, inspect the local Git state and actual remote before continuing. Keep any created repository; resolve the remaining step with normal authenticated Git. Do not erase history or export credentials to work around a failure.
