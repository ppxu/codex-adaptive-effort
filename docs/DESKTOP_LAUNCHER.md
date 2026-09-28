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

实际可选 effort 取决于该模型的最新能力。手动锁档只对合格的主模型请求生效，作用域是整个 CAE 实例；工具历史等不兼容形态继续旁路。baseline 判断器不是复杂度判断器，本轮启动入口拒绝 Jev 配置；不增加第三方调用。

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
