# Troubleshooting

Start with `cae --version`, `cae --help` and `cae doctor`. These do not generate model output. Use the same working directory in every terminal or pass the same `--config PATH`. The fixes described in the [2026-09-29 review](CODE_REVIEW_2026-09-29.md) are source changes after the first npm release; they are not included in the immutable `0.1.0-alpha.1` archive.

## Installation and configuration

| Symptom or code | Next step |
| --- | --- |
| `cae` is not found | Check `npm prefix --global`. Add its `bin` directory on macOS/Linux, or the prefix itself on Windows, to `PATH`. See [installation](NPM.md). |
| `codexFound: false` / `codex_not_available` | Use `--codex /path/to/trusted/codex` for CLI doctor/probe/launch. Desktop startup uses only its verified bundled CLI. Do not replace or upgrade a native binary to bypass compatibility checks. |
| `cannot_read_config` | Run `cae init` for a CLI experiment, or use the existing experiment's directory. HTTP controls for the desktop require `--config .cae/desktop/config.json`. |
| `invalid_arguments` / `unknown_command` | Read `cae --help`. `control` and `lock` take exactly one operand. Native arguments belong after `--` with `cae codex` or `cae launch-args`. |
| `model_missing_from_capabilities` | Refresh the native metadata capture and choose an actual model ID and its supported efforts. Never substitute a synthetic model. |
| Initialization refuses an existing directory | Reuse the existing configuration, or select another empty location with `--dir PATH`. Initialization intentionally avoids overwrites. |

## Starting and stopping an experiment

| Symptom or code | Next step |
| --- | --- |
| `local_proxy_unreachable` | Start `cae serve` with the intended configuration, or inspect `cae desktop status`. Check that both terminals refer to the same configuration and port. |
| `proxy_port_in_use` / `desktop_instance_or_port_in_use` | Stop the experiment you own. If another application owns the port, select a free port in the isolated CAE configuration. Do not kill an unidentified process. |
| `desktop_version_not_validated` | Compare with [desktop requirements](DESKTOP_LAUNCHER.md#requirements-and-scope). A new native version needs metadata and transport acceptance; this error is not a reason to remove the guard. |
| `desktop_effective_provider_mismatch` | The native effective configuration differs from the expected model, provider, auth route, WebSocket or zero-retry settings. Startup stops before launching the experimental desktop. Report sanitized versions and the error code. |
| `desktop_not_running_or_stale_socket` | Check the terminal that owns the experiment. Forced supervisor death needs manual process/socket inspection; do not delete another instance's socket or native login files. |
| `cannot_read_log` | No readable audit log exists for this configuration yet. Start the experiment before requesting its report. |

For a running desktop trial:

```bash
cae status --config .cae/desktop/config.json
cae control off --config .cae/desktop/config.json
cae desktop stop
```

`off` applies to subsequent unsent requests and still uses the proxy. It does not cancel a request already sent to a provider. End the experimental CLI or stop the desktop instance and return to ordinary Codex to leave the proxy path. CLI wrapper SIGINT/SIGTERM forwards to its owned native child and waits for exit, escalating after one second if needed. No global config restore is required.

## Recommendations and actual requests differ

1. Check `mode` in status. Shadow records recommendations without changing executor traffic. Off makes no evaluator call.
2. Check `judgeKind`. The default baseline fixture is for transport validation, not task classification. Real Jev needs explicit opt-in and separate normal credentials.
3. Check `request_prepared` and `request_sent`, including `changed`, `effort` and `reason`. A decision alone is not a send. `cae report` summarizes counts and observed usage.
4. Check the bypass reason. Structured tool results, media, unknown history, compaction and server-side continuations retain original bytes. Manual locks do not override these boundaries.
5. Check failure, call-budget and timeout events. Fallback retains incoming effort; it uses the configured baseline only when incoming effort is absent. A timeout can still incur provider usage.

`shadow_only_control` means the desktop process was started without auto permission. To run a separately authorized auto experiment, stop it and use the documented `--enable-jev --allow-jev-auto` startup before explicitly selecting `control auto`. Do not edit persisted controls or switch billing routes as a workaround.

## Reporting a problem

Share the source commit/package version, OS/architecture, native versions, mode, auth route name, error code and a synthetic reproduction. Keep local paths, `.cae`, captures, raw logs, task histories and credentials out of issues. Use [private vulnerability reporting](../SECURITY.md#reporting-a-vulnerability) for security findings. See [limitations](LIMITATIONS.md) before treating a missing capability as a defect.
