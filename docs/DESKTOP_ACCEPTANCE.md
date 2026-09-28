# Initial desktop acceptance

**Recorded 2026-09-28, UTC+08:00.** One isolated desktop instance passed off transport, plain-text low/high manual locks, cancellation and same-chat recovery. Later Jev auto results are in [current local acceptance](LOCAL_ACCEPTANCE.md).

The [original Chinese record](DESKTOP_ACCEPTANCE.zh-CN.md) preserves the full sequence, initial failure, exact source hashes and dated intermediate states. This page is a summary, not a new test run.

## Environment and provenance

- macOS 27.0 arm64, Node v24.16.0.
- ChatGPT/Codex desktop 26.924.22138, build 11645; bundled codex-cli 0.158.0-alpha.2.1.
- Source baseline `3c13aac2dcad333fae689b1273d3d4657bf90b8d` plus the argument-scope repair described below. The patch was uncommitted during initial capture; the original record identifies its file hashes.
- Baseline [CI 36371612189](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36371612189) succeeded for that baseline only. It must not be represented as CI coverage of the then-uncommitted patch.
- Native ChatGPT authentication; independent Electron data and CAE configuration, shared native Codex home. No credential copying or global configuration edits.

## Failure found and fixed

The first UI response succeeded, but CAE recorded no proxy events. Native thread metadata showed the original provider, so this was a failed proxy acceptance result rather than a success.

The launcher placed provider overrides before `app-server`. When the desktop also supplied subcommand-scoped `-c` options, this CLI version discarded the earlier override set. A command line containing `model_provider=cae` did not prove it was effective.

The repair puts CAE overrides in the app-server subcommand scope, while preserving ordinary exec arguments. Native `initialize` + `config/read` confirmed the effective provider afterward, without generation. Two synthetic regressions covered desktop composition and avoiding false matches in prompts/config values. The repaired source passed 155 offline tests.

## Real post-fix outcomes

| Time | Check | Observed result |
| --- | --- | --- |
| 11:55–11:56 | Off | Main gpt-6-astra/medium request traversed CAE unchanged and completed |
| 11:57–11:58 | Manual low | Incoming medium, source=manual, actual low send, HTTP 200 + completed |
| 12:19–12:20 | Manual high | Incoming medium, source=manual, actual high send, HTTP 200 + completed |
| 12:21 | Cancel | Native turn interrupt succeeded; proxy recorded cancelled, completed=false |
| 12:21 | Same-chat recovery | Subsequent medium request completed unchanged |
| 12:23 | Cleanup | Tracked experimental processes exited, port 4319 was free, native CLI version check succeeded |

The post-fix batch had six upstream sends: five user test turns and one native auxiliary title request. Five completed and one was cancelled. Only the two manual-lock requests changed effort; Jev was not enabled. The initial request that bypassed CAE is outside these counts.

UI interaction was performed by the user. The automation tool refused to control its own application, and no alternate UI-control mechanism was used to bypass that restriction. Metadata/transport completion should not be described as an independent visual inspection.

## Limits

This validates the installed app's local Codex programming surface, not ordinary ChatGPT chats, cloud tasks, a packaged plugin or arbitrary versions. Structured tool-result histories still bypass adaptation. Application upgrades, long-context behavior, task quality and cost savings were not accepted by these tests.

Use the guarded [desktop launcher](DESKTOP_LAUNCHER.md) for current instructions. Do not replay historical process-management steps or use old PIDs from the archived record.
