# 桌面实验启动器

已验证的 macOS arm64 桌面可以由一条命令启动，另一条命令完整退出。它是本仓库的实验启动器，不是安装到 ChatGPT 里的插件，也不控制普通 ChatGPT 聊天。

## 启动

在仓库根目录运行：

```bash
node bin/cae.mjs desktop start --model gpt-6-astra --auth chatgpt --enable-upstream
```

`gpt-6-astra` 是本机实测模型；每次启动都会从原生 model/list 重新核对。其他机器必须选择实际返回的模型，不能照搬该名称。首次运行创建 `.cae/desktop/config.json` 和 CAE 本地密钥；后续复用，拒绝悄悄更换既有模型或 baseline。默认 shadow + baseline，不启用 Jev、不自动发起测试生成；用户在窗口中提交任务会消耗现有 ChatGPT 模型额度。

保持这个终端运行。先显示 starting，只有桌面初始化成功且桥接通过实际 provider 检查后才显示 running。预期状态包括：

```json
{
  "phase": "running",
  "label": "CAE DESKTOP · 实验实例",
  "effectiveProvider": "cae",
  "connected": true,
  "mode": "shadow",
  "judgeKind": "baseline"
}
```

同时输出实验桌面的 PID 和独立配置位置。新出现的窗口是本次实例，提供商配置名为 `CAE experimental local effort controller`，可在原生提供商显示处核对。没有修改应用标题栏；自动化工具禁止操作自身界面，因此该标识的视觉展示未独立验收。

**在新窗口中新建 Codex 本地任务。** 独立 Electron 数据目录仍共享正常 Codex home 和原生登录，可能显示已有项目或会话。旧会话保留其已有 provider，不能假定它们也走 CAE；本启动器不迁移、重写或接管旧会话。普通 ChatGPT 聊天和云端任务不在此范围内。

## 状态与退出

另一个终端在同一仓库目录运行：

```bash
node bin/cae.mjs desktop status
node bin/cae.mjs desktop stop
```

stop 定向清理本次桌面、已追踪的子进程和本地代理，成功才返回 stopped。也可以在启动终端按 Ctrl+C。停止会中断实验实例正在进行的任务；日常桌面实例不属于清理范围。不要用 killall，也不要在进程结束后仅凭旧 PID 手动清理。

`control off` 仍然经过代理；完全恢复日常路径应执行 desktop stop，再按平时方式使用官方桌面。退出时不需要回写任何日常配置或登录信息。

自定义配置和应用位置：

```bash
node bin/cae.mjs desktop start --config "$CAE_CONFIG" --app "$CHATGPT_APP" \
  --model "$MODEL_ID" --auth chatgpt --enable-upstream
node bin/cae.mjs desktop status --config "$CAE_CONFIG"
node bin/cae.mjs desktop stop --config "$CAE_CONFIG"
```

配置父目录须为私有目录；启动器不接受任意 CLI 替换，使用经签名检查的应用所带 CLI。默认端口 4319；冲突时停止启动，不终止占用进程。可以在服务停止后修改 CAE 配置的 port，再重试。

## 手动控制

控制命令须显式指向桌面配置：

```bash
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs lock low --config .cae/desktop/config.json
node bin/cae.mjs control auto --config .cae/desktop/config.json
# 完成实验后恢复：
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs unlock --config .cae/desktop/config.json
```

实际可选 effort 取决于该模型的最新能力。手动锁档只对合格的主模型请求生效，作用域是整个 CAE 实例；工具历史等不兼容形态继续旁路。以上手动 auto 流程用于默认的 baseline 实例；启用下面的 Jev shadow 开关后，实例会拒绝 auto 和非空锁档。

## Jev shadow（显式启用）

此入口已完成离线接线验证和桌面首轮实测：**三条主请求均保持原档位并完成，但两条 Jev 判断超时，稳定性未通过**。逐条结果及此前独立判断器的 8 个真实合成样例见 [Jev 验收记录](JEV_SHADOW_ACCEPTANCE.md)。

下面保留真实验收的启动命令。先正常停止旧实验实例；通过自己的正常方式在启动终端提供 `TYPESAFE_API_KEY`，不要把值放到命令参数中。只在新实例的新本地会话中使用无敏感的合成任务：

```bash
node bin/cae.mjs desktop start --model gpt-6-astra --auth chatgpt \
  --enable-upstream --enable-jev
```

开关仅对本次进程生效：将运行时判断器设为 typesafe，不写回磁盘配置；初始 mode 仍遵循配置的 shadow/off，auto 配置拒绝启动。未带开关时继续使用 baseline；若操作者已手动将磁盘 judge.kind 改为 typesafe，则没有开关会拒绝启动，不静默启用第三方。

每个启用 Jev 的启动进程最多 8 次判断。未指定超时实验参数时，单次超时最多 1500 ms，配置已有更小上限时继续使用更小值；显式的 2000 ms 实验见下节。达到次数上限后保持来请求档位，记录 `judge_call_budget`；不重试、不切换服务商。off/shadow 切换不重置计数，重启是新一批调用，不是同一次预算。超时或取消的请求仍可能产生服务端费用；次数不是金额保证。

启动本身不主动提交测试任务。用户发送合格任务时，有限任务文本会发给 TypeSafe，同时原任务会照常使用原生 ChatGPT 模型额度。不要在这个实例中处理未授权的日常任务或敏感代码；窗口和代理没有按任务自动筛选“是否敏感”的能力。独立 Jev 密钥只供 CAE 判断器使用，模型探针、原生 CLI 和桌面子进程均不继承它。

检查状态和报告：

```bash
node bin/cae.mjs desktop status
node bin/cae.mjs report --config .cae/desktop/config.json
```

预期 running 时包含 `judgeKind=typesafe`、`shadowOnly=true`、`lockedEffort=null`、`judgeCallLimit<=8`，首次尚未提交任务时 `judgeCalls=0`。shadow 只建议、不改档；控制接口拒绝 `control auto` 和 `lock`，返回 `shadow_only_control`。允许 `control off` 暂停判断，再 `control shadow` 恢复剩余预算。

`report` 汇总调用和传输；查看具体建议时仅投影 CAE 自己的决策元数据，以下命令不会读取请求正文或登录文件：

```bash
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
const events = readFileSync('.cae/desktop/events.jsonl', 'utf8').split('\n').filter(Boolean).map(JSON.parse);
console.table(events.filter(e => e.event === 'decision').slice(-10).map(e => ({
  time: e.time, mode: e.mode, source: e.source, incoming: e.incomingEffort,
  suggested: e.proposedEffort, changed: e.changed, reason: e.reason
})));
JS
```

日志是追加式的，核对本次启动时间范围，不把旧实验结果算作本次验收。后续真实验收可用新纯文本会话依次测试：明确拼写修改、虚构并发问题分析、带前文的“继续”；核对 source=judge、建议档位、changed=false 与对应完成结果。发现错误先 off，再 stop，保留脱敏元数据，不自动重试。

首轮两次 Jev 超时后，已增加发送/响应头/正文/校验阶段计时，见 [超时诊断说明](JEV_SHADOW_ACCEPTANCE.md)。新字段仅在重启后的代码中生效，旧日志不可追溯补齐；`report` 会按最后观测阶段汇总超时。第二组三条真实分段样本为 795/552/591 ms，均成功，旧超时未复现、原因未知；超时仍为最多 1500 ms。

退出与恢复：

```bash
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs desktop stop
# 需要再次运行 baseline 实验时，省略 --enable-jev：
node bin/cae.mjs desktop start --model gpt-6-astra --auth chatgpt --enable-upstream
```

stop 成功后也可直接回到日常官方桌面；没有全局配置需要恢复。本次功能开发没有替用户停止、重配或重启已有桌面实例。

### Jev 开关的离线验证（2026-09-28）

基线 `c23877e180d5aa64da5c4f27a44b3fa5f68f0b33` 加本节所在功能提交的源码变更，macOS 27 arm64 / Node v24.16.0。`npm run verify` 通过：188 测试、0 失败/取消/跳过，30 模块语法和 JSON 检查、离线演示通过。覆盖显式开关/缺少密钥、进程级配置不落盘、HTTP 控制拒绝 auto/锁档、请求和 SSE 字节不变、调用上限/较小预算/超时、off 保留与重启回 baseline、原生子进程密钥隔离、脱敏日志及已有退出清理回归。Jev 与模型响应均为合成测试；本轮真实外部调用 0，未启动真实桌面 Jev 实例。

13:57:18 +08:00 使用修改后的 doctor/probe 再次查询本机内置 CLI：两者退出码均为 0，CLI 仍为 `0.158.0-alpha.2.1`，`gpt-6-astra` 默认 medium，支持 low/medium/high/xhigh/max/ultra；没有发起生成。原始能力捕获与测试日志只留本机被忽略文件。

## Jev auto（受控实验）

在用户明确同意实际修改请求档位后，停止旧实验实例，在正常提供独立 Jev 环境变量的终端启动：

```bash
node bin/cae.mjs desktop start --model gpt-6-astra --auth chatgpt \
  --enable-upstream --enable-jev --allow-jev-auto
```

新增开关只开放本进程的 auto/手动控制权限，不自动切模式，不落盘。必须同时指定 `--enable-jev`；启动配置仍须为 shadow/off，磁盘配置为 auto 时继续拒绝启动。已验证的应用签名、CLI 版本、实际能力、provider 预检和子进程密钥隔离完全保留。仅带原有 Jev 开关重启后恢复 shadowOnly=true；省略两个 Jev 开关则回到磁盘的 baseline 配置。

在另一终端确认 running、固定模型正确、judgeKind=typesafe、shadowOnly=false、judgeCalls=0、activeRequests=0，然后切换：

```bash
node bin/cae.mjs desktop status
node bin/cae.mjs control auto --config .cae/desktop/config.json
```

预期 mode=auto、lockedEffort=null，最多 8 次判断。未指定超时参数时，每次最多 1500 ms，更小的既有配置继续有效；状态中的 judgeTimeoutMs 是实际生效值。模式切换不刷新次数。建议不合法、超时或次数耗尽时继续沿用既有控制器的回退规则；显式来请求档位保持不变，未指定档位才使用已核对的 baseline。不支持的请求历史和其他模型仍原样旁路。

用独立无敏感目录，在实验窗口中新建本地会话，选择实际探针返回的 `gpt-6-astra` 和 medium，保持桌面选择不变，依次发送并等待完成：

1. `不要使用任何工具。把字符串 Helo 改成 Hello，只回复修改后的字符串。`
2. `不要使用工具。分析虚构调度器：A 被取消后 B 启动，A 的迟到回调覆盖 B 的状态。请给出错误时序、所有权不变量和最小修复方案。`

按同一 requestId 关联本机 CAE 元数据：decision 应为 mode=auto、source=judge；建议不同于来请求 medium 时 changed=true，request_prepared/request_sent 的 effort 应与建议一致，随后 HTTP 200 且 response.completed。Jev 可能建议 medium 或超时，不能为得到预期 low/high 自动重试，也不能把未改档记为改档通过。桌面选择器可能继续显示 medium，它表示客户端选择；代理只修改发送请求的 effort。这项验证不证明服务端实际分配的推理量、任务质量或成本收益。

完成两条后先暂停判断，再读取脱敏记录；出现错误也立即 off，不自动追加调用：

```bash
node bin/cae.mjs control off --config .cae/desktop/config.json
node bin/cae.mjs report --config .cae/desktop/config.json
node bin/cae.mjs desktop stop
```

off 仍经过代理，stop 后按日常方式使用官方桌面，无需恢复全局配置。首轮真实 auto 已验证 medium → high 且正常完成；另一条 Jev 超时，回退 medium 并完成，后续 2000 ms 实验中 medium → low 也已完成。两次实例的 off → stop 清理均通过，详见 [本机记录](LOCAL_ACCEPTANCE.md)。

### 可选 2000 ms 实验

默认超时没有调整。只有在 `desktop start --enable-jev` 中显式添加 `--jev-timeout-ms 2000`，才将本进程的判断超时设为 2000 ms；参数只接受 1500 或 2000，覆盖本次运行的磁盘 timeout，包括磁盘中更小的值，不写回配置。次数上限不变，不重试、不改变 fetch 连接池或端点。其他命令、缺少 Jev 开关或不合法的值会拒绝，不悄悄忽略。

```bash
node bin/cae.mjs desktop start --model gpt-6-astra --auth chatgpt \
  --enable-upstream --enable-jev --allow-jev-auto --jev-timeout-ms 2000
# 另一终端，确认 running、judgeTimeoutMs=2000、judgeCalls=0，再切 auto：
node bin/cae.mjs desktop status
node bin/cae.mjs control auto --config .cae/desktop/config.json
```

先只在独立无敏感目录的新本地会话发送上面的拼写任务，固定主模型和客户端 medium。核对 Jev 建议、sent effort、changed 和 completed；若成功降到 low，记为真实降档通过。若建议 medium、超时或旁路，如实记录，不自动重发。同一个成功样例不能证明 2000 ms 优于 1500 ms；不同批次的连接与上下文可能不同，若返回时间仍小于 1500 ms，也不能把成功归功于放宽超时。

检查后 off/stop，命令同上。去掉超时参数重新启动，恢复原有磁盘值与 1500 ms 上限；无需回写配置。真实样例以 665 ms 完成 medium → low，自动降档通过；耗时低于原 1500 ms，因此放宽上限的改善效果仍未知。最坏超时等待比默认增加约 500 ms。

## 检查和失败行为

- 仅接受本机已验证组合：ChatGPT 26.924.22138 / build 11645、内置 codex-cli 0.158.0-alpha.2.1、macOS arm64。应用升级后拒绝启动，需重新验收再更新版本记录；不会自动升级或降级 Codex。
- 检查官方应用签名，查询真实 model/list，核对配置中的 baseline 和支持集合。
- 通过 initialize + config/read 检查实际 model/provider、loopback 地址、ChatGPT 认证、环境令牌名和 HTTP/SSE 配置。每次桌面启动 app-server 时都对其真实参数再检查一次，失败就不启动那个原生子进程，不用直连伪装成功。
- 启动握手超时、端口冲突或退出会触发清理。管理通道为私有、令牌认证的本机 socket；不暴露额外网络控制端口。
- 主控若被 SIGKILL 或机器突然关机，无法执行正常清理；残留 socket 会阻止新实例启动。此时命令会明确报错，不根据陈旧 PID 猜测并终止进程。该异常路径需要人工核对，尚无自动恢复承诺。

原生输出仅用于识别就绪事件，不写原始桌面日志。CAE 自己的元数据事件保存在私有 `.cae/desktop/events.jsonl`；整个 .cae 不提交。CAE 不读取原生登录文件，不写全局 config.toml，不改变审批、沙箱或服务档。

## 2026-09-28 本机验证

本轮以 `ea3e4b0f73c06a61084d3bb8f814eba5a2a7c1fd` 加本启动器源码补丁进行验证，Node v24.16.0、macOS 27.0 arm64。运行代码新增 desktop supervisor 与 guarded bridge，未更换代理/控制器架构。

- 172 项离线测试通过，包括真实子进程的合成 config/read、旧参数作用域缺陷、错误/超时/取消、重复启动、管理认证、端口占用、PID 复用隔离、关闭后重启及启动期间停止。测试不调用真实服务。
- 本机官方应用签名、固定版本和真实能力查询通过；一条 start 命令到 running，bridgeChecks=2、effectiveProvider=cae、connected=true、shadow + baseline。
- desktop stop 完成清理；再次启动后向主控发送 SIGINT，验证与终端 Ctrl+C 对应的清理路径。
- 最终源码再次完成 start → running → stop。四次本机启动均未提交生成任务，代理事件为空。新启动器的启动/停止证据与[此前桌面真实传输验收](DESKTOP_ACCEPTANCE.md)分别记录，不能把零生成启动检查说成新增的真实生成验收。

上述测试是本机结果；发布后的 CI 必须按新提交单独核对。原始输出仅留被忽略的 *.local.txt / *.local.json。

最终本机复查时间：2026-09-28 12:47:09，Asia/Shanghai。用于识别被测源码的 SHA-256：

| 文件 | SHA-256 |
|---|---|
| src/desktop.mjs | aa77a2c3f55ca1e138ccefe87581958614a2866a23d9c92d434a28304bfcf80e |
| bin/cae-desktop-bridge.mjs | cd6ad6eb35a146f592248644847b7bc59ded5bb2f9e3a195bd4cfb07830086be |
| bin/cae.mjs | bc4b766fc74572767633a4db51bf8c81cc4a1485d7e1471d59c710e805977789 |
