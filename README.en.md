# Codex Adaptive Effort

Experimental fixed-model reasoning-effort control for local Codex. **v0.1.0-alpha.1**.

This is an independent Node.js implementation inspired by Astra-Ares and Jev Codex Router, not a combined distribution of their source. It implements an authenticated loopback HTTP/SSE adapter, a transactional decision controller, a TypeSafe Jev evaluator, bounded leases, manual controls, an app-server capability probe, an isolated CLI launcher and metadata-only reports.

The default is **shadow + baseline-only evaluator**. Baseline-only is not a complexity classifier. Live Jev requires an explicit separate key, configuration selection and `--enable-jev`; live upstream use requires `--enable-upstream`. Fixed model/auth/billing paths never change automatically.

```sh
npm ci --ignore-scripts
npm run verify
node bin/cae.mjs --help
node bin/cae.mjs doctor
```

Requires Node >=22.16. No third-party runtime dependencies. Verification uses synthetic local HTTP/SSE and a fake app-server. No paid providers or real Codex sessions are run during tests.

**Local acceptance:** one macOS arm64 installation passed native CLI transport over the ChatGPT route, off, read-only tools, multi-turn continuation, plain-text manual low/high locks, cancellation and recovery. See [the dated acceptance record](docs/LOCAL_ACCEPTANCE.md) for the exact client, model and limitations. Structured tool-result histories still bypass adaptation, including manual locks.

An independent instance of the installed desktop app also passed off, plain-text low/high locks, cancellation and same-thread recovery after an app-server argument-scope fix. See [desktop acceptance](docs/DESKTOP_ACCEPTANCE.md). This covers its Codex programming surface, not ordinary ChatGPT chats or a packaged desktop plugin.

The experimental macOS arm64 launcher provides `desktop start/status/stop`, fresh capability and effective-provider checks, and owned-process cleanup. It accepts only the documented application/CLI version, defaults to shadow + baseline, and does not enable Jev. Use a new local thread; existing threads retain their providers. See [launcher instructions](docs/DESKTOP_LAUNCHER.md).

**Not established:** packaged desktop integration, other client/account environments, live Jev, long-session acceptance, Chinese classification quality, task quality equivalence, cache benefits or monetary savings. WebSockets, native patches and `configuration_update` insertion are not implemented. Compacted, incremental or multimodal histories bypass effort adaptation. Request-level effort changes may affect caching.

See [Chinese quickstart](README.md), [local validation](docs/LOCAL_VALIDATION.md), [architecture](docs/ARCHITECTURE.md), [limits](docs/LIMITATIONS.md), [validation evidence](docs/VALIDATION.md) and [publication](docs/PUBLISHING.md).

MIT for this project's original code. Not affiliated with or endorsed by OpenAI or TypeSafe. External services retain their own terms. Never paste credentials into issues or chat.
