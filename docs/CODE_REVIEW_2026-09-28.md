# Code quality review — 2026-09-28

## Scope and provenance

Reviewed all runtime modules, CLI and desktop entry points, maintenance scripts, offline tests and CI configuration. Focus areas were request mutation boundaries, transaction ownership, cancellation, completion, malformed protocol messages, subprocess cleanup and private-data handling. This was a source review with synthetic regressions, not an independent security audit or new native acceptance run.

Baseline: `1f3b4e205da4603c7aac1d066fa1c82b691cbd4d`. Its [matching CI run](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36391209920) succeeded. The changes accompanying this record require their own CI result; the baseline result does not validate them.

Local environment: macOS 27.0, arm64, Node v24.16.0. Validation took place on 2026-09-28 UTC. The pre-existing untracked source manifest was preserved and excluded from this change. No native configuration, credentials, local captures or private task histories were read for this review.

## Confirmed findings and fixes

| Priority | Finding | Fix and regression evidence |
| --- | --- | --- |
| P1 | `null` is valid JSON but caused uncaught property-access exceptions in SSE observation, native model metadata, desktop provider preflight and the desktop management socket. | Check object shape before accessing fields. Ignore non-object SSE events while preserving response bytes; fail native metadata checks with sanitized codes; close malformed management frames without stopping the supervisor. Unit, synthetic subprocess, socket and HTTP regressions cover these paths. |
| P1 | Unknown or malformed history entries could be silently omitted from evaluator evidence while the request remained eligible for effort changes. | Bypass unsupported history with `unsupported_history_item`, retaining original request bytes and making no evaluator call, even under a manual lock. Known text messages, opaque reasoning/call records and string tool outputs remain eligible and unchanged. |
| P2 | A JSON body with `status: completed` but no valid response ID could establish a reusable decision lease. | Require a nonempty string ID as well as completed status, consistent with SSE completion checks. Preserve observable usage and response bytes; do not commit a lease for malformed completion. |
| P2 | Upstream validation accepted inherited object properties such as `constructor`, and coerced array keys. | Require a string that is an own entry in the upstream allowlist. Invalid configuration fails before a proxy starts. |
| P2 | The syntax checker recursively parsed arbitrary repository-local JSON, including ignored captures and possible credential files. | Reuse the existing public-source selection and safety checks. Root captures, credential files and local manifests are excluded. Private files or symlinks inside public source roots are rejected before their contents are read. A synthetic fixture proves private root JSON is not parsed and malformed public JavaScript still fails. |

Eight focused regression tests were run against the unchanged implementation and failed as expected: four protocol crash paths, completion identity, history eligibility, upstream kind validation and private-file scanning. They passed after the fixes. Additional HTTP tests verify byte preservation, evaluator bypass and lease behavior, and a positive history test protects the accepted text/tool subset.

## Validation result

`npm run verify` passed with **212 tests**, zero failures, cancellations or skips, plus syntax/JSON checks and the offline HTTP/SSE demo. All provider responses and native metadata in this review were synthetic; HTTP tests used loopback servers. The check now also applies the existing public-source scanner.

Existing regression coverage for session ownership, stale control revisions, cancellation, late judge results, timeout fallback, call budgets, response byte preservation, desktop opt-in and process cleanup remains passing. No dependencies, external services, real generation, model capability capture or desktop application launch were needed.

## Behavior changes and remaining limits

Unsupported history now bypasses more conservatively. New native item/content types, refusal parts and structured tool outputs need explicit compatibility work before automatic or manual effort changes apply. Original upstream requests continue intact; this can reduce the number of requests CAE adjusts.

The known native compatibility window, Jev latency uncertainty, forced-supervisor-death recovery, lack of WebSocket support and unmeasured task quality/cost remain as documented in [limitations](LIMITATIONS.md). This review does not establish a new native version, improve the 2000 ms timeout evidence or justify production-readiness claims. If a later native version emits new history shapes, first capture sanitized metadata and add synthetic compatibility fixtures, then perform separately authorized transport acceptance.
