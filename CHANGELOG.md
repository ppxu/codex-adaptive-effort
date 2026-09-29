# Changelog

User-visible changes are recorded here. Unreleased entries describe the current main branch; they are not a promise of a tagged release or production support.

## Unreleased

### Reliability and usability iteration

- Keep authenticated health/off controls available when all 64 forwarding slots are occupied; controls have a separate eight-request limit.
- Observe BOM and CR/LF/CRLF SSE across chunk boundaries without changing response bytes, and restrict JSON terminal metadata to known statuses.
- Verify effective desktop retry settings, and forward wrapper termination to the owned native process with bounded cleanup.
- Reject unknown commands and surplus/missing operands before config reads; provide sanitized local recovery hints.
- Stream audit reports line by line and retain unknown usage for evaluator attempts interrupted before their finish record.
- Include complete linked public documentation in future npm archives, add an offline link/anchor check and troubleshooting guide, and exercise Node 22.16.0 in CI with pinned Actions.
- These changes are source-only and are not in the published `0.1.0-alpha.1`. See the [review and validation scope](docs/CODE_REVIEW_2026-09-29.md).

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

## 0.1.0-alpha.1 — 2026-09-24

Initial source version: fixed-model effort controller, TypeSafe Jev Choice evaluator, bounded decision reuse, shadow/off/auto modes, manual controls, circuit/call limits, authenticated HTTP/SSE proxy, bounded audit metadata, capability probe, CLI launcher, offline tests and publication helper.

At that historical stage, native acceptance, repository publication and CI execution were not established. Later acceptance is recorded separately; this heading does not assert that a GitHub Release was published on this date.
