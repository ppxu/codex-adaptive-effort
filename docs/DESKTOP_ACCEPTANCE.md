# 本机桌面启动检查 / 2026-09-28

结论：当前 ChatGPT 桌面端的 Codex 编程入口已通过**独立实例启动、off 真实传输、纯文本 low/high 手动锁档、取消及同会话恢复**。首轮请求绕过 CAE 的 app-server 参数作用域问题已修复，155 项离线测试通过。实验已结束，相关进程与监听端口均已清理。这些结果不代表正式桌面插件或所有任务形态都能改档。

这里不覆盖普通 ChatGPT 聊天，也不是官方桌面插件或稳定扩展 API。启动入口来自当前已安装应用代码的只读核对，升级后必须重新检查。

## 来源与结果

- 源码基线：`3c13aac2dcad333fae689b1273d3d4657bf90b8d`，`main`；最终验收还包含本报告同版本的 launcher 参数修复。采集时补丁未提交，下列源码 SHA-256 用于明确证据对应版本。
- 基线 [GitHub CI](https://github.com/ppxu/codex-adaptive-effort/actions/runs/36371612189)：head SHA 完全匹配，success；Ubuntu/macOS/Windows × Node 22/24 六项通过。该结果仅覆盖基线，后续提交需核对自己的 CI。
- 修复后 `src/codex.mjs` SHA-256：`8f9744e1e90072de3154717d7de7895db68737d602d785c45b76ec9e3388b86d`。
- 修复后 `bin/cae.mjs` SHA-256：`4f4a26f7cc1e90db16f30ae7e5db7a3aaa37c09726820c5ca11fb74eef832022`。
- 环境：macOS 27.0 / arm64，Node v24.16.0；ChatGPT 26.924.22138，build 11645；内置 `codex-cli 0.158.0-alpha.2.1`。
- 启动与后续核对：2026-09-28 11:06 起，Asia/Shanghai。使用新建的临时 Electron 数据目录、独立 CAE 配置及 loopback 端口。原生 Codex home 沿用现有位置，**不是完整的账户或原生状态隔离**；独立窗口仍能发现已有项目。未复制凭证、未修改日常 config.toml。

| 检查 | 结果 |
|---|---|
| 进程级 CLI 路径覆盖 | 桌面日志确认实际执行临时桥接脚本 |
| 独立 app-server | transport=stdio；CLI 覆盖使共享 daemon 分支不适用 |
| 初始化 | initialize_handshake_result：outcome=success，186 ms；随后 connected |
| 原生版本 | 桌面报告 0.158.0-alpha.2.1，与直接 --version 一致 |
| 既有登录 | 原生桌面报告 authMethod=chatgpt、authenticatedAccountPresent=true；没有读取或输出凭证值 |
| 窗口启动 | 日志报告 window ready-to-show；没有自动化视觉验收 |
| 模型元数据 | 桌面自身 model/list RPC 返回 errorCode=null；没有用模拟模型列表代替真实返回。能力集合见此前真实探针 |
| 实际子进程参数 | 确认桌面所属原生 app-server 使用 model_provider=cae、gpt-6-astra、medium、实验 loopback 地址、ChatGPT 认证与 supports_websockets=false；没有审批/沙箱覆盖参数 |
| 模型与锁档 | 启动阶段未验证；后续真实传输确认 gpt-6-astra、off 保持 medium、手动 low/high 生效，见下文 |
| GUI 自动化 | 工具明确拒绝操作 com.openai.codex；未绕过限制使用其他 UI 控制方式 |
| 启动告警 | 观察到推送注册与 Statsig 启动超时，尚未确认是否影响可操作界面；不把 app-server 初始化成功等同于全部桌面功能正常 |

原计划关闭上游做启动预检，但现有 serve 会以 upstream_not_enabled 拒绝真实路线启动。因此实验服务按已有授权显式启用上游，保持 off + baseline；是否发生真实生成必须以代理 request_sent 记录为准，不能从 off 推断为零调用。启动检查时 request_sent=0，Jev=0。

## 桥接方式与边界

本机应用代码识别以下**仅作用于实验进程**的环境变量：

- `CODEX_ELECTRON_USER_DATA_PATH`：独立 Electron 用户数据目录。
- `CODEX_CLI_PATH`：指向临时 launcher；没有替换应用内二进制。
- `CODEX_APP_SERVER_FORCE_CLI=1`：选择本地 CLI/stdio 传输，不是审批或沙箱选项。

临时 launcher 在 app-server 启动时调用现有 `cae codex --auth chatgpt`，保留桌面原有参数；其余命令交给原生 CLI。CAE 按已有应用路径读取自己的本地密钥，只通过子进程环境传递；原生客户端自行处理登录。未增加 WebSocket 代理、桌面 UI、Jev 调用或全局配置。

桌面 → app-server 的 stdio 与 app-server → 上游的 HTTP/SSE 是两段不同的传输。前者已通过本次启动检查；后者的 CLI 验收见 [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md)，尚不能代替桌面端实际发消息的结果。

独立实例共享原生 Codex home，可能写入正常的原生会话/项目状态。只应新建无敏感内容的实验任务，不操作日常任务。CAE 的手动锁档作用于该代理实例的所有合格请求，不是桌面内某一个任务专属。桌面选择不同模型时不能据此宣称固定模型验收通过。

## 下一步人工验收

仅在可辨识的实验窗口中操作；保留 gpt-6-astra、medium 和既有服务档、审批及沙箱。在无敏感内容的实验目录中新建任务，避免将真实工作历史带入代理。

1. CAE 保持 off；在桌面发送“只回复 CAE_DESKTOP_OFF_OK，不使用工具，不访问文件或其他服务”。预期界面显示该标记；代理同一次 request_sent 的 model=gpt-6-astra、changed=false，并有 completed=true。
2. 完成后在实验终端运行以下命令，再从同一纯文本任务发送对应标记：

```bash
node "$CAE_ROOT/bin/cae.mjs" lock low --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" control auto --config "$CAE_TRIAL/.cae/config.json"
# 桌面：只回复 CAE_DESKTOP_LOW_OK，不使用工具。
node "$CAE_ROOT/bin/cae.mjs" lock high --config "$CAE_TRIAL/.cae/config.json"
# 桌面：只回复 CAE_DESKTOP_HIGH_OK，不使用工具。
node "$CAE_ROOT/bin/cae.mjs" status --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" report --config "$CAE_TRIAL/.cae/config.json"
```

预期两次记录 source=manual、分别发送 low/high、changed=true，响应正常完成，Jev 调用为零。若旁路，记录 reason，不删除历史强行通过。带结构化工具结果的历史旁路仍是用户已接受的限制。

3. 恢复 off，在桌面验证取消及后续恢复；再完全退出实验实例和 CAE。只操作本次记录的 PID/子进程，不使用全局 killall，不退出日常窗口。

```bash
node "$CAE_ROOT/bin/cae.mjs" control off --config "$CAE_TRIAL/.cae/config.json"
node "$CAE_ROOT/bin/cae.mjs" unlock --config "$CAE_TRIAL/.cae/config.json"
```

off 仍经代理；完全恢复依赖退出实验进程，再正常打开原版桌面端。恢复后检查实验端口无监听、实验 app-server 无残留，原版 CLI --version 正常。

本次临时 launcher、启动指针、原始日志及提取的应用代码仅留本机，均不提交。没有将第三方桌面代码复制到本项目，也没有把临时桥接提升为正式安装功能。

## 首轮人工发送与最小修复 / 11:18–11:24

用户按实验启动步骤发送无敏感内容的测试消息，并报告收到 CAE_DESKTOP_OFF_OK。随后核对实验桌面的 thread/start、turn/start 成功记录，代理 health 正常但事件文件为空。仅查询对应实验会话的 thread/read 元数据（includeTurns=false），确认 modelProvider=openai、model=gpt-6-astra、reasoningEffort=medium。因此本轮是**桌面回复成功、CAE 传输验收失败**；代理零事件不代表用户零模型用量。

根因是原生 CLI 的参数作用域：桌面同时提供 app-server 前后的 -c 参数。旧 launcher 把 CAE overrides 放在命令最前面，而此版本 CLI 在 app-server 有自身 -c 时采用子命令配置集合，丢掉前面的 CAE provider 定义。进程命令行出现 model_provider=cae 并不足以证明生效。

原生零生成 initialize + config/read 三组对照：

| 参数形态 | 实际 model_provider | CAE provider 定义 |
|---|---|---|
| CAE 参数 + app-server | cae | 存在 |
| CAE 参数 + 桌面原始参数（含子命令后的 -c） | null，实验会话实际使用 openai | 不存在 |
| 桌面参数 + CAE 参数 | cae | 存在 |

最小修改：`src/codex.mjs` 在识别到 app-server（允许前置 -c / --config / --config=）时，将 CAE 参数放入其子命令配置作用域；`bin/cae.mjs` 的 launch-args 和实际启动使用同一组合函数。其他调用保持原顺序，不把 exec 的提示词或 config 值中的 app-server 误当子命令。不修改全局配置、原生应用、认证或审批/沙箱设置。

新增两项合成回归：桌面参数组合保留 CAE model/provider/auth 与原有插件参数；exec 提示词和配置值不误判。修复前第一项失败，修复后 npm run verify 退出 0：155 测试通过，0 失败/取消/跳过，语法/JSON 与离线演示通过。修复后按桌面实际参数执行原生 config/read：provider=cae、gpt-6-astra、medium，CAE 定义存在，生成调用为零。此补丁尚未提交，前文 3c13aac 的 CI 不覆盖它。

仅定向停止实验原生 app-server 后，桌面自动启动新的桥接进程并重新初始化成功（159 ms）。现有实验桌面和 off 代理保留供复测；不沿用 provider=openai 的旧测试会话，需要新建实验会话。修复后仍未观察到桌面 CAE request_sent，low/high 暂不执行。此前“唯一缺口是 UI 工具限制”的判断由本次真实发现取代，优先事项是确认修复后的新会话实际通过 CAE。

第一次交接时暂时保留实验窗口；用户随后要求继续验证、不重复确认。后续完成了桌面 model/list、实际子进程参数与退出恢复检查，没有通过其他 UI 技术绕过工具限制，也没有用 CLI 生成复测冒充桌面输入框验收。

初次启动检查的收尾：停止前 health=ok、mode=off、activeRequests=0、judgeCalls=0；该阶段代理事件记录为空，没有提交真实生成任务。定向停止实验桌面和代理，核对原先记录的全部子进程已退出、4319 无监听，原版 CLI --version 退出 0。桌面退出后曾留下本次启动的 bare-modifier-monitor 原生辅助进程，已按事先记录的子进程 PID 单独停止；未终止日常实例或修改原生应用。原始结果保存在被忽略的 `desktop-final.local.json`。这份清理证据不覆盖用户后来重启的人工测试实例，后者当前保留待复测。

## 修复后的桌面 off 结果 / 11:55–11:56

用户在新建实验会话发送测试消息后，代理实际记录到如下两次上游请求。主请求传输完成得到直接证据；本轮用户报告已发送，未另行读取界面文本，故不把代理完成事件冒充视觉验收。

| 来源 | 模型 / effort | CAE 处理 | 结果 |
|---|---|---|---|
| 用户测试主请求 | gpt-6-astra / medium | mode_off，changed=false | 03:55:57.560 UTC 发送；03:56:04.000 UTC HTTP 200、response.completed、completed=true |
| 桌面自动标题生成 | gpt-6-luna / low | mode_off，changed=false | HTTP 200、response.completed、completed=true；桌面日志确认 feature=thread_title |

桌面的辅助标题请求不是 CAE 多模型路由；CAE 没有选择或改写该模型。真实用量不能只按用户点击发送次数统计。本轮经代理共两次真实上游发送，Jev 调用为零；完整元数据仅留被忽略的 desktop-off-acceptance.local.json。

两次均完成、activeRequests=0 后，已设置 lock low + control auto，确认主模型仍为 gpt-6-astra、lockedEffort=low、judgeCalls=0。下一步在同一纯文本实验会话发送 low 标记；其他模型按 different_model 旁路，手动锁档不会改写标题模型。实验桌面及代理当前保留。尚未完成 low/high、桌面取消/恢复和本轮最终收尾。

## 桌面 low 手动锁档 / 11:57–11:58

用户报告已发送 low 测试消息。03:57:58.878 UTC 的同一请求 decision 明确记录 incomingEffort=medium、proposedEffort=low、source=manual、changed=true；03:58:00.176 UTC 以 gpt-6-astra / low 实际发送，03:58:06.547 UTC 返回 HTTP 200、response.completed、completed=true。因此桌面 low 传输锁档通过，不能据此推断服务端实际推理预算或质量。原始元数据仅留 desktop-low-acceptance.local.json。

确认 activeRequests=0、judgeCalls=0 后，已切换 lockedEffort=high，保持 auto 模式与同一主模型。当前等待同一纯文本实验会话的 high 测试；桌面取消/恢复及最终清理尚未完成。

## 桌面 high 手动锁档 / 12:19–12:20

用户报告已发送 high 测试消息。04:19:46.977 UTC 的 decision 记录 incomingEffort=medium、proposedEffort=high、source=manual、changed=true；04:19:47.203 UTC 以 gpt-6-astra / high 实际发送，04:19:52.587 UTC 返回 HTTP 200、response.completed、completed=true。桌面 high 传输锁档通过，原始元数据仅留 desktop-high-acceptance.local.json。

验证完成后已执行 control off 和 unlock，状态为 mode=off、lockedEffort=null、activeRequests=0、judgeCalls=0。实验窗口与代理仍保留，用于最后的桌面停止生成及同会话恢复检查；尚未结束实验进程。

## 桌面取消、恢复与最终收尾 / 12:21–12:23

用户在同一实验会话点击停止，再发送恢复标记，并报告已停止且恢复。实验桌面日志中的最后五次 turn/start 属于同一会话，turn/interrupt 返回 errorCode=null。

- 取消：04:21:40.890 UTC 已发送 gpt-6-astra / medium；04:21:45.630 UTC 记录 terminal=cancelled、completed=false。没有把未完成请求算成成功；httpStatus=null 表示未获得已记录的状态，不代表零消耗。
- 恢复：04:21:56.104 UTC 发送同模型 medium，changed=false；04:21:59.786 UTC 返回 HTTP 200、response.completed、completed=true。
- 本次修复后的代理共观察到六次真实上游发送：五个用户测试回合（off、low、high、取消、恢复），另有一次原生桌面标题生成。五次完整完成，一次取消；只有 low/high 主请求改档；Jev 调用为零。首次绕过代理的测试不包含在这六次中，无法据此统计整个桌面账户的总用量。
- 退出前为 off、unlocked、activeRequests=0、retainedSessions=0。按实验数据目录与进程归属重新核对 PID，定向停止实验桌面、其残留原生辅助进程与代理；04:23:29 UTC 确认实验进程残留为零、4319 无监听、原版 CLI --version 退出 0。未终止日常实例。

最终证据分别保存在被忽略的 desktop-acceptance-final.local.json 和 desktop-cleanup-final.local.json；不提交原始日志、临时脚本、模型捕获、.cae、应用提取代码或凭证。已通过的范围是本机特定版本的实验性 Codex 桌面纯文本传输；未测试正式安装/升级、其他桌面版本、普通 ChatGPT 聊天、工具历史改档、长会话压缩、真实 Jev、质量或成本收益。已有工具历史旁路限制继续保留。
