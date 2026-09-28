# CLI and native validation guide

Validate in a separate process and a directory containing only synthetic, non-sensitive tasks. Keep an ordinary Codex session available. Never read/copy native login files or change global `~/.codex/config.toml`, approval policies or sandbox settings. For the validated desktop version, use the [desktop guide](DESKTOP_LAUNCHER.md).

## 1. Offline checks and native metadata

```bash
npm ci --ignore-scripts
npm run verify
node bin/cae.mjs doctor
node bin/cae.mjs probe > capabilities.local.json
```

The tests and demo do not use real providers. `doctor` queries the native version; `probe` initializes app-server and queries `model/list` without generating output. Native Codex may consult online model metadata. If the CLI is absent from `PATH`, pass `--codex /path/to/trusted/codex` to doctor/probe and subsequent CLI launches. Do not replace or upgrade the desktop binary to make a check pass.

Record the source commit, time, OS/architecture, Node version, trusted CLI path/version, exit codes and actual model/effort set. Keep the raw capture local. A failed probe is not permission to substitute synthetic models or scrape credentials.

## 2. Initialize an isolated configuration

Choose a real model from the capture. `$MODEL_ID` below means the exact value you selected:

```bash
node bin/cae.mjs init --model "$MODEL_ID" --auth chatgpt --capabilities capabilities.local.json
node bin/cae.mjs launch-args --auth chatgpt
```

Initialization refuses to overwrite `.cae`. For another experiment use `--dir PATH` and pass `--config PATH/config.json` to later commands. CAE's directory is not a replacement Codex home. Native Codex continues to handle login.

Preserve the existing auth route. ChatGPT subscription use requires `--auth chatgpt`. API use requires an explicitly selected `--auth api` configuration and the caller's normal `OPENAI_API_KEY`; it may be billed separately. Never silently fall back from subscription to API.

Review the printed non-secret arguments: fixed model, local Responses URL, auth route and environment variable names, with no approval/sandbox overrides. Model IDs and effort values are environment-specific.

## 3. Off transport trial

Real requests need explicit authorization. Set `mode` to `off` in the isolated CAE configuration before starting. Leave normal Codex settings unchanged.

```bash
# Terminal A: foreground proxy
node bin/cae.mjs serve --enable-upstream
# Terminal B: experimental CLI, retaining native authentication
node bin/cae.mjs codex --auth chatgpt --
```

Submit a minimal synthetic text task, then test a read-only tool in the synthetic directory, a follow-up, cancellation and recovery. Off disables evaluation/changes, not model usage or network forwarding. Record errors such as 401/403 or protocol failures; do not export cookies, change billing routes or hide retries.

## 4. Manual effort trial without Jev

Use efforts confirmed by the probe. The following values are examples, not universal capabilities:

```bash
node bin/cae.mjs lock low
node bin/cae.mjs control auto
# Send an eligible synthetic text task and wait for completion.
node bin/cae.mjs lock high
# Send another eligible task and wait for completion.
node bin/cae.mjs control off
node bin/cae.mjs unlock
node bin/cae.mjs report
```

Correlate prepared/sent/completed events. Unsupported shapes, including structured tool-result history, can bypass even a manual lock. Do not remove history to force eligibility. A request sent with a value does not prove the model's actual reasoning allocation.

## 5. Jev shadow, then auto

Jev sends bounded task text to TypeSafe and may incur usage. Enable it only with explicit authorization for that external processing and the normal independent key.

For a standalone serve process: stop the proxy, set `judge.kind` to `typesafe` and `mode` to `shadow` in the isolated configuration, supply `TYPESAFE_API_KEY` through your normal environment setup, then run:

```bash
node bin/cae.mjs serve --enable-upstream --enable-jev
```

Use a small configured `judge.maxCalls` budget. First verify shadow recommendations and fallback. With separate authorization to change effort, use `control auto`. The [desktop launcher](DESKTOP_LAUNCHER.md) has its own process-only flags, eight-call cap and timeout experiment; do not assume standalone serve uses those desktop caps.

The evaluator-only [fixture runner](JEV_SHADOW_ACCEPTANCE.md) provides a separate bounded protocol check without executor generation. Neither fixtures nor a few successful requests establish representative accuracy or savings.

## 6. Record evidence and recover

Use the [acceptance template](acceptance-template.md). Separate local tests, CI, native metadata, actual sends, completion, UI observations and task quality. Record unknown usage as unknown. For comparative evaluation, control task content, starting state, context, model, mode, versions and timing; a single later success is not an A/B result.

End the experimental CLI, stop the foreground proxy, then relaunch normal Codex. Desktop trials use `desktop stop`. `control off` alone does not remove the proxy. Do not rewrite login files as a recovery step.

Never commit `.cae`, captures, raw logs, credentials or private task histories. Public evidence must be a reviewed, sanitized summary.
