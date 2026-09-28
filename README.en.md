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

**Not established:** real Codex desktop/subscription compatibility, long-session acceptance, Chinese classification quality, task quality equivalence, cache benefits or monetary savings. WebSockets, native patches and `configuration_update` insertion are not implemented. Compacted, incremental or multimodal histories bypass effort adaptation. Request-level effort changes may affect caching.

See [Chinese quickstart](README.md), [local validation](docs/LOCAL_VALIDATION.md), [architecture](docs/ARCHITECTURE.md), [limits](docs/LIMITATIONS.md), [validation evidence](docs/VALIDATION.md) and [publication](docs/PUBLISHING.md).

MIT for this project's original code. Not affiliated with or endorsed by OpenAI or TypeSafe. External services retain their own terms. Never paste credentials into issues or chat.
