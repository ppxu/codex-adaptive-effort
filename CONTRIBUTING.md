# Contributing

CAE is an experimental independent implementation. Focus contributions on small, reviewable improvements within the [documented scope](docs/LIMITATIONS.md). Use English for new public documentation, issues and pull requests where possible; keep the Chinese entry point consistent when user-facing behavior changes.

## Development setup

```bash
git clone https://github.com/ppxu/codex-adaptive-effort.git
cd codex-adaptive-effort
npm ci --ignore-scripts
npm run verify
```

Use Node.js 22.16 or later. Runtime code is Node ESM with no third-party runtime dependencies. `verify` checks syntax, JSON and public Markdown links/anchors, runs tests and executes the offline demo. Tests use synthetic inputs and local servers: no real credentials, model generation or paid provider requests. CI covers Node 22/24 on Linux, macOS and Windows, plus the minimum Node 22.16.0 on Linux. Keep Actions pinned to reviewed commits when updating CI.

## Report a problem

Search existing issues, then use the bug report template. Include the source commit, OS/architecture, Node and native app/CLI versions, mode, auth route name and sanitized error codes. Reproduce with synthetic text. A UI response alone does not prove that traffic traversed CAE; distinguish decisions, sends and completed outcomes.

Never attach `.cae`, capability captures, dotenv files, raw native logs, auth files, keys, private paths or task histories. Follow [Security](SECURITY.md) for vulnerabilities instead of a public issue.

## Submit a change

1. Fork the repository or create a topic branch if you have write access.
2. Keep each change focused; preserve existing user work and avoid unrelated refactors.
3. Add a regression test for a confirmed defect. Keep provider calls mocked or on local test servers.
4. Run `npm run verify` and review `git diff --check` and the files being staged.
5. Update affected guides and the Unreleased changelog when behavior changes.
6. Open a pull request describing the problem, resulting behavior, validation and remaining limits.

There is no required commit-message convention. Prefer a short imperative summary. Passing CI is necessary evidence, not proof of native compatibility. Cite the exact commit and environment for any real acceptance claim; mark untested behavior explicitly.

## Behavioral contract

- Preserve the user-selected model, provider, auth route, service tier, approval policy and sandbox.
- Only eligible auto requests may change `reasoning.effort`; preserve executor history and upstream response bytes.
- Keep cancellation, per-session ownership, stale revision rejection and completed-response lease commits tested.
- Default to shadow + baseline. Real Jev/model calls require explicit authorization and normal credentials.
- Do not read native login files, retrieve secrets elsewhere, replace binaries, add implicit billing fallbacks or alter global Codex configuration.
- Record known usage and unknowns separately. Do not infer quality equivalence or savings from effort changes.

Read [AGENTS.md](AGENTS.md), [Architecture](docs/ARCHITECTURE.md), [Limitations](docs/LIMITATIONS.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before substantial work. Proposed third-party source imports must retain applicable licenses and provenance.
