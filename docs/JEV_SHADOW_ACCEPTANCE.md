# Jev evaluation and shadow acceptance

The independent evaluator passed bounded real fixture protocol checks. A later three-case desktop shadow batch also passed. Earlier timeouts remain unresolved. Real auto upshift/downshift results are recorded separately in [local acceptance](LOCAL_ACCEPTANCE.md).

This page summarizes the [original Chinese record](JEV_SHADOW_ACCEPTANCE.zh-CN.md). All test times below are 2026-09-28, UTC+08:00. Original samples included Chinese tasks; translating these documents does not establish English fixture results.

## Evaluator-only fixture batch

At 13:46:48–13:46:52, source `6763d15e5d63e6d8fb7149aa8bf55c92ea2ccab7` made eight authorized real Jev evaluations and zero executor-generation calls. Two additional fixtures bypassed evaluation. All ten retained the original executor body; no automatic retries were performed.

The request alias was `jev-latest`; all eight responses reported `jev-1.13.0`. Observed latency was 266–1424 ms, median 377.5 ms. Known evaluator usage totaled 7209 input and 832 output tokens. Every returned lease was 1.

Protocol success is not semantic accuracy. A follow-up without sufficient context still received diagnostic confidence 0.71; uncertainty handling remains unaccepted. These cases did not execute the proposed tasks, establish task quality, or validate real multi-generation lease reuse. The controller does not reject decisions based on a confidence threshold.

To preview the bounded fixture plan using a real capability capture:

```bash
node scripts/jev-shadow.mjs --capabilities capabilities.local.json \
  --model "$MODEL_ID" > jev-shadow-plan.local.json
```

Review that local plan. Only after explicit authorization and normal `TYPESAFE_API_KEY` setup, supply the exact newly approved plan hash, rather than copying a historical hash:

```bash
node scripts/jev-shadow.mjs --capabilities capabilities.local.json \
  --model "$MODEL_ID" --enable-jev --approved-plan "$APPROVED_PLAN_HASH" \
  > jev-shadow-result.local.json
```

A completed runner reports eight judge calls, zero executor calls, and protocol/unchanged-body checks. Semantic review is still separate. Captures and results must remain local; a timed-out call may still incur usage.

## First desktop shadow batch: partial pass

Source `4e4dfd4d6232f11b5975604fcb815b9aea6dca3d`, [matching CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36384188894), 188 offline tests. Same macOS/app/CLI combination as [local acceptance](LOCAL_ACCEPTANCE.md).

| Case, 14:02–14:03 | Jev outcome | Actual executor effort | Transport |
| --- | --- | --- | --- |
| Spelling | Timeout, 1506 ms | medium unchanged | HTTP 200 + completed |
| Concurrency analysis | high, 1174 ms | medium unchanged | HTTP 200 + completed |
| Follow-up | Timeout, 1502 ms | medium unchanged | HTTP 200 + completed |

Shadow preservation and fallback passed; timely evaluation for all three cases failed. The two timeouts predated stage instrumentation, so their phase is unknown. Known evaluator input usage was 945 tokens from the successful case; timeout usage was unknown. Desktop metadata did not capture the evaluator response version or output usage.

## Second desktop shadow batch: passed, no timeout reproduced

Runtime source `3da3758` added diagnostics without changing fetch transport, pooling, request bytes, deadline or retry behavior. It passed 195 offline tests and [matching CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36385744553). The later sampling HEAD included documentation-only changes.

| Case, 14:26–14:30 | Jev duration | Recommendation | Actual effort / result |
| --- | --- | --- | --- |
| Spelling | 795 ms | low | medium unchanged, completed |
| Concurrency analysis | 552 ms | high | medium unchanged, completed |
| Follow-up | 591 ms | high | medium unchanged, completed |

All three returned lease 1. Known Jev input usage totaled 3712 tokens. One additional different-model request bypassed Jev and completed. Three successes do not establish a stable latency distribution or explain the earlier failures.

## Timing boundaries and later evidence

The observer records cumulative request creation, send-start, body-sent, response-header, body-completion and validation times. It does not distinguish DNS/TCP/TLS independently, prove socket reuse, or measure pure server inference. Unknown stages remain unknown; older logs cannot be backfilled.

A later auto trial timed out after 1511 ms with only request creation observed. Another auto request successfully changed medium to high, and a subsequent 2000 ms trial changed medium to low after only 665 ms. See [the exact auto evidence](LOCAL_ACCEPTANCE.md). None of these observations proves that a larger timeout solves the underlying issue.

Use the [desktop guide](DESKTOP_LAUNCHER.md) for bounded shadow/auto trials and recovery. Keep model/auth/service-tier selection fixed, review only sanitized metadata, and do not retry solely to obtain a desired recommendation.
