# Security and data boundaries

This is alpha software, not a sandbox or a security certification. Do not use confidential or production workloads before an independent review and provider approval.

## Trust model

The local user, configuration file, native Codex binary and OS account are trusted. The local random token is a defense against unrelated processes/browser traffic, not against a malicious same-user process that can read your files. Only `127.0.0.1` is bound. Authenticated control is instance-wide, not per-chat. Browser Origin/site/destination metadata is refused and Host is checked; a valid 256-bit local token is still required. No browser UI is provided.

OpenAI authentication is relayed in memory only to a fixed API or ChatGPT origin. The token used to authenticate to CAE is stripped from outgoing traffic. TypeSafe receives its own dedicated key and limited redacted text, not OpenAI authentication, cookies, encrypted reasoning, system/developer text or tool definitions. CAE does not open Codex `auth.json`, cookie stores, browser profiles or keychains. Native Codex still manages its ordinary authentication.

Task text and tool output can contain business secrets not recognized by redaction. **Enable Jev only for workloads allowed to leave your environment.** CAE has no offline Jev implementation. Prompt-injection resistance of the external classifier is not proven: schema validation limits values, not semantic judgment quality. A mistaken low-effort decision can harm task quality even though the protocol is valid.

## Operational protections and limits

No automatic upstream retries or redirect following. Generated launcher configuration disables Codex provider retries, but other clients may retry themselves. Requests have body/time limits; concurrent requests in one recognized session receive 409. Separate sessions can run concurrently. Cancellation propagates to the network where possible; it does not prove the remote service stopped billing.

Metadata-only audit files are 0600 on POSIX. Only explicitly allowlisted fields are written; request bodies and provider error bodies are not logged. `status` includes `auditHealthy`; a logging failure does not break the model stream. There is no log rotation in this alpha. Windows ACL and cross-user confidentiality require local validation; POSIX modes are not Windows ACL guarantees.

Some unsupported histories bypass adaptation but still go to the original executor. `off` is not network isolation and still uses the proxy. If the proxy crashes, end the experimental session and relaunch ordinary Codex; there is no background config rewrite or automatic direct-routing promise.

## Supported versions

Security fixes are considered for the current main branch of this alpha. There is no long-term support commitment for older snapshots. Include the exact source commit and native client version when reporting a problem.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/ppxu/codex-adaptive-effort/security/advisories/new) for this repository. Do not open a public issue with exploit details or sensitive data. Include a synthetic reproduction, affected versions, impact and any suggested mitigation. If the private channel is unavailable, request a private contact method without disclosing the vulnerability publicly. No response-time guarantee is offered.

Do not post keys, auth files, raw private requests or real session histories. For a credential exposure, rotate the affected key through its provider and remove the exposure through the relevant hosting service. Never put a live credential into a test fixture or security report.
