# 本地验收手册

## 0. 先确认边界

不要直接把 CAE 加到日常桌面程序。首版是协议与控制器 MVP，先通过独立 CLI 进程验证。不得读取或上传 `~/.codex/auth.json`、Cookie、Token、真实任务日志。不要修改日常 `~/.codex/config.toml`。验证目录用临时或非生产项目；保留一个可以正常工作的原版 Codex 会话。

## 1. 零费用检查

```bash
npm ci --ignore-scripts
npm run verify
node bin/cae.mjs doctor
node bin/cae.mjs probe > capabilities.local.json
```

前两项只使用模拟服务。`doctor` 调用原生 `--version`；`probe` 只做初始化和 model/list，不发起生成，但原生 Codex 自己可能查询在线模型元数据。探针失败时报告错误码和版本，不能把模拟 capability 当作真实能力。原生命令不在 PATH 时使用 `--codex` 指定已安装的可信 Codex CLI 路径；不要猜测或替换桌面包内二进制。

## 2. 保持认证方式

选择探针中一个实际 model，配置其支持的 baseline。用订阅就明确选 `chatgpt`；只有本来要按量付费才选 `api`。

```bash
node bin/cae.mjs init --model "$MODEL_ID" --auth chatgpt --capabilities capabilities.local.json
node bin/cae.mjs launch-args --auth chatgpt
```

审查输出参数：固定模型、Responses、本地地址、环境变量名；不应出现真实密钥，不应改变审批/沙箱规则。第一次真实请求先将 `.cae/config.json` 的 mode 改为 `off`。只改 CAE 自己的文件。

## 3. 真实传输验收（需用户明确授权）

下面会产生真实模型使用量。

```bash
# 终端一
node bin/cae.mjs serve --enable-upstream
# 终端二
node bin/cae.mjs codex --auth chatgpt --
```

先执行一个极小、无敏感信息的文本任务。核对它能正常流式输出、调用只读工具、继续下一轮、取消、结束后恢复原版 Codex。401/403/协议错误必须原样记录错误码与版本，不得通过网页抓登录、换 API 或隐藏重试修复。

若使用 `api`，初始化和启动都用 `--auth api`，并由用户在自己的终端提供 `OPENAI_API_KEY`。不要在共享截图、聊天或命令参数里出现值。

## 4. 手动改档验收（不使用 Jev）

在传输通过之后，用另一终端操作：

```bash
node bin/cae.mjs control auto
node bin/cae.mjs lock low
# 在实验 Codex 发一个小任务
node bin/cae.mjs lock high
# 再发一个小任务
node bin/cae.mjs status
node bin/cae.mjs report
node bin/cae.mjs control off
```

只用该模型真实支持的档位。观察 prepared/sent/outcome 是三个不同阶段；请求发送或200返回不能独自证明模型采用了预期推理预算。报告不应把未知 usage 写为0，也不应给出节省比例。图像、压缩或未知增量历史可旁路；检查 reason，不要强行删历史使其变成 eligible。

## 5. Jev 影子与自动模式（另需第三方文本处理授权）

停止服务，改 `judge.kind=typesafe`，正常设置 `TYPESAFE_API_KEY`。默认服务模型是 `jev-latest`，不是冻结权重；验收记录模型字符串和日期。启动需要 `--enable-jev`。先 `shadow`，确认短中文请求与工具错误摘要符合预期，再小范围 `auto`。可将 `judge.maxCalls` 设为小数值，例如 5，验证超限后保留来请求档位；这是次数，不是金额。

私有代码不应为了评估而上传到未经批准的第三方。判断器看到的内容即使已脱敏也可能有商业机密。必须说明这种风险后再启用。

## 6. 对照评估

使用同一初始项目快照、相同任务和真实支持的模型，比较原固定档、代理 off、Jev shadow、Jev auto。至少覆盖机械修改、明确局部实现、跨文件调试、状态恢复/存档兼容、连续中文「继续/其他不变」和长会话压缩边界。

记录完成/失败、测试结果、返工轮次、总耗时、所有可观察模型用量、Jev 次数/用量、缓存读取和取消错误。记录 unknown。重复几次并交替顺序，避免热缓存/任务熟练度造成偏差。不能固定模拟 token 数量然后宣布真实节省。

使用 [acceptance-template.md](acceptance-template.md) 记录脱敏结果；真实捕获留在被忽略的本地文件中。

## 7. 撤销

关闭实验 Codex，Ctrl+C 停止 CAE，再用原方式启动 Codex。`control off` 不是退出代理。不要为“恢复”覆盖日常登录文件。端口冲突时只调整 CAE config 的 port，并重启实验进程。
