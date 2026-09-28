# Validation and evidence

## Current scope

`npm run verify` runs syntax/JSON checks, automated synthetic tests and the offline HTTP/SSE demo. These use no real model credentials or paid provider calls. CI runs the same checks on Linux, macOS and Windows with Node 22 and 24.

The runtime source `f346ffcf30ba4f6c34a9027b6ff585c8a42a5674` passed 199 tests on macOS arm64 / Node v24.16.0 and its [matching CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36389005837). Later commits must be evaluated against their own CI results; this historical count is not a live build status.

Use [local acceptance](LOCAL_ACCEPTANCE.md) for real native/model evidence and [limitations](LIMITATIONS.md) for untested boundaries. The [desktop record](DESKTOP_ACCEPTANCE.md) and [Jev record](JEV_SHADOW_ACCEPTANCE.md) separate actual transport from evaluator-only and shadow tests.

## English documentation transition — 2026-09-28

Against source baseline `b7e2b5086447845eea43f19632921ce917094826` plus the documentation/metadata/export-list changes in this revision, local `npm ci --ignore-scripts` and `npm run verify` exited 0: **200 tests passed**, no failures/cancellations/skips. The added regression ensures source exports include the language entry points and community templates. Runtime behavior and dependencies did not change; no real model calls were made.

The five original Chinese evidence files were checked byte-for-byte against the baseline. Local Markdown targets and anchors, issue-template YAML, `git diff --check`, and the public-source scanner passed. New commit CI must still be checked for its exact SHA.

## Original offline snapshot — 2026-09-24

The files in `validation/` are the initial Linux x64 / Node v22.16.0 capture. They are preserved unchanged and are **not current CI output**. The full [original Chinese narrative](VALIDATION.zh-CN.md) remains available.

| Check | Historical outcome | Evidence |
| --- | --- | --- |
| Syntax and JSON | 24 modules passed | [Offline output](validation/offline-verify.txt) |
| Tests | 145 passed, zero failed/cancelled/skipped | Same output |
| Coverage run | 145 passed | [Coverage output](validation/coverage.txt) |
| Synthetic demo | shadow, auto, reuse, manual lock, off | [Demo output](validation/demo.json) |
| Native Codex / real providers | Not tested in that container | [Snapshot metadata](validation/summary.json) |
| Repository and CI | Not established during that initial delivery | Historical status only; later publication supersedes it |

The coverage report includes test code among loaded files; it is not an independent measure of complete product quality. Original failures and later fixes are documented in the chronological acceptance records rather than rewriting the initial capture.

## Reproduce offline checks

```bash
npm ci --ignore-scripts
npm run verify
# Optional coverage inspection:
npm run coverage
```

Native metadata and real transport require the separate [validation procedure](LOCAL_VALIDATION.md). Do not infer desktop compatibility, authentication reliability, model quality, cache savings or cost reduction from offline tests.
