# 给本地 Codex 的首轮任务

下面整段可作为新会话任务。项目已经实现，**不要重新从规划搭架子，也不要先安装两套上游项目**。

> 你正在维护 Codex Adaptive Effort v0.1.0-alpha.1。先读取 AGENTS.md、README.md、docs/VALIDATION.md 和 docs/LIMITATIONS.md。
>
> 1. 在不读取登录凭证、不发起真实 GPT/Jev 生成、不修改全局 Codex 配置的前提下，运行 npm ci --ignore-scripts 和 npm run verify。记录实际测试结果，不把原来的成绩当作本机成绩。
> 2. 运行 node bin/cae.mjs doctor，再使用原生 Codex app-server 的 model/list 探针确认当前 CLI 的模型/effort 能力；探针只查元数据，不执行任务。探针不兼容时定位版本和协议差异，不读取 auth.json 作为替代。
> 3. 用户已授权在 ppxu 账号下创建公开的 codex-adaptive-effort 仓库。当前交付尚未创建远程仓库。检查 GitHub CLI 正常登录的账号；不要输出令牌。对新解压且没有 .git 的源码先运行 node scripts/publish-github.mjs --owner ppxu --dry-run，再运行同命令的 --public。缺少正常 gh 登录时让用户走 gh 官方登录流程，不索取或代为提取 Token。同名仓库已存在时先核对内容，禁止覆盖或强推。
> 4. 检查真正的远程提交、公开可见性及 CI 结果。创建动作/推送/CI 分别报告；其中任何一步未完成都明确写出。创建成功后通过普通 git 继续维护。
> 5. 给出本机真实 Codex 验收差距。实际 GPT/Jev 请求会消耗额度或费用，只有用户另外明确授权后，才按 docs/LOCAL_VALIDATION.md 从 off 和手动锁档开始，用一次性 CLI 参数逐级验证。不得自动改用 API 付费；不得假定桌面端可用。
>
> 本轮交付：本机测试摘要、探针结果摘要、GitHub 仓库和提交链接（仅真实存在时）、CI 状态、下一项最小真实验收步骤。不要上传 .cae、capabilities.local.json、原始日志、真实任务文本或任何凭证。
