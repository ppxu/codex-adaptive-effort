# Known limitations and acceptance boundaries

The dated [local acceptance record](LOCAL_ACCEPTANCE.md) describes the tested macOS CLI subset; [desktop acceptance](DESKTOP_ACCEPTANCE.md) covers an independent desktop instance on that installation. Neither establishes packaged desktop integration or general production readiness.

| Area | What is true now | What is not established |
|---|---|---|
| Code delivery | Runnable original Node ESM source, tests, offline demo | No claim of maintained production service |
| Proxy | Synthetic HTTP/SSE tests plus real CLI and isolated desktop ChatGPT-route acceptance | No WebSocket acceptance |
| Codex | Native model/list, isolated CLI, desktop plain-text off/locks/cancellation/recovery; CLI tools in off tested on one installation | Other client versions, packaged desktop installation, ordinary ChatGPT chats |
| ChatGPT auth | Native authentication worked for the recorded CLI run; CAE does not read login files | Other accounts, environments, attestation and client versions |
| API auth | Explicit separate api route; normal API key remains caller-owned | A subscription is not API credit; no live API request was made |
| Jev | TypeSafe HTTP contract implemented; parsing/failure/cancellation tested with fake responses | Live provider response and Chinese task classification quality |
| Model efforts | Supplied by actual capability probe or operator | No hardcoded assurance that any model supports all known effort names |
| Cache | Cache controls/history preserved; request-level effort only | No configuration_update insertion, cached-prefix preservation or measured savings |
| Context | Limited Unicode character excerpts and omission counts | Not token-exact, not all long-history requirements, no image/audio understanding |
| Errors | Explicit structured tool failure fields recognized | A plain text log can hide failure; content classification remains Jev's job |
| Bypass | Unsupported requests retain original bytes; structured tool-result history bypass was observed in a real session and is an accepted current boundary | Not every native history shape is tested; manual locks do not override the bypass |
| Sessions | Explicit header plus auth partition; otherwise no cross-call lease | Cannot infer a reliable session from cache keys or message similarity |
| Completion | Recognized SSE/JSON terminal metadata | A setting in a response does not prove actual reasoning allocation |
| Usage | Known counters and unknowns separated; evaluator attempts recorded | Dollar savings, account quota debits, quality equivalence and full-task costs |
| Other costs | Generation endpoint observed | Compaction costs, invisible retries, incomplete usage and external provider debits may be missing |
| Security | Local auth/Host/origin checks, bounded state, metadata logs, no redirects | Not resistant to a malicious same-user process; redaction is not total confidentiality |
| Recovery | No global config writes; normal Codex relaunch restores ordinary path | Proxy crash is not automatic failover |
| Publication | Existing public repository; baseline CI success verified | Every new commit needs its own CI result; never reuse an older commit's result |

Manual lock is instance-wide and only changes eligible `auto` requests. `off` and `shadow` never change effort, even with a lock set. To retain original execution without Jev cost use `off`; to remove the entire proxy from the path restart ordinary Codex.

A server process lifetime cap is not a spending guarantee. Services may bill requests that time out or are cancelled. No trial uses a real key unless the operator explicitly enables it.

Release blockers for any stable claim: independent security review; real native CLI acceptance for both intended auth paths; packaged desktop integration and upgrade compatibility; long-session/compaction acceptance; low/normal/hard task comparisons including Chinese short follow-ups; actual quality, cache, latency and cost observations. Until then, treat this as a protocol-level alpha.
