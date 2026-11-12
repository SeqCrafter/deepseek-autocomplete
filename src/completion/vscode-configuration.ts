import * as vscode from 'vscode';
import type {
  NesAggressivenessSetting,
  NesPromptStrategy,
} from '../chat-lib/core/behavior-config';
import type { CompletionConfigurationResult } from './configuration';
import { mergeCompletionDisabledGlobs } from './disabled-globs';
import { INTERNAL_COMPLETION_VENDOR } from './types';

export const COMPLETION_CONFIGURATION_SECTION = 'deepseekAutocomplete.completion';

export type CompletionApiType = 'completions' | 'chat-completions';
export type CompletionFimTemplate = 'fim' | 'codegemma' | 'qwen2.5-coder' | 'suffix-param';

export interface CompletionConnectionSettings {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly apiType: CompletionApiType;
  readonly model: string;
  readonly fimTemplate: CompletionFimTemplate;
  readonly maxTokens: number;
  readonly candidateCount: number;
  readonly temperature: number;
  readonly timeoutMs: number;
  readonly debounceMs: number;
  readonly extraHeaders: Readonly<Record<string, string>>;
  readonly extraBody: Readonly<Record<string, unknown>>;
  readonly disabledGlobs: readonly string[];
  readonly enabledLanguages: Readonly<Record<string, boolean>>;
  readonly respectSelectedCompletionInfo: boolean;
  readonly nes: {
    readonly enabled: boolean;
    readonly model: string;
    readonly maxTokens: number;
    readonly cursorPrediction: boolean;
    readonly eagerness: NesAggressivenessSetting;
    readonly strategy: Exclude<NesPromptStrategy, 'xtabUnifiedModel'>;
  };
}

export interface CompletionConnectionSettingsResult {
  readonly configuration: CompletionConnectionSettings;
  readonly status: 'ready' | 'unconfigured' | 'invalid';
  readonly error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveInteger(
  value: unknown,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function readModel(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isHeaderValue(value: string): boolean {
  return !/[^\t\x20-\x7e\x80-\xff]/.test(value);
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (
    (!Array.isArray(value) && !isRecord(value)) ||
    ancestors.has(value) ||
    ancestors.size >= 100
  ) {
    return false;
  }
  ancestors.add(value);
  const valid = Object.values(value).every((entry) =>
    isJsonValue(entry, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

export function normalizeCompletionConnectionSettings(
  raw: Readonly<Record<string, unknown>>,
): CompletionConnectionSettingsResult {
  let error: string | undefined;
  let baseUrl = '';
  const configuredUrl =
    raw.baseUrl === undefined ? 'https://api.openai.com/v1' : raw.baseUrl;
  if (typeof configuredUrl === 'string') {
    const trimmedUrl = configuredUrl.trim();
    try {
      const url = new URL(trimmedUrl);
      if (
        /^https?:\/\//i.test(trimmedUrl) &&
        !/[\x00-\x20\x7f\\]/.test(trimmedUrl) &&
        !/[?#]/.test(trimmedUrl) &&
        !/^https?:\/\/[^/?#]*@/i.test(trimmedUrl) &&
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      ) {
        baseUrl = url.toString().replace(/\/+$/, '');
      }
    } catch {
      // Invalid endpoint values are never replaced with a live default endpoint.
    }
  }
  if (!baseUrl) {
    error =
      'Completion baseUrl must be an HTTP or HTTPS API base URL without credentials, query, or fragment.';
  }

  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  if (
    (raw.apiKey !== undefined && typeof raw.apiKey !== 'string') ||
    !isHeaderValue(apiKey) ||
    /[\x00-\x20\x7f]/.test(apiKey)
  ) {
    error ??= 'Completion apiKey must be a string without invalid HTTP header characters.';
  }

  let extraHeaders: Record<string, string> = {};
  if (raw.extraHeaders !== undefined) {
    if (
      isRecord(raw.extraHeaders) &&
      Object.entries(raw.extraHeaders).every(
        ([name, value]) =>
          /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name.trim()) &&
          typeof value === 'string' &&
          isHeaderValue(value),
      )
    ) {
      extraHeaders = Object.fromEntries(
        Object.entries(raw.extraHeaders).map(([name, value]) => [
          name.trim().toLowerCase(),
          typeof value === 'string' ? value.trim() : '',
        ]),
      );
    } else {
      error ??= 'Completion extraHeaders must map valid HTTP header names to string values.';
    }
  }

  let extraBody: Record<string, unknown> = {};
  if (raw.extraBody !== undefined) {
    if (isRecord(raw.extraBody) && isJsonValue(raw.extraBody)) {
      extraBody = Object.fromEntries(Object.entries(raw.extraBody));
    } else {
      error ??= 'Completion extraBody must be a JSON object.';
    }
  }

  const languages = raw.enabledLanguages;
  const enabledLanguages: Record<string, boolean> =
    isRecord(languages) &&
    Object.entries(languages).every(
      ([language, enabled]) => language.trim() && typeof enabled === 'boolean',
    )
      ? Object.fromEntries(
          Object.entries(languages).map(([language, enabled]) => [
            language.trim(),
            enabled === true,
          ]),
        )
      : { '*': true };
  const model = readModel(raw.model);
  const strategy = raw['nes.strategy'];
  const eagerness = raw['nes.eagerness'];
  const configuration: CompletionConnectionSettings = {
    enabled: readBoolean(raw.enabled, true),
    baseUrl,
    apiKey,
    apiType: raw.apiType === 'chat-completions' ? 'chat-completions' : 'completions',
    model,
    fimTemplate:
      raw.fimTemplate === 'fim' ||
      raw.fimTemplate === 'codegemma' ||
      raw.fimTemplate === 'qwen2.5-coder' ||
      raw.fimTemplate === 'suffix-param'
        ? raw.fimTemplate
        : 'suffix-param',
    maxTokens: readPositiveInteger(raw.maxTokens, 256),
    candidateCount: readPositiveInteger(raw.candidateCount, 1, 10),
    temperature:
      typeof raw.temperature === 'number' && Number.isFinite(raw.temperature)
        ? Math.min(2, Math.max(0, raw.temperature))
        : 0,
    timeoutMs: readPositiveInteger(raw.timeoutMs, 10_000, 2_147_483_647),
    debounceMs:
      typeof raw.debounceMs === 'number' && Number.isFinite(raw.debounceMs)
        ? Math.min(5_000, Math.max(0, Math.round(raw.debounceMs)))
        : 150,
    extraHeaders,
    extraBody,
    disabledGlobs: mergeCompletionDisabledGlobs(
      Array.isArray(raw.disabledGlobs)
        ? raw.disabledGlobs.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    ),
    enabledLanguages,
    respectSelectedCompletionInfo: readBoolean(
      raw.respectSelectedCompletionInfo,
      true,
    ),
    nes: {
      enabled: readBoolean(raw['nes.enabled'], false),
      model: readModel(raw['nes.model']) || model,
      maxTokens: readPositiveInteger(raw['nes.maxTokens'], 4_096),
      cursorPrediction: readBoolean(raw['nes.cursorPrediction'], false),
      eagerness:
        eagerness === 'low' || eagerness === 'medium' || eagerness === 'high'
          ? eagerness
          : 'auto',
      strategy:
        strategy === 'xtab275' ||
        strategy === 'xtabAggressiveness' ||
        strategy === 'xtab275Aggressiveness' ||
        strategy === 'xtab275AggressivenessHighLow' ||
        strategy === 'xtab275EditIntent' ||
        strategy === 'xtab275EditIntentShort'
          ? strategy
          : 'copilotNesXtab',
    },
  };
  return {
    configuration,
    status: error ? 'invalid' : model ? 'ready' : 'unconfigured',
    ...(error === undefined ? {} : { error }),
  };
}

export function readCompletionConnectionSettings(): CompletionConnectionSettingsResult {
  const settings = vscode.workspace.getConfiguration(
    COMPLETION_CONFIGURATION_SECTION,
  );
  return normalizeCompletionConnectionSettings(
    Object.fromEntries(
      [
        'enabled',
        'baseUrl',
        'apiKey',
        'apiType',
        'model',
        'fimTemplate',
        'maxTokens',
        'candidateCount',
        'temperature',
        'timeoutMs',
        'debounceMs',
        'extraHeaders',
        'extraBody',
        'disabledGlobs',
        'enabledLanguages',
        'respectSelectedCompletionInfo',
        'nes.enabled',
        'nes.model',
        'nes.maxTokens',
        'nes.cursorPrediction',
        'nes.eagerness',
        'nes.strategy',
      ].map((key) => [key, settings.get<unknown>(key)]),
    ),
  );
}

export function readCompletionConfiguration(): CompletionConfigurationResult {
  const { configuration: settings, status } = readCompletionConnectionSettings();
  const fimModel = { vendor: INTERNAL_COMPLETION_VENDOR, id: settings.model };
  const nesModel = { vendor: INTERNAL_COMPLETION_VENDOR, id: settings.nes.model };
  return {
    configuration: {
      enabled: settings.enabled,
      providers:
        status === 'ready'
          ? [
              {
                id: 'copilot-replica',
                algorithm: 'copilot-replica',
                options: {
                  enableFIM: true,
                  enableNES: settings.nes.enabled,
                  n: settings.candidateCount,
                  fimModel,
                  ...(settings.nes.enabled ? { nesModel } : {}),
                  ...(settings.nes.enabled && settings.nes.cursorPrediction
                    ? { cursorPredictionModel: nesModel }
                    : {}),
                  enabledLanguages: settings.enabledLanguages,
                  inlineEditsEnabledLanguages: settings.enabledLanguages,
                  respectSelectedCompletionInfo:
                    settings.respectSelectedCompletionInfo,
                  eagerness: settings.nes.eagerness,
                  strategy: settings.nes.strategy,
                },
              },
            ]
          : [],
      strategy: {
        mode: 'all',
        stopWhen: { type: 'firstUsable', graceMs: 0 },
        disabledGlobs: settings.disabledGlobs,
      },
    },
    issues: [],
  };
}

export function affectsCompletionConfiguration(
  event: vscode.ConfigurationChangeEvent,
): boolean {
  return event.affectsConfiguration(COMPLETION_CONFIGURATION_SECTION);
}
