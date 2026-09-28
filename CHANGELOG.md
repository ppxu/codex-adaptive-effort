# Changelog

## Unreleased — 2026-09-28

- Recognize native ultra effort capabilities without widening individual model effort sets.
- Observe headerless SSE only for explicitly streaming requests; preserve validated completion when a native client closes after the terminal event.
- Add regression coverage (153 offline tests) and record scoped macOS CLI ChatGPT-route acceptance, including the accepted structured-tool-history bypass.
- Desktop integration and live Jev remain unimplemented or unverified respectively.

## 0.1.0-alpha.1 — 2026-09-24

First independent implementation: fixed-model effort controller, TypeSafe Jev Choice evaluator, 1–4 generation leases, shadow/off/auto modes, manual lock, circuit/call limit, authenticated local HTTP/SSE proxy, unmodified executor history, bounded metadata-only observation, native capability probe, one-off CLI launcher, offline demo and tests.

Provides safe fresh-source GitHub publishing helper and CI definition. No remote repository, live model/TypeSafe acceptance, desktop installation, WebSocket adapter, native checkpoint patch or configuration-update cache optimization is implied by this source release.
