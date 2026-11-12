# Dspilot

[English](./README.md) | [简体中文](./README_zh-CN.md)

AI inline code completion for VS Code, powered by **DeepSeek** or any other OpenAI-compatible model. Requests go straight to the endpoint you configure. GitHub Copilot is not required.

## Features

- **Inline completion (FIM)**: context-aware ghost text from the code before and after the cursor, similar files and recent edits, with single-line and multi-line suggestions.
- **Fewer wasted requests**: debounced requests, cancellation of stale requests, and a local cache that serves repeated or already-typed suggestions without calling the API.
- **Next-edit suggestions (optional)**: predicts your next edit. Requires VS Code's `inlineCompletionsAdditions` proposed API.
- **Usage statistics**: hover the status bar icon (bottom right) to see requests sent, cache hits, requests saved by debounce, and token usage for the current session.
- **Safe by default**: sensitive files such as `.env`, private keys and certificates are always excluded.

## Quick Start

1. Open Settings and search for `@ext:XiaoHanys.deepseek-autocomplete`, or click the status bar icon at the bottom right.
2. Set **Base Url**, **Api Key** and **Model**.
3. Start typing in any file. Suggestions appear as ghost text; press `Tab` to accept.

Example for DeepSeek:

```json
{
  "deepseekAutocomplete.completion.baseUrl": "https://api.deepseek.com/beta",
  "deepseekAutocomplete.completion.apiKey": "sk-...",
  "deepseekAutocomplete.completion.model": "deepseek-chat"
}
```

### Using other models

Any OpenAI-compatible service works: OpenAI, Ollama (`http://localhost:11434/v1`), vLLM, LM Studio, OpenRouter and so on.

- Native code-completion models (for example Qwen Coder base models): set `apiType` to `completions` and pick the matching `fimTemplate`.
- Chat models: set `apiType` to `chat-completions`.
- The base URL includes the version prefix (such as `/v1`); `/completions` or `/chat/completions` is appended automatically.
- Leave `apiKey` empty for anonymous local servers. An empty `model` sends no requests.

## Settings

All settings use the prefix `deepseekAutocomplete.completion.` and take effect without reloading VS Code.

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Turn autocomplete on or off. |
| `baseUrl` | `https://api.openai.com/v1` | OpenAI-compatible API base URL. |
| `apiKey` | empty | API key. Stored in plain text in User Settings; never commit it. |
| `model` | empty | Model ID. |
| `apiType` | `completions` | `completions` or `chat-completions`. |
| `fimTemplate` | `suffix-param` | FIM prompt format: `suffix-param`, `fim`, `codegemma`, `qwen2.5-coder`. |
| `maxTokens` | `256` | Maximum output tokens per request. |
| `candidateCount` | `1` | Number of candidates when cycling suggestions. |
| `temperature` | `0` | Sampling temperature. |
| `timeoutMs` | `10000` | Maximum request duration in milliseconds. |
| `debounceMs` | `150` | Wait after typing before sending a request; `0` disables it. |
| `extraHeaders` | `{}` | Extra HTTP headers; `${APIKEY}` is replaced with your key. |
| `extraBody` | `{}` | Extra fields merged into the request body. |
| `disabledGlobs` | `[]` | File patterns where autocomplete is off. |
| `enabledLanguages` | `{"*": true}` | Per-language switch, for example `{"markdown": false}`. |
| `respectSelectedCompletionInfo` | `true` | Account for the selected IntelliSense item. |
| `nes.enabled` | `false` | Enable next-edit suggestions. |
| `nes.model` | empty | Model for next edits; empty uses `model`. |
| `nes.maxTokens` | `4096` | Maximum output tokens for next edits. |
| `nes.cursorPrediction` | `false` | Predict where the cursor should go next. |
| `nes.eagerness` | `auto` | `auto`, `low`, `medium` or `high`. |
| `nes.strategy` | `copilotNesXtab` | Next-edit prompt format. |

Connection settings (`baseUrl`, `apiKey`, `timeoutMs`, `extraHeaders`, `extraBody`) are user-level only, so a workspace cannot redirect requests that carry your key. `apiKey` and `extraHeaders` are excluded from Settings Sync.

## Status Bar

The icon at the bottom right shows the state: ready, disabled, misconfigured or generating. Hover it for this session's statistics. Token counts appear only when the API reports `usage`; streamed responses usually omit it unless your server supports `stream_options` (you can add it through `extraBody`).

## Requirements

VS Code 1.115.0 or later. Regular completion uses stable APIs only; next-edit suggestions need the `inlineCompletionsAdditions` proposed API and are skipped when it is unavailable.

## Development

```sh
npm install
npm run package   # compile and build a .vsix
```
