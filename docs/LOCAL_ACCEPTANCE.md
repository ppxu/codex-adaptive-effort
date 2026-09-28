# 本机 Codex 兼容性验收 / 2026-09-28

结论：用户确认授权后，已通过本机 ChatGPT 路线的真实 CLI HTTP/SSE、off、只读工具与多轮、纯文本 low/high 手动锁档、取消及同会话恢复验收。**含结构化工具结果的历史仍会旁路，不能宣称所有 Codex 任务都能改档。** 未启用 Jev、API 付费路线或桌面集成。下文保留零生成预检和随后真实验收两阶段的证据。

## 源码与环境

- 执行时间：2026-09-28 10:26–10:29，Asia/Shanghai（02:26–02:29 UTC）。
- 用户确认后的真实传输：2026-09-28 10:34–10:43，Asia/Shanghai；最终会话于 02:43:27.513 UTC 完成。
- 分支：`main`；被测基线提交：`9cc712713393959868abe03f714ce1aca68a3e6d`。
- origin：<https://github.com/ppxu/codex-adaptive-effort.git>；`git ls-remote` 确认远端 main 与本地 HEAD 相同。
- 初始工作区只有未跟踪的 `SOURCE_MANIFEST.json`，原样保留。本轮验收针对该提交加本报告同版本的源码补丁；采集验收结果时补丁尚未提交。用户随后授权提交现有仓库，发布状态以对应提交和 CI 为准；没有建仓、reset、clean 或强推。
- macOS 27.0，build 26A428；Darwin 27.0.0；CPU 架构 arm64；Node v24.16.0。
- PATH 实际选中的 CLI：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`。
- CLI 版本：`codex-cli 0.158.0-alpha.2.1`。直接使用已安装 CLI，未升级或替换应用内二进制。
- [当前基线 CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36368962404)：head SHA 与上述提交完全一致；2026-09-28 02:13 UTC 完成，Ubuntu/macOS/Windows × Node 22/24 六项全部 success。**此 CI 不覆盖本轮未推送补丁**。

用于区分修复后源码的 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `src/config.mjs` | `2bfbef737c7f6cc8ba303b8e9a7f5ac18b6ac21ab0195e178ec13439fc8a6748` |
| `src/judge.mjs` | `4d5d9931212ce2a02e75c24b6e8a0aecd501fe7534cf841ea0a264d8043b275d` |
| `src/proxy.mjs` | `1e860625b6eb4668ab6d617f19d8b35c8d41504a6944cee3b376c71bec34b004` |

`VALIDATION.md` 的 2026-09-24 容器记录仍是历史证据；其中“未建仓、CI 未运行、无本机 Codex”不代表本次状态。

## 第一阶段：零生成预检结果

| 检查 | 结果 |
|---|---|
| `npm ci --ignore-scripts` | 退出 0；无安装脚本；audited 1 package，0 vulnerabilities |
| 基线 `npm run verify` | 退出 0；24 个模块语法检查、JSON 解析；145 测试通过，0 失败/取消/跳过；五阶段模拟 HTTP/SSE 演示通过 |
| `node bin/cae.mjs doctor` | 退出 0；codexFound=true；版本如上；CAE 未读取原生凭证；无生成调用 |
| 基线 `node bin/cae.mjs probe` | 退出 0；02:26:45.512 UTC；只保留 3 个模型、跳过 4 个，存在能力解析缺陷，不能算完整能力验收 |
| 原生元数据定向核对 | 02:27:06.835 UTC；只发送 initialize / initialized / model/list；7 个模型中 4 个包含 ultra，定位过滤原因 |
| 新增回归在修复前 | 84 项中 81 通过、3 失败，复现探针过滤、配置拒绝、判断选项序列化丢失 |
| 修复后 `npm run verify` | 退出 0；149 测试通过，0 失败/取消/跳过；语法/JSON 和五阶段离线演示通过 |
| 修复后真实 `probe` | 退出 0；02:28:12.509 UTC；7 个模型，skippedUnsupportedEntries=0，paidGenerations=0 |
| 隔离初始化及 launch-args | 退出 0；使用真实捕获中的 gpt-6-astra、默认 medium；临时目录仅含无敏感文本及独立 .cae；off + baseline |
| 原生参数解析及元数据预检 | 02:28:38.151 UTC；将 codexArgs 生成的 chatgpt 参数传给原生 app-server，再执行 model/list：7 个模型、0 跳过、0 生成；不等于实际请求采用代理或认证成功 |

第一阶段未启动外部上游服务，未发起真实生成。后续真实调用见第二阶段。两个阶段均未安装其他路由器、修改日常配置、审批、沙箱或服务档设置。只读帮助确认本机支持 `--no-daemon` 与 `-C`。

## 真实模型能力

以下来自修复后本机 `model/list`，不是示例、模拟夹具或所有模型通用承诺。baseline 是该模型元数据的默认 effort，不表示用户当前选中的模型/档位，也不证明生成服务授权。

| 实际 model ID | 默认 effort | 支持的 effort |
|---|---|---|
| gpt-6-astra | medium | low, medium, high, xhigh, max, ultra |
| gpt-6-sol | medium | low, medium, high, xhigh, max, ultra |
| gpt-6-luna | medium | low, medium, high, xhigh, max |
| gpt-5.6-sol | low | low, medium, high, xhigh, max, ultra |
| gpt-5.6-terra | medium | low, medium, high, xhigh, max, ultra |
| gpt-5.6-luna | medium | low, medium, high, xhigh, max |
| gpt-5.5 | medium | low, medium, high, xhigh |

## 最小修复与回归

根因：`normalizeModel` 使用 `EFFORT_NAMES` 验证每个档位，其中缺少本机已公布的 `ultra`，因此整条模型记录被过滤。配置校验也会拒绝该值。

- `src/config.mjs`：补入 ultra；数量上限使用同一枚举长度。未知名称仍拒绝，每个模型只允许自身能力集合。
- `src/judge.mjs`：补齐 ultra 的选项说明，避免支持该档位后 JSON 序列化删除对应 criterion；没有调用 Jev 或改变路由策略。
- 四项新增测试：合成 app-server → probe → capability init → launcher；未知档位/不支持的 baseline 拒绝及枚举上限；手动锁 ultra 仅改 effort 且拒绝不支持的模型；判断选项序列化保留 ultra。全部使用 synthetic-model 和模拟服务。
- 原有事务所有权、取消、过期 revision、完成响应后提交 lease、旁路历史和响应字节透传测试继续通过。

第一阶段通过：本机离线契约、原生初始化/model-list、能力完整解析、隔离配置生成、启动参数的元数据级解析。

已修复的失败：含 ultra 的模型被过滤、配置拒绝和选项描述缺失。当前没有已知的本轮检查失败。

第一阶段未测试的真实传输项目随后按下表执行；补丁 CI、桌面/WebSocket、真实 Jev、质量和费用等仍未验收。

## 第二阶段：用户确认后的真实传输结果

用户以“确认，继续推进”授权既定 ChatGPT 路线、gpt-6-astra、medium 基线、low/high 手动档及真实模型用量。原生 Codex 自行处理既有认证；未读取原生登录文件、Cookie 或 Token，未设置 OPENAI_API_KEY，未改用 API。原生会话报告 modelProvider=cae、reasoningEffort=medium、serviceTier=default。审批和沙箱继承现有配置，启动参数及 RPC 均未覆盖它们。

| 项目 | 实测结果 |
|---|---|
| 首次 off | 原生 exec 退出 0，返回 CAE_OFF_OK，HTTP 200；CAE 起初错误记录未完成/未知用量，见下述修复 |
| 修复后 off | 同一原生 app-server 的独立临时会话返回 CAE_OFF_OK；3 个文本 delta；medium 原样发送；HTTP 200 + response.completed |
| 只读工具与多轮 | 同会话读取 hello.txt 并复述无敏感夹具；观察到 commandExecution 和工具后续接；两次上游请求均 completed=true、medium 不变 |
| 工具历史后的 low | **未通过锁档验收，但安全旁路符合设计**：reason=media_or_structured_tool_evidence，changed=false，实际仍发送 medium；未删除或改写历史，停止该路径的改档测试 |
| 另一独立纯文本会话的 low | medium → low，source=manual，changed=true；原生回复 CAE_LOW_OK；HTTP 200 + response.completed |
| 同一纯文本会话的 high | medium → high，source=manual，changed=true；原生回复 CAE_HIGH_OK；HTTP 200 + response.completed |
| 真实取消 | 恢复 off 后，在 request_sent 之后发送 turn/interrupt；原生 status=interrupted；CAE terminal=cancelled、completed=false；没有误建 lease |
| 同会话取消后恢复 | 下一轮回复 CAE_RECOVER_OK；HTTP 200 + response.completed；medium 不变 |
| 固定模型与请求完整性 | 本地临时诊断只保存允许的元数据和比较结果；最终两个会话的请求模型均为 gpt-6-astra，只有 low/high 两次发生 effort 改动；诊断确认 reasoning 以外字段保持一致，完整“仅 effort 可变”约束由离线对象/字节回归验证 |
| 服务档 | 原生报告 default；实际请求体未包含 service_tier，CAE 保持其缺省状态；未声称服务端最终分配了特定优先级 |
| Jev | judgeCalls=0，外部判断调用 0；只有手动改档 |
| 收尾 | off、unlocked、activeRequests=0、retainedSessions=0；终止实验 CLI/app-server 和代理；4318 无监听，未发现实验目录对应的残留命令；原版 CLI --version 正常 |

本次共观察到 **12 次真实上游请求发送**，含定位问题时的复测和一次主动取消；不是零用量检查。初期三次成功生成分别被旧观察逻辑误记为未完成或取消，原始记录原样保留，不回填成成功。最终两个隔离会话的完成、旁路与取消均能正确区分。没有读取账户额度扣减或估算美元成本，也不将未知用量记成零。

### 真实传输发现的两项最小修复

1. **缺失 Content-Type 的 SSE**：真实响应没有 Content-Type / Content-Encoding，但有完整 data 帧和 response.completed。此前观察器按非流式 JSON 处理而漏报完成与 usage。现在仅当响应缺少 Content-Type、且请求明确 stream=true 时按 SSE 观察；显式 JSON 类型仍优先，转发头和响应字节不变。
2. **完成事件后的正常关闭**：原生 CLI 可以在收到 response.completed 后、HTTP EOF 前关闭连接。此前 relay 把已收到的有效完成事件覆盖为 cancelled。现在只在 2xx 且观察器已校验有效完成事件时保留完成结果；完成事件之前的取消仍失败，不提交 lease。

两项均先补回归复现失败，再修代码。新增四项模拟 HTTP 测试覆盖：缺失类型头的字节透传/完成/lease；缺失终止事件及非 stream 请求不误判；显式 JSON 优先；完成事件后关闭仍完成。原有中途取消、错误、事务和 stale revision 测试继续通过。最终 `npm run verify`：**153/153 通过，0 失败、0 取消、0 跳过**；24 模块语法检查、JSON 解析及五阶段离线演示通过。

CLI 另报告既有配置中 supports_websockets 不识别及 respect_system_proxy 属实验功能；未修改日常配置来消除警告。实际已观察到本次 HTTP/SSE 成功，不把它扩大为所有客户端版本或 WebSocket 禁用机制的保证。

### 本轮实际调用方式

首次单轮使用下面的原生 exec 入口；所有 CAE 路径变量均指向独立实验目录：

```bash
node "$CAE_ROOT/bin/cae.mjs" codex --config "$CAE_TRIAL/.cae/config.json" \
  --auth chatgpt --codex "$CAE_CODEX_BIN" -- --no-daemon exec --ephemeral --json \
  -C "$CAE_TRIAL" '只回复 CAE_OFF_OK，不使用工具，不访问其他文件或服务。'
```

多轮与取消使用同一 CAE launcher 启动独立 `app-server`（stdio，不是共享 daemon），没有开发新的桌面或 WebSocket 接口：

```bash
node "$CAE_ROOT/bin/cae.mjs" codex --config "$CAE_TRIAL/.cae/config.json" \
  --auth chatgpt --codex "$CAE_CODEX_BIN" -- app-server
```

先从当前原生 CLI 的 generate-json-schema 核对协议，再发送 initialize / initialized、thread/start（cwd=实验目录、ephemeral=true），随后通过 turn/start 在同一 thread 中发送纯文本任务。只在请求之间执行下节的 CAE lock/control。取消使用该 threadId / turnId 的 turn/interrupt；不覆盖 model、serviceTier、approvalPolicy 或 sandboxPolicy。观察 turn/completed、文本 delta、工具项与 CAE request_prepared/request_sent/upstream_outcome，所有原生 ID 和原始输出仅留本机。

### 剩余边界

纯文本手动锁档路径已验收；工具执行后的结构化结果仍旁路，用户已接受这个当前边界。本轮不扩大解析范围，不将新建纯文本会话的通过结果算到原工具会话上。真实 Jev、auto 判断、长会话压缩、桌面/WebSocket、API 路线、其他模型、质量和成本仍未验收。采集本报告时 CI 只对应旧基线；153 项结果是本机证据，发布补丁后需按其实际 SHA 核对 CI。服务端真实推理预算不能由 200、sent 或 response.completed 单独证明。

## 复现命令：纯文本 off → 手动锁档

本会话已经获得上述范围的真实调用授权。以下保留手工复现步骤；换账户、模型或付费路线需另行明确，不需要提供凭证值。工具任务另用 off 会话验证，不将含结构化工具结果的历史改造成 eligible。

终端 A，从仓库根目录准备全新实验目录。这段准备不生成；CLI 升级后必须刷新探针。所有变量只供该实验使用：

```bash
export CAE_ROOT="$PWD"
export CAE_CODEX_BIN="$(command -v codex)"
node "$CAE_ROOT/bin/cae.mjs" probe --codex "$CAE_CODEX_BIN" > "$CAE_ROOT/capabilities.local.json"
# 上一步必须退出 0，且实际捕获仍包含选定模型和 low/medium/high。
export CAE_TRIAL="$(mktemp -d "${TMPDIR:-/tmp}/cae-transport.XXXXXX")"
node "$CAE_ROOT/bin/cae.mjs" init --dir "$CAE_TRIAL/.cae" \
  --model gpt-6-astra --auth chatgpt --capabilities "$CAE_ROOT/capabilities.local.json"
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const directory = process.env.CAE_TRIAL;
const path = directory + '/.cae/config.json';
const c = JSON.parse(readFileSync(path, 'utf8'));
if (!['low', 'medium', 'high'].every(e => c.supportedEfforts.includes(e))) throw Error('Refresh and review capabilities');
c.mode = 'off';
writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
writeFileSync(directory + '/hello.txt', 'CAE acceptance fixture. No private content.\n');
writeFileSync(process.env.CAE_ROOT + '/transport-plan.local.json', JSON.stringify({directory}) + '\n');
JS
node "$CAE_ROOT/bin/cae.mjs" launch-args --config "$CAE_TRIAL/.cae/config.json" \
  --auth chatgpt --codex "$CAE_CODEX_BIN" -- --no-daemon -C "$CAE_TRIAL"
```

任一步非零立即停止。预期：固定真实模型、medium 基线、本地 Responses、禁用上游 WebSocket/重试、只有环境变量名而无令牌值；不覆盖审批、沙箱或 service tier。初始化拒绝覆盖已有目录。

终端 A 启动前台服务：

```bash
node "$CAE_ROOT/bin/cae.mjs" serve --config "$CAE_TRIAL/.cae/config.json" --enable-upstream
```

预期只监听 127.0.0.1:4318，mode=off，judge=baseline，upstream=chatgpt。端口占用即停止；不要终止其他进程。需要时只修改实验 .cae 的 port，重新检查参数。

终端 B，也从仓库根目录运行；这些命令只读取实验目录指针，不读密钥：

```bash
export CAE_ROOT="$PWD"
export CAE_TRIAL="$(node -p 'JSON.parse(require("node:fs").readFileSync("transport-plan.local.json", "utf8")).directory')"
export CAE_CODEX_BIN="$(command -v codex)"
test -d "$CAE_TRIAL" || exit 1
node "$CAE_ROOT/bin/cae.mjs" status --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" codex --config "$CAE_TRIAL/.cae/config.json" \
  --auth chatgpt --codex "$CAE_CODEX_BIN" -- --no-daemon -C "$CAE_TRIAL"
```

仅在 health 正常、off 且模型正确时启动 CLI。保留日常审批/沙箱，按正常流程确认临时目录信任。先发“只回复 CAE_OFF_OK，不使用工具”，然后在这条纯文本会话按下节验证 low/high。只读 hello.txt 放在另一条 off 会话验证。使用界面取消操作中止一个无敏感文本请求，再检查后续请求能正常完成。若出现 401/403/415/426 或协议错误，记录脱敏错误码与版本并停止；不导出凭证、不换渠道、不通过删历史绕过。

off 通过后，终端 C 从仓库根目录设置与 B 相同的 CAE_ROOT/CAE_TRIAL，然后在两次用户请求之间执行：

```bash
node "$CAE_ROOT/bin/cae.mjs" lock low --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" control auto --config "$CAE_TRIAL/.cae/config.json"
# B 发：“只回复 CAE_LOW_OK，不使用工具”。等待完成再继续。
node "$CAE_ROOT/bin/cae.mjs" lock high --config "$CAE_TRIAL/.cae/config.json"
# B 发：“只回复 CAE_HIGH_OK，不使用工具”。等待完成再继续。
node "$CAE_ROOT/bin/cae.mjs" status --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" report --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" control off --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" unlock --config "$CAE_TRIAL/.cae/config.json"
```

预期：off 的 request_prepared/request_sent 为 changed=false；合格的 auto 请求出现 source=manual、low/high 的 prepared/sent 与 completed outcome，judgeCalls=0，externalAttempts=0。按 requestId 关联实验 `.cae/events.jsonl` 的脱敏元数据，不记录请求正文或认证头；未知 usage 保持 unknown。若走旁路，保留 reason，不能称作锁档通过，不能删除历史强行通过。200、sent 和日志中的 effort 只能证明传输阶段观察，不能证明真实推理预算。

退出恢复：结束终端 B 的实验 CLI，终端 A Ctrl+C 停止代理，再按原方式启动日常 Codex。`control off` 仍经过代理，不等于直连；代理崩溃也不会自动恢复直连。临时目录及日志留本机供核对，不上传；临时目录失效时重新初始化，不复制登录文件或覆盖日常 config.toml。

## 交付边界

原始 verify/回归输出和临时验收驱动保存在被忽略的 `*.local.txt`；doctor、修复前后 capability、预检和真实传输摘要保存在被忽略的 `*.local.json`；隔离 .cae、原生输出和仅记录元数据的诊断在系统临时目录。它们均不属于提交候选。报告不含用户目录、登录账号、令牌或真实任务内容。最终仅保留相关源码、合成测试和本报告的改动，已有 SOURCE_MANIFEST.json 不变。
