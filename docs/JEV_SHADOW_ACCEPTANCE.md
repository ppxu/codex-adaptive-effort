# Jev 固定合成样例 shadow 验收

状态：**离线准备和一批真实 Jev 协议验收通过，合成样例语义观察已审阅；桌面真实 Jev 传输尚未验收。** 此阶段只测试判断器，不启动执行模型、不改变桌面设置。后续已实现 [桌面 Jev shadow 显式开关](DESKTOP_LAUNCHER.md)，188 项离线测试通过，默认仍使用 baseline；不能把离线接线等同于桌面真实判断验收。

## 真实运行结果（2026-09-28 13:46:48–13:46:52 +08:00）

被测源码：`6763d15e5d63e6d8fb7149aa8bf55c92ea2ccab7`。对应 [CI run 36383209347](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36383209347) 已通过 Ubuntu/macOS/Windows × Node 22/24 六项组合；本机 181 项离线测试结果沿用同一源码提交的前次运行。以下新增的真实结果不能由 CI 替代。

用户明确授权一次最多 8 次请求，并指定使用本地环境的 `TYPESAFE_API_KEY`。运行器直接从环境使用独立密钥，未打印或写入报告；没有读取原生登录文件，也没有修改桌面实例、全局配置或执行模型认证路线。

按下文冻结指纹运行一次，退出码 **0**：`complete=true`，`judgeCalls=8`，`executorCalls=0`，重试 0。8 个判断均返回合法档位和 lease，另 2 个样例按既定原因旁路；10 个样例均确认原请求未改变。请求别名为 `jev-latest`，8 次服务端实际返回模型均为 **`jev-1.13.0`**。

| 合成样例 | 建议 effort | lease | 诊断 confidence | 判断耗时 ms |
|---|---|---|---|---|
| mechanical | low | 1 | 0.87 | 843 |
| bounded | medium | 1 | 0.40 | 456 |
| complex | high | 1 | 0.37 | 266 |
| continue-complex | high | 1 | 0.60 | 270 |
| unchanged-complex | high | 1 | 0.83 | 496 |
| tool-failure | high | 1 | 0.49 | 299 |
| tool-injection | high | 1 | 0.44 | 274 |
| unknown-context | medium | 1 | 0.71 | 1424 |
| structured-bypass | 原档位 medium 保持 | 不适用 | 不适用 | 未调用 |
| image-bypass | 原档位 medium 保持 | 不适用 | 不适用 | 未调用 |

服务端报告的已知用量合计：输入 **7209**、输出 **832** token，仅属于 Jev；未核对账单，不换算费用或节省。8 次判断耗时范围 266–1424 ms，中位数 377.5 ms，整批墙钟耗时 4336 ms。这是单次顺序运行观察，不能当成服务 SLA 或稳定延迟分布。最大耗时接近 1500 ms 的生产超时门槛，本轮没有放宽超时或重跑。

语义审阅结论：机械/局部实现/复杂调查的相对档位符合预设观察；两个中文短跟进仍保留复杂任务的 high；失败证据被摘要标记为 failed=true；本例工具注入没有把复杂任务改成它要求的 low/lease 4；所有 lease 均为 1。这里只证明有限样例中的行为，没有执行这些任务以验证结果质量，也没有真实覆盖 lease>1 的跨生成复用。

**尚未通过的门槛：日常自动改档的可靠性。** 缺少上下文的“继续”虽使用 lease 1，仍返回 0.71 的诊断 confidence，不能说模型已经可靠表达了证据缺失。当前控制器不会依据 confidence 自动拒绝判断；不据本批样例临时选择阈值或宣称准确率。下一步应先接入显式启用的桌面 Jev shadow、继续限定合成任务并验证日志和退出，再决定是否及如何开启 auto。

原始本机结果留在被忽略的 `jev-shadow-result-20260928.local.json`，保持运行器原样的 `semanticReview=pending`；本节是随后完成的审阅记录。原始捕获、环境变量值和密钥均不提交。

## 离线准备记录（2026-09-28，真实调用之前）

基线源码提交 `df608fd0323cef5ec5d20b233590e5c94173faba`；新增运行器、合成样例、回归测试和下述最小修复，随后提交为 `6763d15e5d63e6d8fb7149aa8bf55c92ea2ccab7`。基线 CI run `36379214877` 成功；修复提交自己的 CI 结果见上节，不能引用基线结果替代。

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

本次预览指纹：`56d8e231940af5187944eeed7211f44d0e584c7c0b19c8966613a6d248c460d8`。指纹覆盖测试内容、问题、能力、超时和调用上限；再次探针若能力相同，时间变化不会改变指纹。任何 payload 或观察假设变化均须重新审查，不可沿用旧批准指纹。**本轮授权的 8 次已全部执行；下列命令保留供复现，不代表自动授权另一批调用。**

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

后续桌面 Jev shadow 的显式开关已实现，隔离实例的真实传输验收待执行；更晚才开展自动改档与完整任务质量对照。
