# DeepSeek Autocomplete

[English](./README.md) | [简体中文](./README_zh-CN.md)

当前代码已精简为仅提供自动补全的版本，只保留 `copilot-replica` 算法及其 GhostText/FIM 上下文、缓存、取消请求、Notebook 支持和可选的下一步编辑建议。

- 移除聊天模型注册、供应商管理、OAuth 登录、余额监控、导入导出和提交消息生成。
- 移除命令式配置和 QuickPick 设置表单，所有设置均在 VS Code 插件设置页填写。
- 不禁用或排除 GitHub Copilot，不修改其默认模型或其他扩展的设置。
- 直接请求配置的 API，不需要安装或登录 GitHub Copilot。

## 配置

1. 打开 VS Code 设置，搜索 `@ext:SmallMain.deepseek-autocomplete`，或点击右下角的 **Autocomplete** 状态栏项。
2. 填写 **Completion: Base Url**、**Completion: Api Key** 和 **Completion: Model**。
3. 选择 **Completion: Api Type**，原生 FIM 模型还需选择对应的 **Completion: Fim Template**。

基础 URL 需包含 API 前缀，例如 `https://api.openai.com/v1`、Ollama 的 OpenAI 兼容地址 `http://localhost:11434/v1`，或 vLLM 服务的 `/v1` 地址。插件自动追加 `/completions` 或 `/chat/completions`，基础 URL 不要包含这些接口后缀。

`completions` 发送原生 FIM 提示词，需使用代码补全模型；`chat-completions` 使用提示词适配聊天模型。`fim`、`codegemma` 和 `qwen2.5-coder` 是同一 `copilot-replica` 算法内的提示词模板，不是其他算法。

模型留空时不发送请求；本地匿名服务的 API Key 可以留空。设置修改即时生效，无需重启 VS Code；修改端点、密钥、模型或模板时会销毁旧运行实例和过期缓存。

## 设置项

自动补全设置的统一前缀为 `unifyChatProvider.completion`。

| 设置 | 用途 |
| --- | --- |
| `enabled` | 仅开关本插件的自动补全。 |
| `baseUrl`、`apiKey`、`model`、`apiType` | API 连接与模型。 |
| `fimTemplate` | 模型支持的 FIM 提示词格式。 |
| `maxTokens`、`candidateCount`、`temperature` | 输出长度、手动切换候选与采样参数。 |
| `timeoutMs` | 请求最长时间，包括流式响应。 |
| `extraHeaders`、`extraBody` | 自定义请求参数，请求头支持 `${APIKEY}`。 |
| `disabledGlobs`、`enabledLanguages` | 文件与语言排除规则。 |
| `respectSelectedCompletionInfo` | 考虑当前选中的 IntelliSense 建议。 |
| `nes.enabled`、`nes.model`、`nes.maxTokens` | 可选的下一步编辑建议；NES 模型留空时使用 FIM 模型。 |
| `nes.cursorPrediction`、`nes.eagerness`、`nes.strategy` | 可选光标预测、积极程度与下一步编辑提示词格式。 |

API 连接设置仅允许在用户设置中配置，防止工作区将携带密钥的请求重定向到其他服务。API Key 和额外请求头不参与 Settings Sync，但会**以明文保存在用户设置中**，不要将真实密钥提交到版本控制。

`.env`、私钥、证书等内置敏感文件排除规则始终生效，`disabledGlobs` 用于追加规则。被忽略规则过滤的文件也不会进入 replica 上下文。

## 状态栏

右下角 **Autocomplete** 使用 Continue 自动补全所采用的内置状态图标：启用、停用和加载中；配置缺失或无效时显示警告图标。点击后直接打开本插件的设置页，不会打开命令式设置对话框。

GitHub Copilot 保持独立，多个提供器的建议由 VS Code 正常处理。本插件不再设置排除或优先避让其他提供器的注册元数据。

## VS Code 兼容性

需要 VS Code 1.115.0 或更高版本。普通 FIM 自动补全使用稳定的行内补全 API；可选 NES 需要 `inlineCompletionsAdditions`。该实验性 API 不可用时仍提供 FIM，但不启动 NES。本插件不会修改 VS Code 应用文件或实验性 API 授权。

旧供应商列表和命令式配置不再读取，请在新设置页重新填写端点、密钥和模型。不会自动重写或删除已有用户配置和已保存的密钥。

## 开发与测试

```sh
npm install
npm run compile
npm run test:unit
npm run test:e2e
```

单元测试使用 Vitest，Extension Host 测试使用 `@vscode/test-electron`、本机已安装的 VS Code、隔离用户目录和本地模拟 API。测试不会下载、安装或复制 VS Code。自动发现不足时，可将 `VSCODE_EXECUTABLE_PATH` 指向已有可执行文件或 macOS `.app`。

保留的 `src/chat-lib` 包含 replica 的补全引擎及解析器、diff 基础设施，不是聊天功能。`npm run compile` 会打包必要的 parser、diff 和 WASM 资源。
