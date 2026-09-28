# Architecture / v0.1.0-alpha.1

```text
Native Codex CLI (one-off custom provider settings, native auth)
       |
       | HTTP Responses; optional SSE; native session header when present
       v
127.0.0.1 CAE proxy -- local token + Host + origin checks
       |
       +--> bounded text projection --> TypeSafe Jev --> effort + lease
       |       (or baseline fixture for transport verification)
       |
       +--> controller: validated decision + revision + single session owner
       |       | off / unsupported: original bytes
       |       | shadow: original bytes, proposed effort only in audit
       |       | auto: full body with reasoning.effort changed only
       v
Fixed OpenAI API OR experimental ChatGPT Codex backend
       |
       +--> response bytes streamed unchanged --> Codex
       +--> bounded terminal metadata observer --> usage + completion audit
```

## Ownership and commit

`Controller.prepare` reserves one owner per recognized session and computes local integrity fingerprints. A new user input, changed model/instructions/tools/reasoning setting, non-append-only history or newly observed explicit tool error breaks reuse. A retained decision applies for at most 1–4 generations, with a fixed deadline that does not extend on every reuse. A repeated identical request is not counted as a continuation.

A decision is not proof of application. `beforeSend` checks the latest control revision. `request_prepared` marks request construction; `request_sent` is emitted only when the Node HTTP request finishes writing. Even that is **not** evidence that the model obeyed the setting. `upstream_outcome` records the actual terminal event/status/usage, if observable. A lease is committed only after successful stream completion and only for the same control revision. Unknown or truncated completion never establishes a lease.

The native `session_id` or explicit trusted `x-cae-session` is HMAC'd together with the auth partition using a per-process salt. These identifiers are not written to logs or sent to Jev. `prompt_cache_key` is preserved but never treated as session identity. Without a session header, every eligible call is assessed independently and lease=1. Sessions are capped at 128 retained entries; 64 in-flight HTTP handlers at most. Memory state is not durable across restart.

## Context and scope

The executor retains every input item, encrypted reasoning item, instruction, tool definition, result, service tier and cache key. The evaluator gets a bounded character projection: recent user context, latest user request, up to two public notes and three tool-result excerpts, plus omission metadata. The projection does not run another language model or token-costly summarizer. It is intentionally limited; long-history requirements may be omitted. Chinese task understanding must be evaluated with real tasks.

Media, existing configuration updates, standalone/in-history compaction and unknown server-side continuations bypass classification/adaptation. This is conservative gating, not support for every such native workflow. Standalone `/responses/compact` is forwarded but is not included in the generation usage report in this release.

The adapter only supports HTTP/SSE, not WebSocket. Its explicit 426 prevents accidental claims of WebSocket compatibility. Generated CLI settings request Responses and disable WebSockets/retries; desktop clients and versions may still need an additional adapter. That work is open, not hidden inside the current release.

## Failure behavior

Jev timeout/provider errors/malformed choices preserve the request's incoming effort; configured baseline is used only when that value is absent. Expired low leases are never used as an error fallback. A 3-failure circuit opens for 30 seconds; maxCalls is a process-lifetime attempt limit. These are availability safeguards, not proof the retained effort is adequate for the task.

The proxy does not retry OpenAI requests or follow redirects. It forwards a provider error once. A caller may choose to retry; such identical requests are re-evaluated instead of consuming a prior lease. Client disconnect aborts local judge/upstream networking but cannot guarantee remote billing stopped. Logging failure is exposed in health without corrupting the stream.

## Future adapter boundary

An Ares-style native checkpoint adapter can use the same decision lifecycle, but is not built here. A future adapter must prove which actual step settings were captured and obey native compaction/configuration-update rules. There must never be two controllers modifying the same request. No native source fork is required for the current proxy MVP.
