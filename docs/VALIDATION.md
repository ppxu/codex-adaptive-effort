# Validation and evidence

## Current scope

`npm run verify` runs syntax/JSON checks, automated synthetic tests and the offline HTTP/SSE demo. These use no real model credentials or paid provider calls. CI runs the same checks on Linux, macOS and Windows with Node 22 and 24.

The runtime source `f346ffcf30ba4f6c34a9027b6ff585c8a42a5674` passed 199 tests on macOS arm64 / Node v24.16.0 and its [matching CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36389005837). Later commits must be evaluated against their own CI results; this historical count is not a live build status.

Use [local acceptance](LOCAL_ACCEPTANCE.md) for real native/model evidence and [limitations](LIMITATIONS.md) for untested boundaries. The [desktop record](DESKTOP_ACCEPTANCE.md) and [Jev record](JEV_SHADOW_ACCEPTANCE.md) separate actual transport from evaluator-only and shadow tests.

## Comprehensive review — 2026-09-29

The [review record](CODE_REVIEW_2026-09-29.md) covers source changes against `3726e3178bdc218da794ee20c493db7826fedf5d`. On macOS 27.0 arm64 / Node v24.16.0 / npm 11.18.0, the baseline passed 214 offline tests. The accompanying changes passed **236 tests**, zero failures, cancellations or skips, plus syntax/JSON checks, public document links and the offline demo. Archive/install tests verify all installed files and documentation links in a temporary prefix without changing the user's global installation. Windows skips only the existing POSIX checks and the new POSIX signal-escalation test; check the exact commit's CI for platform results.

Native metadata was separately checked at `2026-09-29T03:32:11.705Z`, using the signed installed application's bundled CLI: desktop `26.924.22138` / build `11645`, CLI `0.158.0-alpha.2.1`. Signature/version inspection, `model/list` and effective `config/read` preflight exited 0. Zero model/Jev generations were made and no experimental desktop was launched. The stricter retry checks passed for the actual provider configuration with the existing ChatGPT route, `gpt-6-astra` and medium baseline. No native/global configuration was written.

| Actual model ID | Default effort | Supported efforts |
| --- | --- | --- |
| `gpt-6-astra` | medium | low, medium, high, xhigh, max, ultra |
| `gpt-6-sol` | medium | low, medium, high, xhigh, max, ultra |
| `gpt-6-luna` | medium | low, medium, high, xhigh, max |
| `gpt-5.6-sol` | low | low, medium, high, xhigh, max, ultra |
| `gpt-5.6-terra` | medium | low, medium, high, xhigh, max, ultra |
| `gpt-5.6-luna` | medium | low, medium, high, xhigh, max |
| `gpt-5.5` | medium | low, medium, high, xhigh |

The probe returned seven models and skipped zero entries. These values describe that capture only. The runtime fingerprint for this iteration is SHA-256 `5927aae3c888ba3ca93c3b8d690aa5015626ccb3f9509438a316c3b4e5da95b8`, computed over lexically sorted `bin/*.mjs` and `src/*.mjs` by hashing each relative path, NUL, file bytes and NUL. Check the accompanying commit's CI; the baseline CI is not a substitute.

A local reporting microbenchmark used 100,000 identical synthetic `upstream_outcome` rows (12,500,000 bytes), with completed=true and input/cached/output/reasoning counters 100/40/20/8. Three fresh Node processes per implementation reported identical totals: 100,000 requests and 2,000,000 output tokens. Baseline `3726e31` full-file parsing plus report had peak RSS 145,376–145,664 KiB (median 145,488), versus 63,376–63,456 KiB (median 63,440) for `reportFile`. Measured report durations were 69–103 ms versus 58–59 ms. Baseline ran first on a warm local filesystem; this is a small synthetic memory check, not a statistical latency comparison or a claim about model cost. Temporary benchmark files were removed.

The iteration did not rerun real native transmission, cancellation in the UI, Jev evaluation or task-quality acceptance, and did not publish to npm. Those remain separate from metadata and synthetic tests. See [troubleshooting](TROUBLESHOOTING.md) for source-only fixes and the existing transport guides for the next explicitly authorized native trial.

## npm registry publication — 2026-09-29

Published `codex-adaptive-effort@0.1.0-alpha.1` from tested source `1b0e27d32662eae9871792fce0e76f6a4d9f5ebe` at `2026-09-29T02:31:48.211Z`. All six jobs in the [matching package CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36512282178) passed. The archive contains 24 public files and has SHA-512 integrity:

```text
sha512-qhz5N7CfVAAszbLTqsRDw0Tsn8kaZSMM8NJZcm5+UKu4xN9kmrPhe/HL6bGMcXprFNm04zmvR+nS7WjGX5rerA==
```

Anonymous registry metadata matched this integrity and version; both `alpha` and `latest` pointed to `0.1.0-alpha.1` at verification. Use the explicit `@alpha` installation command. A clean registry install with empty npm configs and a temporary global prefix passed `cae --version` and `cae --help`. It did not change the user's global npm prefix or call a model. The published archive is the original reviewed package-preparation snapshot; subsequent repository documentation records its release without changing the immutable archive.

## npm package preparation — 2026-09-29

Against baseline `c53b588f16cac5b0a32a613f50634dca6cecc1fa` plus this package change, `npm ci --ignore-scripts` and `npm run verify` passed locally on macOS 27.0 arm64 / Node v24.16.0 with npm 11.18.0: **214 tests**, zero failures, cancellations or skips, plus syntax/JSON checks and the offline demo.

The two added tests enforce an explicit runtime allowlist without lifecycle hooks/dependencies, then use real `npm pack` and `npm install --global --prefix <temporary directory>` in offline mode with empty npm user/global configs. They inspect archives from both synthetic staging and the actual checkout, then verify byte-identical installed files, the actual `cae` command shim, package version/help, synthetic initialization and launch arguments, and the desktop entry point's authorization gate. Synthetic private sentinel files placed both at the package root and under source/docs are excluded. The user's global npm installation is not changed.

No registry publication, real model/Jev call or native desktop launch was performed. Package installation is distinct from native compatibility acceptance. See [npm usage](NPM.md) and [release steps](PUBLISHING.md); the new commit requires its own CI result.

The first package CI run on `8d7453a5d920fa433681cdfec3a4b30030c3dec8` exposed a Windows checkout issue: Git produced CRLF executable shebangs and npm normalized the installed CLI's first line, failing the byte-preservation assertion on both Node versions. Executable entry points now have explicit LF checkout attributes; the assertion remains strict and the package test also checks shebang line endings. Linux/macOS passed that initial run. Use the follow-up commit's CI to establish the repaired Windows result.

## Code quality review — 2026-09-28

Against baseline `1f3b4e205da4603c7aac1d066fa1c82b691cbd4d` plus the fixes accompanying this record, `npm run verify` passed **212 tests** on macOS 27.0 arm64 / Node v24.16.0, with no failures, cancellations or skips. Eight focused regressions first reproduced defects in the baseline implementation. The public-source scan, syntax/JSON checks and offline demo passed. No real model or Jev calls were made; native compatibility was not revalidated. See the [review findings and scope](CODE_REVIEW_2026-09-28.md). Check this revision's exact CI SHA separately.

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
