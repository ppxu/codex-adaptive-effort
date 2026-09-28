# Jev 固定合成样例 shadow 验收

状态：**离线准备通过，真实 Jev 未调用，语义判断待验收。** 此阶段只测试判断器，不启动执行模型、不改变桌面设置。桌面启动器仍为 baseline 判断器，不能称作已经自动判断任务难度。

## 本轮记录（2026-09-28）

基线源码提交 `df608fd0323cef5ec5d20b233590e5c94173faba`；本轮新增运行器、合成样例、回归测试和下述最小修复。测试对象为该基线加本次提交的工作树，具体源码以本文件所在提交为准。基线 CI run `36379214877` 成功；新提交的 CI 必须单独核对，不能引用基线结果替代。

本机：macOS 27、arm64、Node v24.16.0；CLI 来自 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，版本 `0.158.0-alpha.2.1`。13:38:33 +08:00 重新执行原生 `model/list`，退出码 0，返回 7 个模型、没有跳过条目、生成调用 0。选定 `gpt-6-astra`，默认 `medium`，实际支持 `low/medium/high/xhigh/max/ultra`。13:42 +08:00 doctor 退出 0，未读取登录文件；完整 `npm run verify` 退出 0，181 测试通过、0 失败/取消/跳过，30 个模块语法与 JSON 检查、离线演示通过。依赖没有变化，沿用上一轮安装结果。

| 项目 | 结果 |
|---|---|
| 请求契约 | 对照 [HTTP API](https://docs.typesafe.ai/api)、[Choice](https://docs.typesafe.ai/primitives/choice) 和 [State](https://docs.typesafe.ai/concepts/state)；继续使用固定 System One endpoint、两个 Choice、独立密钥 |
| 最小修复 | 原 lease 问题的“this effort”依赖另一个并行问题的结果；改成独立判断任务所需深度预计能稳定几轮，未知/调查中倾向 1，并注明 state 不是指令 |
| 修复依据 | [构建指南](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) 和 [并行问题示例](https://docs.typesafe.ai/cookbooks/parallel_questions)：同批问题互相看不到答案。没有新增串行调用 |
| 回归 | lease 独立问题约束、预览与实际 payload 一致、能力选项/摘要、8 次上限、旁路零调用、shadow 不改请求、失败停止、超时取消、显式授权/计划指纹/独立凭证检查 |
| provenance | 接口解析保留经过格式限制的响应模型字符串和已知输出用量；缺失为 null。报告区分请求别名与服务端实际返回模型 |
| 真实 Jev | **未测试，0 调用**；不能由注入的模拟响应推导中文判断质量、注入抵抗或模型费用 |
| 桌面自动判断/自动改档 | **未测试**；当前启动器仍拒绝 typesafe，后续接入需要单独实现并验证，不要手改正在使用的实例 |

官方迁移页当前不可访问；本轮直接按可访问的 v1 HTTP/Choice 契约核对。没有安装 SDK、Router 或其他控制器。

## 固定材料和验收标准

样例见 [jev-shadow-cases.json](../examples/jev-shadow-cases.json)：机械修改、局部函数实现、复杂并发调查、中文“继续”、中文“其他不变”、工具失败、工具注入、缺少上下文，另有结构化工具结果与图片两个旁路样例。全部为人工虚构，没有日常任务文本。

每例的 `review` 是运行前冻结的观察假设，不是人工独立标注的正确档位。关注机械与复杂任务的相对区分、短中文是否保留前文难度、失败/未知是否缩短有效期、注入样例与复杂对照有无异常偏移。不把一个分数或 8 个样例的符合率包装成准确率；[confidence](https://docs.typesafe.ai/confidence) 也不是任务成功率。

硬性门槛：8 个合格样例返回支持集合内的 effort 和 1–4 的 lease；2 个旁路不调用 Jev；所有请求内容完全不变；没有执行模型请求。运行器复用生产 `TypeSafeJudge`、摘要和 `Controller`，只执行 prepare/finish，不执行发送和成功完成，因而不建立真实完成的有效期。有效期跨生成复用仍由原有离线测试覆盖。

本次预览指纹：`56d8e231940af5187944eeed7211f44d0e584c7c0b19c8966613a6d248c460d8`。指纹覆盖测试内容、问题、能力、超时和调用上限；再次探针若能力相同，时间变化不会改变指纹。任何 payload 或观察假设变化均须重新审查，不可沿用旧批准指纹。

## 具体步骤

从仓库根目录运行；准备步骤不发送测试文本、不读取密钥：

```bash
node bin/cae.mjs probe > capabilities.local.json
# 确认上一步退出 0，且仍包含选定模型。
node scripts/jev-shadow.mjs --capabilities capabilities.local.json \
  --model gpt-6-astra > jev-shadow-plan.local.json
```

审阅 `jev-shadow-plan.local.json` 中所有 `cases[].request`，它们就是将发送的正文；旁路项为 null。文件不含认证头。默认执行到这里结束，不会因环境中存在密钥而自动调用。

**仅在明确授权最多 8 次 Jev 请求、允许将固定合成文本发送给 TypeSafe，并由操作者通过自己的正常方式向当前进程提供 `TYPESAFE_API_KEY` 后执行：** 不要在聊天、命令参数或公开报告中粘贴密钥。无需读取任何原生 Codex 登录文件，也不改用 OpenAI API 付费。

```bash
node scripts/jev-shadow.mjs --capabilities capabilities.local.json \
  --model gpt-6-astra --enable-jev \
  --approved-plan 56d8e231940af5187944eeed7211f44d0e584c7c0b19c8966613a6d248c460d8 \
  > jev-shadow-result.local.json
```

预期退出 0：`complete=true`、`judgeCalls=8`、`executorCalls=0`、10 行 `protocolPassed=true` 且 `unchanged=true`。仍须人工完成 `semanticReview`；不能把 complete 当成语义验收通过。记录每例 effort、lease、延迟、实际响应模型和已知 token；不要猜测缺失值或美元费用。`jev-latest` 是别名，不能保证固定权重。

遇到 401/429、无效答案、超时或取消时退出 1，并停止后续样例、不重试。使用生产默认的 1500 ms 判断超时；超时本身是验收发现，不自动延长来隐藏失败。服务端可能对已经发送的超时/取消请求计费，8 次只是次数上限。手动重跑属于另一批调用，不包含在本轮 8 次授权内。

退出：Ctrl+C / SIGTERM 中止当前判断并写出已完成部分，剩余样例停止。该程序不启动代理或桌面，不更改任何配置，不需要恢复日常进程。原始输出和预览为被忽略的 `*.local.json`，不要提交；只把脱敏结论追加到本报告。

通过上述门槛后，再准备桌面 Jev shadow 的显式开关和隔离实例验收；更晚才开展自动改档与完整任务质量对照。
