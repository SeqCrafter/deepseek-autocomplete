# Dspilot

[English](./README.md) | [简体中文](./README_zh-CN.md)

VS Code 的 AI 行内代码补全，支持 **DeepSeek** 以及任何 OpenAI 兼容模型。请求直接发往你配置的接口，无需安装 GitHub Copilot。

## 功能

- **行内补全（FIM）**：结合光标前后代码、相似文件和最近编辑生成灰色补全，支持单行与多行。
- **减少无效请求**：请求防抖、取消过期请求，并有本地缓存，重复或已输入的建议不再调用 API。
- **下一步编辑建议（可选）**：预测你的下一处修改，需要 VS Code 的 `inlineCompletionsAdditions` 实验性 API。
- **使用统计**：鼠标悬浮在右下角状态栏图标上，可查看本次会话的请求数、缓存命中、防抖节省的请求和 token 用量。
- **默认更安全**：`.env`、私钥、证书等敏感文件始终被排除。

## 快速开始

1. 打开设置，搜索 `@ext:XiaoHanys.deepseek-autocomplete`，或点击右下角状态栏图标。
2. 填写 **Base Url**、**Api Key** 和 **Model**。
3. 在任意文件中输入代码，灰色建议出现后按 `Tab` 接受。

DeepSeek 示例：

```json
{
  "deepseekAutocomplete.completion.baseUrl": "https://api.deepseek.com/beta",
  "deepseekAutocomplete.completion.apiKey": "sk-...",
  "deepseekAutocomplete.completion.model": "deepseek-chat"
}
```

### 接入其他模型

任何 OpenAI 兼容服务都可以使用：OpenAI、Ollama（`http://localhost:11434/v1`）、vLLM、LM Studio、OpenRouter 等。

- 原生代码补全模型（如 Qwen Coder 基座模型）：`apiType` 设为 `completions`，并选择对应的 `fimTemplate`。
- 对话模型：`apiType` 设为 `chat-completions`。
- Base URL 需包含版本前缀（如 `/v1`），插件会自动追加 `/completions` 或 `/chat/completions`。
- 本地匿名服务可将 `apiKey` 留空；`model` 为空时不会发送任何请求。

## 设置项

所有设置的前缀为 `deepseekAutocomplete.completion.`，修改后无需重载 VS Code。

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 启用或关闭自动补全。 |
| `baseUrl` | `https://api.openai.com/v1` | OpenAI 兼容接口的基础 URL。 |
| `apiKey` | 空 | API 密钥，以明文保存在用户设置中，切勿提交到代码仓库。 |
| `model` | 空 | 模型 ID。 |
| `apiType` | `completions` | `completions` 或 `chat-completions`。 |
| `fimTemplate` | `suffix-param` | FIM 提示词格式：`suffix-param`、`fim`、`codegemma`、`qwen2.5-coder`。 |
| `maxTokens` | `256` | 单次请求最大输出 token。 |
| `candidateCount` | `1` | 轮换建议时的候选数量。 |
| `temperature` | `0` | 采样温度。 |
| `timeoutMs` | `10000` | 请求最长时间（毫秒）。 |
| `debounceMs` | `150` | 停止输入后等待多久再发请求，`0` 表示关闭防抖。 |
| `extraHeaders` | `{}` | 额外 HTTP 头，`${APIKEY}` 会被替换为你的密钥。 |
| `extraBody` | `{}` | 合并到请求体的额外字段。 |
| `disabledGlobs` | `[]` | 禁用补全的文件匹配模式。 |
| `enabledLanguages` | `{"*": true}` | 按语言开关，例如 `{"markdown": false}`。 |
| `respectSelectedCompletionInfo` | `true` | 考虑当前选中的 IntelliSense 项。 |
| `nes.enabled` | `false` | 启用下一步编辑建议。 |
| `nes.model` | 空 | 下一步编辑使用的模型，留空则使用 `model`。 |
| `nes.maxTokens` | `4096` | 下一步编辑的最大输出 token。 |
| `nes.cursorPrediction` | `false` | 预测光标下一个位置。 |
| `nes.eagerness` | `auto` | `auto`、`low`、`medium` 或 `high`。 |
| `nes.strategy` | `copilotNesXtab` | 下一步编辑的提示词格式。 |

连接类设置（`baseUrl`、`apiKey`、`timeoutMs`、`extraHeaders`、`extraBody`）仅在用户级别生效，工作区无法把带密钥的请求重定向到别处。`apiKey` 与 `extraHeaders` 不会参与设置同步。

## 状态栏

右下角图标表示当前状态：就绪、已禁用、配置有误或生成中。悬浮可查看本次会话的统计。只有 API 返回 `usage` 时才会统计 token；流式响应通常不带该字段，若服务端支持 `stream_options`，可通过 `extraBody` 添加。

## 环境要求

VS Code 1.115.0 或更高版本。普通补全只用稳定 API；下一步编辑建议需要 `inlineCompletionsAdditions` 实验性 API，不可用时会自动跳过。

## 开发

```sh
npm install
npm run package   # 编译并生成 .vsix
```
