# Documentation

English is the default documentation language. Start with the [project overview](../README.md); a [Chinese README](../README.zh-CN.md) is also available.

## Use CAE

| Document | Purpose |
| --- | --- |
| [CLI validation](LOCAL_VALIDATION.md) | Discover capabilities, keep native auth, verify off/manual/shadow/auto in order |
| [Desktop launcher](DESKTOP_LAUNCHER.md) | Supported version, isolated startup, Jev controls and recovery |
| [Known limitations](LIMITATIONS.md) | Compatibility, privacy, reliability and measurement boundaries |
| [Security](../SECURITY.md) | Trust model and private vulnerability reporting |

## Understand the evidence

| Document | Purpose |
| --- | --- |
| [Current local acceptance](LOCAL_ACCEPTANCE.md) | Consolidated real results with source commits and CI links |
| [Desktop acceptance](DESKTOP_ACCEPTANCE.md) | Initial argument-scope fix and manual desktop transport validation |
| [Jev evaluation](JEV_SHADOW_ACCEPTANCE.md) | Evaluator-only fixtures, shadow runs, timing and unresolved timeouts |
| [Offline validation](VALIDATION.md) | Current test scope and the original dated evidence snapshot |
| [Code quality review](CODE_REVIEW_2026-09-28.md) | Confirmed defects, minimal fixes and synthetic regression evidence |
| [Acceptance template](acceptance-template.md) | Record a new environment without exposing private data |

## Develop and maintain

[Architecture](ARCHITECTURE.md) · [Contributing](../CONTRIBUTING.md) · [Maintainer handoff](../CODEX_START.md) · [Publishing](PUBLISHING.md) · [Changelog](../CHANGELOG.md) · [Provenance](../THIRD_PARTY_NOTICES.md)

## Original Chinese evidence

The following files preserve the original records at the English documentation transition. They include intermediate states and pending steps that were later resolved. Use the English pages above for current status; do not execute historical handoff instructions as a new plan.

- [Local acceptance chronology](LOCAL_ACCEPTANCE.zh-CN.md)
- [Initial desktop acceptance](DESKTOP_ACCEPTANCE.zh-CN.md)
- [Jev shadow chronology](JEV_SHADOW_ACCEPTANCE.zh-CN.md)
- [Desktop launcher and early validation](DESKTOP_LAUNCHER.zh-CN.md)
- [Original offline validation](VALIDATION.zh-CN.md)

The `validation/` artifacts are the original synthetic offline captures from 2026-09-24, not current native acceptance evidence. Private runtime captures, `.cae`, credentials and real task histories are never part of the documentation export.
