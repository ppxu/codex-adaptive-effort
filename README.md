# Codex Adaptive Effort

[![CI](https://github.com/ppxu/codex-adaptive-effort/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ppxu/codex-adaptive-effort/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22.16+](https://img.shields.io/badge/Node.js-%3E%3D22.16-339933.svg)](package.json)

**Keep your Codex model. Adapt its reasoning effort.**

Codex Adaptive Effort (CAE) is an experimental local HTTP/SSE proxy that can change `reasoning.effort` for a fixed, user-selected model. It supports the Codex CLI and an isolated instance of the validated Codex desktop application. An optional TypeSafe Jev evaluator recommends effort levels from the model's actual capabilities.

[简体中文](README.zh-CN.md) · [Documentation](docs/README.md) · [Acceptance evidence](docs/LOCAL_ACCEPTANCE.md) · [Changelog](CHANGELOG.md)

> **Alpha: `0.1.0-alpha.1`.** This is an independent project, not an official OpenAI or TypeSafe plugin. Desktop support is limited to the exact macOS/app/CLI combination documented below. Task quality, cost savings and production reliability are not established.

## What it does

| Feature | Behavior |
| --- | --- |
| Fixed execution model | Keeps the selected model, provider, auth route and service tier; other models bypass adaptation |
| `off` | Forwards requests without evaluation or effort changes |
| `shadow` (default) | Records recommendations while forwarding the original request |
| `auto` | Applies a validated effort to eligible requests; preserves all other request fields |
| Optional Jev evaluation | Sends a bounded text projection to TypeSafe; uses separate credentials and a call limit |
| Safe fallback | Retains incoming effort on evaluator failure; unsupported histories bypass adaptation |
| Local controls | Authenticated loopback controls, manual locks, cancellation and bounded decision reuse |
| Evidence | Metadata-only decisions, actual send events and response completion; no invented savings |

The default evaluator is **baseline-only**, a transport test fixture rather than a complexity classifier. Live Jev processing must be explicitly enabled. CAE never rewrites global Codex configuration or reads native login files. Native Codex handles its own login.

## Install from source

Requires Node.js **22.16+**, Git and an existing Codex installation for native integration. There are no third-party runtime dependencies. The package is not published to npm; use the checked-out CLI directly.

```bash
git clone https://github.com/ppxu/codex-adaptive-effort.git
cd codex-adaptive-effort
npm ci --ignore-scripts
npm run verify
node bin/cae.mjs --help
```

Verification uses synthetic data and local test servers; it does not call real model providers. CI runs on Linux, macOS and Windows with Node 22 and 24. Passing CI does not imply native integration on all these platforms.

## Quick start: inspect capabilities

```bash
node bin/cae.mjs doctor
node bin/cae.mjs probe > capabilities.local.json
```

These commands inspect the native CLI and query `model/list`; they do not generate model output. If Codex is not on `PATH`, pass `--codex /path/to/trusted/codex`. Select a real model ID and its supported effort values from the capture; do not assume every model supports every effort. Captures stay local and are ignored by Git.

Continue with the [CLI validation guide](docs/LOCAL_VALIDATION.md) or the [desktop launcher guide](docs/DESKTOP_LAUNCHER.md).

## Desktop trial

Validated on **macOS 27.0 arm64**, **ChatGPT/Codex desktop 26.924.22138 (build 11645)** and its bundled **codex-cli 0.158.0-alpha.2.1**. The launcher checks the official application signature, exact version, current capabilities and effective provider. Other combinations are rejected pending validation; it does not install or replace native binaries.

```bash
# Replace MODEL_ID with an ID returned by your native probe.
node bin/cae.mjs desktop start --model "$MODEL_ID" --auth chatgpt --enable-upstream
# In another terminal:
node bin/cae.mjs desktop status
node bin/cae.mjs desktop stop
```

Use a **new local Codex chat** in the experimental window and a directory containing only non-sensitive test material. Existing chats retain their providers. The instance has separate Electron data but shares native Codex home and login. Ordinary ChatGPT conversations and cloud tasks are outside this integration.

Starting the launcher does not submit a task. Sending a task uses the normal model allowance. The default is shadow + baseline. For real Jev evaluation, provide your own `TYPESAFE_API_KEY` through your normal environment setup and add `--enable-jev`:

- `--enable-jev`: process-only Jev shadow; `auto` and manual locks remain disabled.
- Add `--allow-jev-auto`: permits an explicit `control auto` after startup; it does not switch modes automatically.
- Optional `--jev-timeout-ms 2000`: replaces the timeout for this process only. The default ceiling remains 1500 ms.

Desktop Jev trials allow at most eight evaluations per process. A timeout or cancellation may still incur provider usage. Read the [complete controls and recovery procedure](docs/DESKTOP_LAUNCHER.md) before enabling auto.

## Validation status

Real tests on the documented installation covered CLI transport, desktop off, manual low/high locks, cancellation/recovery, Jev shadow, automatic `medium → high`, automatic `medium → low`, and timeout fallback. The latest downshift took 665 ms with a 2000 ms limit; **this does not show that increasing the limit improves reliability**. Some earlier evaluations timed out, and their root cause remains unresolved.

See [versioned acceptance evidence](docs/LOCAL_ACCEPTANCE.md) and [known limitations](docs/LIMITATIONS.md). WebSockets, packaged desktop plugins, `configuration_update`, automatic model routing and full cache optimization are not implemented. Structured tool-result, compacted, incremental or multimodal histories can bypass adaptation, including manual locks.

## Stop and restore

```bash
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs desktop stop
```

`off` still uses the proxy. Stop the experimental instance and return to ordinary Codex to leave the proxy path. No global configuration or login files need restoring. A proxy crash does not automatically switch to a direct connection.

## Contribute and get help

- Read [Contributing](CONTRIBUTING.md) before opening a pull request.
- Use [Issues](https://github.com/ppxu/codex-adaptive-effort/issues) for bugs, questions and feature proposals with synthetic reproductions.
- Follow [Security](SECURITY.md) for vulnerabilities; never attach credentials, raw logs or private task histories.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License and provenance

[MIT](LICENSE) for this project's original code. Design inspiration and fixed source references are recorded in [Third-party notices](THIRD_PARTY_NOTICES.md). No Codex, Astra-Ares or Jev Codex Router source or binaries are bundled. External services retain their own terms; no model-quality or billing guarantees are made.
