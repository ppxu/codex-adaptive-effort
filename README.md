# Codex Adaptive Effort（CAE）

**固定执行模型，动态调整思考强度。** 这是面向本地 Codex 的实验性开源控制器，设计借鉴 Astra-Ares 的固定模型/决策生命周期，以及 Jev Codex Router 的本地代理/有限判断摘要。

**当前版本：`0.1.0-alpha.1`。** 有真实可运行的 Node.js 代码、自动化测试和本地 HTTP/SSE 演示；不是只有规划的项目，也不是已获官方支持的 Codex 桌面插件。真实 Codex、ChatGPT 订阅链路和 Jev 服务仍需在使用者机器上验收。没有节省费用、保持质量或生产可用性的保证。

[English](README.en.md) · [本地验收](docs/LOCAL_VALIDATION.md) · [架构](docs/ARCHITECTURE.md) · [验证记录](docs/VALIDATION.md) · [限制](docs/LIMITATIONS.md)

## 已实现

| 能力 | 本版行为 |
|---|---|
| 固定模型 | 只改已配置模型的 `reasoning.effort`，不自动切模型、服务商、速度档或计费渠道；用户选其他模型时透明旁路 |
| 三种模式 | 默认 `shadow`：评估但不改请求；`auto`：应用已校验档位；`off`：不评估、不改档 |
| Jev 判断 | TypeSafe System One 两个 Choice：思考强度、1–4 次生成的决策有效期；支持独立超时和调用次数上限 |
| 状态控制 | 同会话单活动请求；只有成功完成的请求可建立有效期；新输入、错误、历史改写、手动控制或超时会使旧决策失效 |
| 手动接管 | 本地认证控制接口，可锁档和取消锁档；只有 `auto` 模式实际改档，锁档不越过不兼容形态保护 |
| 文本摘要 | Jev 只收到有界文本证据，不接收执行模型认证、加密思考或系统指令；执行模型的完整请求历史不被删减 |
| 传输 | 只监听 `127.0.0.1`；本地随机令牌；Host/浏览器来源检查；HTTP/SSE 字节透传；不重试、不跟随重定向 |
| 可观察性 | 建议、准备、发送、响应结果分开记录；Jev 调用和已知用量单独记录；缺失值为未知，不造节省比例 |
| Codex 辅助 | `doctor`、原生 `model/list` 能力探针、一次性 CLI 启动参数；不修改日常 `config.toml` 或读取登录文件 |

**不实现：** WebSocket 代理、原生 Codex 补丁、自动桌面安装、`configuration_update` 注入、多模型路由、配额耗尽换渠道、完整缓存优化。含图片、未知增量上下文、压缩历史或已有配置更新的请求会旁路而不是盲猜。

## 先离线运行（不需要任何模型密钥）

Node.js **22.16+**。运行代码没有第三方 npm 依赖，也没有安装脚本。

```bash
npm ci --ignore-scripts
npm run verify
```

`verify` 会做语法检查、自动化测试、五阶段 HTTP/SSE 演示。演示启动的判断器和模型后端都是本地模拟；它证明接线与状态控制，不证明 Jev 判断准确度或真实节省。

```bash
node bin/cae.mjs --help
node bin/cae.mjs doctor
```

## 本地 Codex 接入顺序

先读 [LOCAL_VALIDATION.md](docs/LOCAL_VALIDATION.md)，按「原版 → off → 手动 auto → Jev shadow → Jev auto」逐级验证。**这不是默认启用的桌面兼容承诺。** 首版提供可撤销的 CLI 路径验证代理；桌面原生接入尚未实现。

仅查询本机 Codex 公布的模型/档位，不发起生成：

```bash
node bin/cae.mjs probe > capabilities.local.json
```

选取探针实际返回的模型 ID，保留原有认证方式。使用 ChatGPT 订阅时：

```bash
# MODEL_ID 必须替换为 probe 返回的真实 model 字段。
node bin/cae.mjs init --auth chatgpt --model "$MODEL_ID" --capabilities capabilities.local.json
```

`.cae/` 是新建的隔离控制器目录；已存在时拒绝覆盖。它不是新的 Codex 登录目录。CAE 不打开 `auth.json`；原生 Codex 仍自行处理其正常登录。

在明确同意发起真实模型请求后，开两个终端：

```bash
# 终端 1：默认仍是 shadow + baseline-only，未接入 Jev。
node bin/cae.mjs serve --enable-upstream

# 终端 2：仅该子进程使用代理，不改日常 Codex 配置。
node bin/cae.mjs codex --auth chatgpt --
```

ChatGPT 订阅链路包含认证、版本、传输等兼容性条件，**本版没有做真实验收**。出现认证/协议错误时停止接入、保留原版 Codex；不能通过导出 Cookie、拷贝网页凭证或改用 API 付费来假装修复。

API 使用者须从初始化起明确选择 `--auth api`，再在自己的终端提供 `OPENAI_API_KEY`。两种路线不能混用，代码会检查。API 请求可能按量计费；此工具不把订阅额度转换成 API 额度。

## 启用 Jev

默认 `judge.kind=baseline` **不是复杂度判断器**，只是接线验收用的固定基准。要接入 Jev：停止服务，在 `.cae/config.json` 将 `judge.kind` 改为 `typesafe`，通过你自己的密钥管理方式设置 `TYPESAFE_API_KEY`，然后显式执行：

```bash
node bin/cae.mjs serve --enable-upstream --enable-jev
```

此时仍从 `shadow` 开始。只有明确切换到 `auto` 才改档：

```bash
node bin/cae.mjs status
node bin/cae.mjs control auto
node bin/cae.mjs lock high
node bin/cae.mjs unlock
node bin/cae.mjs control off
node bin/cae.mjs report
```

以上 `high` 必须在你的模型支持集合内。控制是**此 CAE 服务实例级**的，影响其下一次尚未发送的合格请求，不修改正在生成的响应。

Jev 调用把有限任务文本发给 TypeSafe，不是本地离线推理；脱敏是尽力处理，不保证消除业务机密。不得把公司代码或敏感任务送入未批准的第三方服务。默认最多 100 次评估/服务进程，重启重置；这是调用次数上限，不是美元预算。取消或超时仍可能已产生服务端费用。

## 退出与恢复

`control off` 只关闭自动判断，**仍经过代理**。完全恢复：结束这次实验 Codex 进程，停止 CAE 服务，再正常运行原版 `codex` / 官方桌面应用。因为没有写日常配置，不需要回写登录信息。代理进程崩溃不等于自动直连；不承诺不中断地恢复。

## 发布到你自己的 GitHub

本源码包没有预先绑定或假定已创建的远程仓库。公开发布需要你本机正常登录的 GitHub CLI，脚本不会读取或显示访问令牌。

```bash
# 只检查候选公开文件，不访问 GitHub、不改 Git。
node scripts/publish-github.mjs --owner YOUR_LOGIN --dry-run

# 明确创建 PUBLIC 仓库并提交源码：
node scripts/publish-github.mjs --owner YOUR_LOGIN --public
```

脚本只支持**首次解压、没有 `.git` 的源码导出**，避免把含敏感旧历史的仓库公开。它核对当前 GitHub 账号、确认同名仓库不存在、重跑离线验证、扫描允许公开的文件，随后创建 `codex-adaptive-effort` 并推送。不会覆盖仓库、强推或删除任何远程资源；失败恢复见 [PUBLISHING.md](docs/PUBLISHING.md)。GitHub Actions 配置已提供，是否执行成功须看真实运行结果。

## 协议来源与开源边界

这是独立实现，没有打包两个上游项目源码或 Codex 二进制；设计来源和固定参考提交见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目代码为 MIT。模型、Jev API、Codex 和账户服务分别受其自身许可与使用条款约束；CAE 不是 OpenAI / TypeSafe 官方产品。
