# 实际验证记录 / 2026-09-24

> 本文保留最初容器验证的历史结果。2026-09-28 的 macOS 本机能力探针、153 项离线测试和真实 CLI 传输验收见 [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md)；仓库已发布，CI 需按实际提交单独核对。

**版本：0.1.0-alpha.1。环境：Linux x64，Node v22.16.0。** 下列“通过”只对应实际执行的本地检查，不能外推为 Codex/ChatGPT/Jev 真机验收。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| JavaScript 语法与 JSON | 24 个模块语法检查通过，JSON 解析通过 | [完整 verify 输出](validation/offline-verify.txt) |
| 自动化测试 | **145 通过，0 失败，0 取消，0 跳过** | 同上 |
| 覆盖率模式再次执行 | **145 通过** | [coverage 原始输出](validation/coverage.txt) |
| 真实本地 HTTP/SSE | 模拟上游上的请求/响应、分片、取消、错误、旁路、会话复用等通过 | test/proxy.test.mjs |
| CLI 子进程 | serve → status → auto → lock → 请求 → report → off → 停止通过 | test/cli.test.mjs |
| App Server 探针 | 模拟子进程初始化、分页、错误、超时测试通过 | test/config-codex.test.mjs |
| TypeSafe 契约 | 真实请求构造代码 + 注入的模拟 fetch；格式、上限、错误与取消测试通过 | test/judge.test.mjs |
| 五阶段离线演示 | shadow / auto / 有效期复用 / 手动锁档 / off 通过 | [演示输出](validation/demo.json) |
| 发布文件扫描 | 私有运行目录排除、疑似密钥、软链接、不允许文件拒绝测试通过 | test/publication.test.mjs |
| GitHub 建仓 | **未执行成功：当前连接器无建仓动作，目标查询返回404** | 无远程成功凭证；不得生成虚构链接 |
| GitHub CI | 配置已写，**未运行** | .github/workflows/ci.yml |
| 真正的 Codex / ChatGPT / OpenAI API / Jev | **未调用 / 未验收** | 开发环境 doctor 报 codexFound=false；未使用任何模型账户密钥 |
| macOS / Windows / Node24 | **本地未执行**；仅配置 CI 矩阵 | 不可称为已通过的多平台支持 |

覆盖率工具对本次已加载文件报告行覆盖 98.54%、分支覆盖 91.25%，**包含测试代码**，不是全部生产功能的独立覆盖率指标。CLI 原生启动分支及真实 GitHub 发布分支没有实测；真实协议、任务质量或安全性也不能由这些百分比推导。

## 调试中真实修复的问题

本地集成测试曾发现 Node 原生 fetch 自动添加的 `sec-fetch-mode` 被错误认作浏览器请求，造成403。修复后继续保留 Origin/site/destination/Host 与随机令牌保护，再重跑整套测试。还补上了模型 capability 非数组数据、畸形完成事件、日志中的未知用量及公开文件扫描的回归检查。

## 不能据此声称

不能声称桌面端已接入、订阅认证可靠、Jev 判断中文准确、模型实际节省推理、缓存命中提升、任务质量不变或费用下降。演示中的 token 计数来自**合成上游**，不是账户消耗。传输请求的“sent”不等于模型已验证采用该 effort。后续真机结果需按 LOCAL_VALIDATION.md 独立记录。

## 复现

```bash
npm ci --ignore-scripts
npm run verify
npm run coverage
node scripts/publish-github.mjs --owner ppxu --dry-run
```

前四个命令不需要真实模型密钥；发布 dry-run 不连接 GitHub。实际 `--public` 需要本地 GitHub CLI 的正常登录，是另一个显式执行步骤。
