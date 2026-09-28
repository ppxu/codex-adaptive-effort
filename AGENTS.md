# Agent work contract

Project: Codex Adaptive Effort, experimental independent Node ESM implementation. Read README.md, docs/LIMITATIONS.md and docs/VALIDATION.md first. The initial planning-only package has been superseded by this code, not all long-term goals are implemented.

## Invariants

- Fixed user-selected model, provider, auth route and service tier. No account/quota workarounds.
- Never read, copy, print, upload or patch native login files, cookies, keychains, secrets, or `.cae/local.key`. Read local CAE token only in the application paths designed for it. Never put it in shell arguments.
- No global Codex configuration edits, no approval/sandbox bypass flags and no native binary replacement.
- Baseline + shadow by default. Live GPT or Jev calls need explicit user permission and existing normal credentials; absence of credentials is not permission to retrieve them elsewhere.
- User has requested open-source publication. Publishing original source to the named user-owned repository is allowed; `.cae`, capabilities captures, logs, dotenv, and private task histories are not publishable.
- Check actual remote/commit/CI state before claiming success. A connector without repo-creation capability cannot be represented as having created a repo.
- An executor body may change only `reasoning.effort` for eligible auto requests. Unsupported shapes bypass without deleting history. All upstream response bytes remain unchanged.
- Per-session transaction ownership, cancellation, stale revision rejection and completed-response lease commit must remain tested.
- No invented quality, success probabilities, cache savings or cost savings. `configuration_update`, WebSocket and a packaged desktop plugin are not implemented. The experimental desktop launcher is limited to its validated app/CLI version and new local threads; preserve its preflight and owned-process cleanup checks.

## Development

Run `npm run verify`. No dependency install hooks, network or paid provider calls in tests. Use synthetic fixtures. Actual model IDs and effort sets must come from a freshly captured native model/list or an explicitly supplied operator capability set. The test model `synthetic-model` must never be substituted into a live request.

Prefer small changes. Do not combine a native patch and proxy as two simultaneous controllers. Add a regression test for every confirmed defect. Update acceptance status honestly and preserve provenance.
