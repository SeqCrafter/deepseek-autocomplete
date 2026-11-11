# Dspilot

[English](./README.md) | [Simplified Chinese](./README_zh-CN.md)

This working copy is an autocomplete-only version of Unify Chat Provider. It keeps the `copilot-replica` algorithm and its GhostText/FIM context, caching, cancellation, notebook support and optional next-edit suggestions.

- No chat model registration, provider management, OAuth login, balance monitoring, import/export or commit-message generation.
- No commands or QuickPick forms for configuration. All settings are in the VS Code extension Settings page.
- No disabling or excluding GitHub Copilot, changing its default models, or altering other extensions' settings.
- API requests go directly to the endpoint you configure. GitHub Copilot does not need to be installed or signed in.

## Configure

1. Open VS Code Settings and search for `@ext:SmallMain.deepseek-autocomplete`, or click the **Autocomplete** item at the bottom right.
2. Fill in **Completion: Base Url**, **Completion: Api Key**, and **Completion: Model**.
3. Choose **Completion: Api Type** and, for native FIM models, **Completion: Fim Template**.

The base URL includes the API prefix, for example `https://api.openai.com/v1`, `http://localhost:11434/v1` for Ollama's OpenAI-compatible API, or your vLLM server's `/v1` URL. The plugin appends `/completions` or `/chat/completions` automatically. Do not include those endpoint suffixes in the base URL.

`completions` uses native FIM prompts and requires a code-completion model. `chat-completions` adapts a chat model to code completion. `fim`, `codegemma` and `qwen2.5-coder` are prompt templates within the same `copilot-replica` algorithm, not alternate algorithms.

An empty model sends no requests. An empty API key is allowed for anonymous local servers. Changes take effect without reloading VS Code; endpoint, key, model and template changes retire the old runtime and its cached results.

## Settings

All completion settings use the prefix `deepseekAutocomplete.completion`.

| Setting | Purpose |
| --- | --- |
| `enabled` | Enable or disable this plugin's autocomplete only. |
| `baseUrl`, `apiKey`, `model`, `apiType` | API connection and model. |
| `fimTemplate` | Model-specific FIM prompt format. |
| `maxTokens`, `candidateCount`, `temperature` | Output size, explicit suggestion cycling and sampling. |
| `timeoutMs` | Maximum request duration, including streamed responses. |
| `extraHeaders`, `extraBody` | Custom API parameters; header values support `${APIKEY}`. |
| `disabledGlobs`, `enabledLanguages` | File and language exclusions. |
| `respectSelectedCompletionInfo` | Account for the selected IntelliSense suggestion. |
| `nes.enabled`, `nes.model`, `nes.maxTokens` | Optional next-edit suggestions and model; empty NES model uses the FIM model. |
| `nes.cursorPrediction`, `nes.eagerness`, `nes.strategy` | Optional cursor prediction, aggressiveness and next-edit prompt format. |

Connection settings are user-scoped so a workspace cannot redirect requests containing your API key. The key and extra headers are excluded from Settings Sync, but they are stored **in plain text** in User Settings. Do not commit real keys to source control.

Built-in sensitive-file exclusions, including `.env`, private keys and certificates, always remain active. Additional `disabledGlobs` are merged with those protections. Files filtered by ignore rules are also omitted from replica context.

## Status Bar

The bottom-right **Autocomplete** item uses the same built-in status icons as Continue's autocomplete: enabled, disabled and loading, plus an alert for missing or invalid configuration. Clicking it opens this extension's Settings page, not a command-based configuration dialog.

GitHub Copilot remains independent. VS Code handles suggestions from multiple providers normally; this plugin contributes no exclusion or yielding metadata.

## VS Code Compatibility

Requires VS Code 1.115.0 or later. Normal FIM autocomplete works using the stable inline completion API. Optional NES requires `inlineCompletionsAdditions`; when unavailable, FIM remains enabled and NES is not started. The plugin never modifies VS Code application files or Proposed API grants.

Old provider-list and command-based settings are no longer read. Enter the desired endpoint, key and model in the new Settings page. Existing user settings and stored secrets are not automatically rewritten or removed.

## Development

```sh
npm install
npm run package   # compiles and produces a .vsix
```

`src/chat-lib` is retained because it contains the replica's completion engines and extracted parser/diff infrastructure, not a chat feature. `npm run compile` packages its required parser, diff and WASM resources. Unit and E2E tests have been removed from this working copy.
