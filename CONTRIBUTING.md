# Contributing

Run `npm run verify` before proposing changes. The test suite and demo are offline with synthetic inputs; they must not require credentials or contact paid providers. Preserve the fixed-model/auth/billing contract, full executor history, byte-transparent responses, cancellation and metadata-only logging.

New compatibility claims require a real, versioned acceptance record, not a mocked test. Record OS/architecture, exact Codex version, mode, authentication route, request shape and outcome without publishing credentials or task text. Node/macOS/Windows CI configuration is not itself a passed matrix.

Changes to configuration or decision semantics need a test for stale state, cancellation and failure. Never introduce an implicit API billing fallback, an arbitrary upstream URL, auth-file scraping, shell evaluation of generated commands, or unbounded Jev input. Keep third-party source provenance and notices if importing code in the future.

Report measured usage and unknowns separately. Do not convert a shorter output or valid route into a claim of equivalent task quality or observed savings.
