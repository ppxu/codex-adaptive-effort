# Publishing the first public repository

The source delivery is not proof that a remote exists. The connector used for initial development could read/write existing repositories but exposed no repository-creation action. No remote repository was created during that delivery.

On your own machine, install Git and GitHub CLI and use the normal `gh auth login` flow if necessary. Do not copy a token to chat. The helper only asks GitHub for the active login and repository metadata; it never prints an auth token.

For the intended first owner:

```bash
node scripts/publish-github.mjs --owner ppxu --dry-run
node scripts/publish-github.mjs --owner ppxu --public
```

Dry run does not contact GitHub or mutate Git. Actual publication requires the public flag, a matching authenticated account, a positively observed 404 for the exact repository and a fresh source export without `.git`. It runs all offline tests before creating anything remotely. It stages only allowlisted source/docs/test files; runtime `.cae`, dotenv and capture files are excluded. A best-effort secret-pattern scan is an additional check, not a substitute for reviewing the source.

The new repository name is `codex-adaptive-effort`. The initial commit uses a generic contributor name and noreply address, not a private personal email. Publishing adds an origin remote locally and pushes main. The script does not delete existing repositories, force-push, set new global Git credentials or write provider secrets.

The helper supports personal repositories with a login matching --owner; organization creation is deliberately not inferred. Running it in an existing Git history is refused to avoid publishing deleted secrets from history. After initial publication, maintain the project through normal Git commits and pull requests.

## Failure recovery

If the script stops before `git init`, fix the reported precondition and rerun. If `.git` was already created, inspect `git status`, `git remote -v` and the actual GitHub repository state before taking another action. Do not delete a remote or force-push to make the script pass. A fresh extracted source copy may be used only after confirming no remote was created. If creation succeeded but push failed, push the reviewed local commit through normal authenticated Git after checking the exact remote.

If GitHub rejects workflow files because the local credential lacks workflow permission, keep the repository and report that limitation. Use the normal GitHub CLI permission/login flow chosen by the user, not manual token extraction. The script does not elevate scopes automatically.

GitHub Actions is configured, not pre-verified: a successful local test or push does not establish a successful remote CI run. Verify public visibility, branch, commit SHA and workflow results separately.
