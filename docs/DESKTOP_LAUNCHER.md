# Experimental desktop launcher

The launcher starts an independent instance of the installed Codex desktop application. It is not a packaged plugin, does not control ordinary ChatGPT conversations and does not migrate existing chats.

## Requirements and scope

The current allowlist is **macOS arm64**, **ChatGPT/Codex desktop 26.924.22138 / build 11645**, and its bundled **codex-cli 0.158.0-alpha.2.1**. Local acceptance used macOS 27.0 and Node v24.16.0. The launcher verifies the official application signature and exact version, queries native capabilities, and checks the effective provider with `initialize` + `config/read`. An application update requires revalidation; CAE does not upgrade, downgrade or replace native binaries.

The experimental instance uses its own Electron data directory but shares native Codex home and login. It may show existing projects and chats. **Create a new local Codex chat** in a directory containing only non-sensitive test material. Old chats retain their previous providers; cloud tasks and ordinary ChatGPT chats are not covered.

## Start with baseline shadow

From the repository root, use a model ID returned by the [native probe](LOCAL_VALIDATION.md):

```bash
node bin/cae.mjs desktop start --model "$MODEL_ID" --auth chatgpt --enable-upstream
```

Keep this terminal running. First launch creates `.cae/desktop/config.json`; later launches reuse it and reject an unexpected model/baseline change. The default is shadow + baseline-only, which does not classify task complexity or call Jev. Starting does not submit a task; sending a task consumes the normal model allowance.

In another terminal:

```bash
node bin/cae.mjs desktop status
```

Wait for `phase=running`, `effectiveProvider=cae`, `connected=true` and at least one successful bridge check. The output includes the experimental desktop PID and configuration path. The provider display name is `CAE experimental local effort controller`; CAE does not patch the native window title. Automated visual identification was not accepted independently.

Custom locations are supported with `--config PATH` and `--app PATH`. Use the same `--config` for start/status/stop. The configuration directory must be private. The default proxy port is 4319; a conflict fails startup without killing another process. Arbitrary CLI replacement via `--codex` is rejected for desktop startup.

## Manual controls without Jev

For a baseline instance, select only efforts from the actual capability set:

```bash
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs lock low --config .cae/desktop/config.json
node bin/cae.mjs control auto --config .cae/desktop/config.json
# Send an eligible synthetic text task in the experimental window.
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs unlock --config .cae/desktop/config.json
```

Controls apply to this CAE instance, not a single chat. Locks affect only eligible auto requests; unsupported history still bypasses adaptation. Controls affect the next unsent request, not a response already being generated.

## Enable Jev shadow

Stop the old experimental instance first. Supply `TYPESAFE_API_KEY` through your normal environment setup, without putting its value in command arguments or public logs:

```bash
node bin/cae.mjs desktop start --model "$MODEL_ID" --auth chatgpt \
  --enable-upstream --enable-jev
```

This changes the evaluator to TypeSafe only for the current process. It does not persist the evaluator or key. Startup still requires a shadow/off configuration. With this flag alone, `shadowOnly=true`: auto and non-null manual locks are rejected with `shadow_only_control`. Off/shadow switching does not renew the budget.

The native CLI, probe and desktop child processes do not inherit the Jev key. Jev receives a bounded text projection; redaction is not a guarantee that business secrets are removed. Use only tasks approved for external processing.

Every desktop Jev process permits at most eight evaluations, or a smaller configured call limit. By default, the timeout is the smaller of the configured timeout and 1500 ms. A timeout or cancellation may still incur provider usage. Exhausting the limit records `judge_call_budget` and falls back without retrying or switching providers. Restarting begins a new budget; this is not a spending guarantee.

<a id="jev-auto受控实验"></a>
## Enable a controlled auto trial

With explicit authorization to change real request effort, add the separate auto permission:

```bash
node bin/cae.mjs desktop start --model "$MODEL_ID" --auth chatgpt \
  --enable-upstream --enable-jev --allow-jev-auto
```

Startup still uses shadow/off. Once running, check `judgeKind=typesafe`, `shadowOnly=false`, `lockedEffort=null`, `judgeCalls=0` and `activeRequests=0`, then switch:

```bash
node bin/cae.mjs control auto --config .cae/desktop/config.json
```

Invalid decisions, timeouts and exhausted budgets retain the incoming effort; when effort is absent, the configured baseline is used. Other models and unsupported shapes bypass adaptation. The desktop effort selector may continue showing the user's chosen baseline: CAE modifies the outbound request, not that selector.

For the recorded installation, `gpt-6-astra` supports medium, low and high. In a new local chat, keep the desktop selection at medium and submit these non-sensitive fixtures one at a time, waiting for completion:

1. `Do not use tools. Correct Helo to Hello. Reply only with the corrected string.`
2. `Do not use tools. Analyze a fictional scheduler: A is cancelled, B starts, and a late callback from A overwrites B's state. Describe the faulty sequence, ownership invariant, and smallest fix.`

These English examples are reproduction instructions, not a claim that the original Chinese fixtures were rerun in English. Jev need not recommend low/high. A timeout or unchanged recommendation must be recorded honestly, without automatic retries to obtain a preferred outcome.

<a id="可选-2000-ms-实验"></a>
## Optional 2000 ms timeout experiment

```bash
node bin/cae.mjs desktop start --model "$MODEL_ID" --auth chatgpt \
  --enable-upstream --enable-jev --allow-jev-auto --jev-timeout-ms 2000
```

`--jev-timeout-ms` accepts only 1500 or 2000 and requires `desktop start --enable-jev`. It explicitly replaces the disk timeout for this process, including a smaller disk value. It never writes the configuration. Check `judgeTimeoutMs` in status before switching to auto.

The default remains 1500 ms. Restart without the parameter to restore the original disk value subject to that ceiling. The successful real downshift took 665 ms, below either deadline; it does not establish a benefit from increasing the limit. The worst-case timeout wait increases by roughly 500 ms.

## Inspect results

```bash
node bin/cae.mjs desktop status
node bin/cae.mjs report --config .cae/desktop/config.json
```

Reports aggregate an append-only event file and can include earlier instances. For a trial, filter by its time window and correlate local request IDs across `decision`, `request_prepared`, `request_sent` and `upstream_outcome`. A recommendation alone is not an applied change. An applied request setting plus completion is not proof of actual model reasoning allocation or task quality.

Jev timings separate observed request creation, send start, body sent, response headers, body completion and validation. They do not independently resolve DNS/TCP/TLS or pure server inference time. Missing fields remain unknown. Do not upload raw event files; publish only reviewed, sanitized summaries.

## Stop and recover

```bash
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs desktop stop
```

The stop command closes this instance, its tracked children and proxy; success returns `stopped`. Ctrl+C in the startup terminal uses the same cleanup path. Stop interrupts active experimental tasks, so wait for completion when possible. Ordinary desktop instances are not cleanup targets.

`off` still uses the proxy. After stop, use the normal official application; no global configuration or login restoration is needed. Forced supervisor death (for example SIGKILL) can leave stale resources and requires manual inspection. CAE does not guess ownership from an old PID, run `killall` or promise automatic direct-routing failover.

## Evidence

[Current local acceptance](LOCAL_ACCEPTANCE.md) covers the real auto upshift/downshift and fallback. [Initial desktop acceptance](DESKTOP_ACCEPTANCE.md) covers manual controls and cancellation. The [original Chinese launcher record](DESKTOP_LAUNCHER.zh-CN.md) preserves dated startup tests and source hashes; its intermediate pending steps are historical.
