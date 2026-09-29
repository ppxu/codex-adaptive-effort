# Code quality and usability review — 2026-09-29

## Scope and baseline

Reviewed runtime and CLI/desktop entry points, protocol boundaries, cancellation and child ownership, audit/reporting, package contents, public documentation and repository CI. Baseline: `3726e3178bdc218da794ee20c493db7826fedf5d`; its [six-job CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36514188536) passed. This source revision needs its own CI result.

The baseline passed `npm ci --ignore-scripts` and `npm run verify`: 214 tests on macOS arm64 / Node 24.16.0. Baseline coverage was also inspected to identify unexercised branches; its aggregate percentage is not a measure of native compatibility or complete product quality. Existing local files were preserved.

## Findings and changes

| Area | Finding and resulting behavior | Verification |
| --- | --- | --- |
| Availability | 64 active forwarding requests also blocked health and off controls. Eight separate authenticated control slots now remain available while the 64-request forwarding cap still applies. | Real loopback saturation, 429 for excess forwarding, successful health and off control. |
| Streaming | The metadata observer missed valid CR-only SSE, leading BOM and case-insensitive SSE media types. It now handles CR/LF/CRLF across byte boundaries without changing relayed bytes. An incomplete final event still cannot commit a lease. | Byte-fragmented Unicode, each line-ending form, truncation and HTTP byte-preservation regressions. Parsing follows the [SSE format](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream). |
| Privacy | Arbitrary JSON `status` strings from provider bodies could become audit terminal metadata. Only known status values are now recorded. | Synthetic private status remains absent from metadata. |
| Desktop preflight | Effective provider checks omitted retry settings. Both native request and stream retry counts must now equal zero. Preflight uses the installed package version. | Synthetic native config/read rejects either nonzero retry setting. |
| Process ownership | The CLI wrapper did not forward termination to its native child. CLI and desktop bridge now share owned-child signal forwarding, a one-second termination deadline and handler cleanup. | Real synthetic subprocesses: normal exit, SIGINT, SIGTERM, missing executable and POSIX escalation. |
| CLI usability | Unknown commands could report missing config, and surplus operands could be silently ignored. Commands/operands are validated before config access; common local failures have sanitized recovery hints. | Actual CLI subprocess failures and existing lifecycle integration. |
| Reporting | Reports retained the complete log plus parsed records and omitted unknown usage for interrupted evaluator attempts without a finish record. Reports now fold one line at a time and keep incomplete attempts unknown. | Streamed/in-memory totals, zero versus unknown counters, malformed/truncated records and missing logs. Memory scales with the largest line and stream buffering instead of the full log; log rotation remains unimplemented. |
| npm documentation | The archive omitted targets linked from its README and bundled guides. Its explicit allowlist now includes the complete linked public documentation and original synthetic evidence. | Real offline archive/install plus installed-document link checks; synthetic private sentinels remain excluded. |
| Maintenance | Relative links and section anchors were not continuously checked, and CI did not exercise the advertised minimum Node version. Verification now checks public document links offline. CI adds Linux/Node 22.16.0, pins existing v4 actions to verified commit SHAs and cancels superseded branch runs. | Public-source boundary tests, link/anchor fixtures, package checks and the exact new commit's CI. |

Eight protocol/control/CLI regression cases failed before repair. A separate interrupted-attempt regression and the installed-document check also failed before their fixes. No failing test was removed or relaxed.

## Validation and release boundary

The revised source passed 236 offline tests locally, including 22 new cases. The real installed native metadata probe and stricter provider preflight also passed without generation. Detailed environment, model capabilities, runtime fingerprint and a synthetic reporting memory comparison are recorded in [Validation](VALIDATION.md#comprehensive-review--2026-09-29). This review does not establish a new native desktop version, real model/Jev generation, task-quality or cost improvement, a stable release, or an npm publication. At review time these changes were unreleased; they are included in `0.1.0-beta.1`, whose [publication receipt](https://github.com/ppxu/codex-adaptive-effort/releases/tag/v0.1.0-beta.1) is separate evidence. The published `0.1.0-alpha.1` archive remains immutable.

Native desktop guards, fixed model/provider/auth/service tier, conservative history bypass, manual-lock scope and completed-response lease ownership remain in force. Independent security review, general native compatibility, crash recovery after forced supervisor death and representative task-quality/latency/cost evidence remain outstanding.
