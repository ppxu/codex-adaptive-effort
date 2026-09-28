# Local acceptance

**As of 2026-09-28:** the documented installation passed the basic CLI and isolated desktop transport path, including real Jev-driven upshift, downshift and timeout fallback. This supports bounded trials on that installation, not general production compatibility.

This English summary consolidates the [original Chinese chronology](LOCAL_ACCEPTANCE.zh-CN.md), preserved with its source hashes and intermediate failures. Documentation translation did not rerun model calls or turn historical results into new evidence. All times below are UTC+08:00 unless specified otherwise.

## Tested environment

| Item | Observed value |
| --- | --- |
| OS / CPU | macOS 27.0 / arm64 |
| Node | v24.16.0 |
| Desktop | ChatGPT/Codex 26.924.22138, build 11645 |
| Native CLI | `codex-cli 0.158.0-alpha.2.1` |
| CLI path | `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` |
| Auth route | Native ChatGPT login; no API billing fallback |
| Fixed executor | `gpt-6-astra`, incoming medium |
| Latest runtime source tested | `f346ffcf30ba4f6c34a9027b6ff585c8a42a5674` |
| Runtime baseline CI | [36389005837](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36389005837), success for that SHA |

## Offline and capability checks

At 14:54, `npm run verify` exited 0: **199 tests passed**, no failures/cancellations/skips, 32 module syntax checks, JSON parsing and the offline demo passed. Dependency files were unchanged from the 14:41 successful `npm ci --ignore-scripts`. The real doctor/probe at 14:54:42 exited 0 and queried metadata only. The focused model remained medium by default, supporting low/medium/high/xhigh/max/ultra.

The earlier repaired native capture listed these models; it is a dated observation, not a built-in capability guarantee:

| Model | Default | Supported efforts |
| --- | --- | --- |
| gpt-6-astra | medium | low, medium, high, xhigh, max, ultra |
| gpt-6-sol | medium | low, medium, high, xhigh, max, ultra |
| gpt-6-luna | medium | low, medium, high, xhigh, max |
| gpt-5.6-sol | low | low, medium, high, xhigh, max, ultra |
| gpt-5.6-terra | medium | low, medium, high, xhigh, max, ultra |
| gpt-5.6-luna | medium | low, medium, high, xhigh, max |
| gpt-5.5 | medium | low, medium, high, xhigh |

Always refresh the native probe for a new environment or client upgrade. Never substitute `synthetic-model` in live traffic.

## Real acceptance matrix

| Area | Result | Scope / evidence |
| --- | --- | --- |
| CLI HTTP/SSE | Passed | ChatGPT route; off, read-only tools, follow-up, plain-text low/high manual locks, cancellation/recovery |
| Desktop startup and provider | Passed | Isolated instance, actual provider preflight, new local chats |
| Desktop manual control | Passed | Off, low/high, cancellation and same-chat recovery; [initial desktop record](DESKTOP_ACCEPTANCE.md) |
| Jev evaluator-only fixtures | Passed protocol checks | Eight real evaluations, no executor generation; semantic limitations remain |
| Desktop Jev shadow | Passed second three-case group | 795/552/591 ms; all main requests retained medium and completed |
| Real auto upshift | Passed | medium → high, Jev 1137 ms, request sent high, HTTP 200 + response.completed |
| Real auto timeout fallback | Passed fallback, failed timely evaluation | 1511 ms timeout, medium retained, task completed |
| Real auto downshift | Passed | medium → low, Jev 665 ms, request sent low, HTTP 200 + response.completed |
| Other-model traffic | Passed bypass | Native auxiliary model requests remained unchanged; CAE did not select their model |
| Stop and cleanup | Passed for tested normal exits | off, stopped, management socket removed and proxy port no longer listening |
| Structured tool-result history | Accepted limitation | Bypasses adaptation, even with manual locks |
| Real auto cancellation / long sessions | Not tested | Offline contracts do not establish real acceptance |
| Other client versions / platforms / API route | Not established | CI and local ChatGPT results cannot validate these |
| Quality, savings and stable latency | Not established | No controlled task-level comparison |

## Auto trial provenance

The first auto trial used `d8407feb878879140b17202bb1864593864cde00` with [matching successful CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36387895997). At 14:45–14:46, the spelling task timed out at 1511 ms and safely retained medium; the fictional concurrency task received high at 1137 ms and completed with a changed outbound effort.

The timeout last observed request creation at 8.2 ms and no send-start/body-sent/response event before termination. This narrows investigation toward the pre-send phase but does not identify DNS, TCP, TLS, queueing or server responsibility. Missing send instrumentation is not proof of zero remote processing or billing. Earlier uninstrumented timeouts cannot be retroactively assigned this cause.

The downshift trial used `f346ffcf30ba4f6c34a9027b6ff585c8a42a5674`. At 14:58:35–14:58:43, Jev returned low in 665 ms (lease 1, diagnostic confidence 0.96). The linked decision/prepared/sent events showed medium → low; the main request completed with HTTP 200. A separate client `gpt-6-luna` request bypassed and completed. One Jev call and two upstream requests were observed; no retries were added.

The downshift had a 2000 ms deadline but completed below the original 1500 ms limit. **Its success does not establish that 2000 ms improves reliability.** Context and connection conditions differed between batches. The default stays 1500 ms; 2000 ms remains explicit and process-only.

Downshift cumulative timings: created 5.0 ms, send start 348.6 ms, body sent 352.2 ms, headers 653.5 ms, body complete 663.8 ms, validated 664.2 ms. These are observation milestones, not pure server inference measurements. Known Jev input usage was 1694 tokens; evaluator output usage and actual response model version were not captured and remain unknown.

At 14:59:03 the instance was set off with 1/8 evaluator calls, no active requests, no lock and no open circuit. Stop succeeded; the management socket was gone and port 4319 no longer listened. Disk configuration remained shadow / baseline / 1500 ms. Normal login, global configuration, approvals and sandbox were not changed.

## Reproduce and interpret

Follow [local validation](LOCAL_VALIDATION.md) or [desktop startup and recovery](DESKTOP_LAUNCHER.md). Use actual capabilities, explicitly authorize real calls and submit only non-sensitive fixtures. Stop after the planned sample count; do not retry until a preferred recommendation appears.

Correlate recommendations with actual sends and completion using local metadata, then publish only a sanitized summary. A setting sent successfully is not proof of actual reasoning allocation, task quality or savings. Raw logs, `.cae`, captures, credentials and real task text remain uncommitted. Every new commit needs its own CI check; the historical links above apply only to their stated commits.
