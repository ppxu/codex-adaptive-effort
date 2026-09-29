# Changelog

User-visible changes are recorded here. Unreleased entries describe the current main branch; they are not a promise of a tagged release or production support.

## Unreleased

No pending changes.

## 0.1.0-beta.1 — 2026-09-29

First beta, using the opt-in `beta` npm channel. Native desktop compatibility remains limited to the documented macOS/app/CLI combination; this is not a stable or production-readiness claim.

### Fixed and improved

- Keep authenticated health/off controls available when all 64 forwarding slots are occupied; controls have a separate eight-request limit.
- Observe BOM and CR/LF/CRLF SSE across chunk boundaries without changing response bytes, and restrict JSON terminal metadata to known statuses.
- Verify effective desktop retry settings, and forward wrapper termination to the owned native process with bounded cleanup.
- Reject unknown commands and surplus/missing operands before config reads; provide sanitized local recovery hints.
- Stream audit reports line by line and retain unknown usage for evaluator attempts interrupted before their finish record.
- Include complete linked public documentation in the npm archive, add an offline link/anchor check and troubleshooting guide, and exercise Node 22.16.0 in CI with pinned Actions.
- Advance the package version and default publish tag to `0.1.0-beta.1` / `beta`, with matching English and Chinese installation instructions. The published alpha archive remains unchanged.

### Validation

- 236 offline tests, including 22 new regression cases; archive installation and linked documentation are checked without model calls.
- Native signature/version, capability metadata and effective provider retry preflight passed on the existing validated installation. No real model/Jev generation was rerun for this iteration.
- See the [review and validation scope](docs/CODE_REVIEW_2026-09-29.md) and [release receipt](https://github.com/ppxu/codex-adaptive-effort/releases/tag/v0.1.0-beta.1) for the exact released commit, CI and registry checks. Known Jev timeout and general compatibility limits remain.

## 0.1.0-alpha.1 — 2026-09-24

Initial source version: fixed-model effort controller, TypeSafe Jev Choice evaluator, bounded decision reuse, shadow/off/auto modes, manual controls, circuit/call limits, authenticated HTTP/SSE proxy, bounded audit metadata, capability probe, CLI launcher, offline tests and publication helper.

The initial source date precedes the first npm publication on 2026-09-29. The additions and fixes below accumulated before that publication. At the initial source stage, native acceptance, repository publication and CI execution were not established; later acceptance is recorded separately. This heading does not assert a GitHub Release on the initial source date.

### Added

- Installable npm CLI package with an explicit runtime/docs file list, `cae --version`, offline archive/install tests and installation/upgrade instructions. The first npm alpha was published on 2026-09-29; see [release evidence](docs/VALIDATION.md#npm-registry-publication--2026-09-29).
- Guarded macOS arm64 desktop launcher with version/signature checks, native capability/provider preflight and owned-process cleanup.
- Explicit desktop Jev shadow and auto trial controls, an eight-evaluation process cap and optional process-only 2000 ms timeout; the default ceiling remains 1500 ms.
- Metadata-only Jev fetch stage timings and actual timeout values in status.
- Bounded evaluator-only synthetic fixture runner for explicitly authorized real Jev checks.
- English-first documentation, Chinese entry point and preserved original acceptance records; issue and pull request templates.

### Fixed

- Reject non-object native metadata/control frames and safely ignore non-object SSE data without changing response bytes.
- Bypass unknown or malformed history before evaluation; require response identity before committing a JSON completion lease.
- Validate upstream kinds against own string allowlist entries and keep offline syntax checks within public source boundaries.
- Preserve desktop provider overrides when native app-server uses subcommand-scoped configuration arguments.
- Recognize native `ultra` capabilities without widening individual models' supported effort sets.
- Handle headerless SSE for explicitly streaming requests and retain validated completion when a client closes after the terminal event.

### Validation

- The 2026-09-28 [code review](docs/CODE_REVIEW_2026-09-28.md) added 12 regressions: 212 offline tests passed locally; new-commit CI and native acceptance remain separate evidence.
- Real tests on one documented macOS/app/CLI combination covered CLI transport, desktop off/manual locks/cancellation/recovery, Jev shadow, automatic upshift/downshift and timeout fallback.
- The runtime baseline passed 199 offline tests. Check the current commit's CI separately after documentation or tooling changes.
- Jev timeouts remain unresolved. A 665 ms successful downshift under a 2000 ms deadline does not establish a benefit from the larger deadline. No quality, cost or general compatibility claims were added.
