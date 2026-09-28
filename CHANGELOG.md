# Changelog

User-visible changes are recorded here. Unreleased entries describe the current main branch; they are not a promise of a tagged release or production support.

## Unreleased

### Added

- Guarded macOS arm64 desktop launcher with version/signature checks, native capability/provider preflight and owned-process cleanup.
- Explicit desktop Jev shadow and auto trial controls, an eight-evaluation process cap and optional process-only 2000 ms timeout; the default ceiling remains 1500 ms.
- Metadata-only Jev fetch stage timings and actual timeout values in status.
- Bounded evaluator-only synthetic fixture runner for explicitly authorized real Jev checks.
- English-first documentation, Chinese entry point and preserved original acceptance records; issue and pull request templates.

### Fixed

- Preserve desktop provider overrides when native app-server uses subcommand-scoped configuration arguments.
- Recognize native `ultra` capabilities without widening individual models' supported effort sets.
- Handle headerless SSE for explicitly streaming requests and retain validated completion when a client closes after the terminal event.

### Validation

- Real tests on one documented macOS/app/CLI combination covered CLI transport, desktop off/manual locks/cancellation/recovery, Jev shadow, automatic upshift/downshift and timeout fallback.
- The runtime baseline passed 199 offline tests. Check the current commit's CI separately after documentation or tooling changes.
- Jev timeouts remain unresolved. A 665 ms successful downshift under a 2000 ms deadline does not establish a benefit from the larger deadline. No quality, cost or general compatibility claims were added.

## 0.1.0-alpha.1 — 2026-09-24

Initial source version: fixed-model effort controller, TypeSafe Jev Choice evaluator, bounded decision reuse, shadow/off/auto modes, manual controls, circuit/call limits, authenticated HTTP/SSE proxy, bounded audit metadata, capability probe, CLI launcher, offline tests and publication helper.

At that historical stage, native acceptance, repository publication and CI execution were not established. Later acceptance is recorded separately; this heading does not assert that a GitHub Release was published on this date.
