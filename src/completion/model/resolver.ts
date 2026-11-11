import { createHash } from 'node:crypto';
import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';
import * as vscode from 'vscode';
import {
  buildCompatibleSystemPrompt,
  buildCompatibleUserPrompt,
  type CompatibleCompletionRequest,
} from '../template/compatible-prompt';
import {
  buildEffectiveStops,
  postprocessCompatibleCompletionText,
  postprocessNativeCompletionText,
  truncateAtFirstStop,
} from '../template/postprocess';
import { QWEN_FIM_STOPS } from '../template/qwen';
import {
  INTERNAL_COMPLETION_VENDOR,
  type CompletionModel,
  type CompletionModelCapabilities,
  type CompletionModelEligibility,
  type CompletionModelReference,
  type CompletionModelResolver,
} from '../types';
import {
  readCompletionConnectionSettings,
  type CompletionConnectionSettings,
  type CompletionConnectionSettingsResult,
} from '../vscode-configuration';
import { CompletionConfigurationError, CompletionRuntimeError } from './errors';
import type {
  AlgorithmRequestKind,
  CopilotReplicaAlgorithmCursorPredictionRequest,
  CopilotReplicaAlgorithmFimRequest,
  CopilotReplicaAlgorithmNesRequest,
} from './requests';
import type {
  CompletionChoice,
  CopilotReplicaAlgorithmCursorPredictionResponse,
  CopilotReplicaAlgorithmFimResponse,
  CopilotReplicaAlgorithmNesResponse,
} from './responses';

export { INTERNAL_COMPLETION_VENDOR } from '../types';

export interface CompletionProxySettings {
  readonly proxy: string;
  readonly proxyAuthorization: string;
  readonly proxyStrictSSL: boolean;
}

export interface CompletionFetchRequest {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
  readonly redirect: 'error';
}

interface CompletionBodyReader {
  read(): Promise<{ readonly done: boolean; readonly value?: unknown }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

export interface CompletionFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: {
    getReader(): CompletionBodyReader;
    cancel(reason?: unknown): Promise<void>;
  } | null;
  json(): Promise<unknown>;
}

export interface CompletionNetwork {
  fetch(url: string, request: CompletionFetchRequest): Promise<CompletionFetchResponse>;
  dispose?(): void | Promise<void>;
}

export type CompletionNetworkFactory = (
  proxy: CompletionProxySettings,
) => CompletionNetwork;
export type CompletionSettingsReader = () => CompletionConnectionSettingsResult;

type ReplicaRequest =
  | CopilotReplicaAlgorithmFimRequest
  | CopilotReplicaAlgorithmNesRequest
  | CopilotReplicaAlgorithmCursorPredictionRequest;
type ReplicaResponse =
  | CopilotReplicaAlgorithmFimResponse
  | CopilotReplicaAlgorithmNesResponse
  | CopilotReplicaAlgorithmCursorPredictionResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readProxySettings(): CompletionProxySettings {
  const settings = vscode.workspace.getConfiguration('http');
  const proxy = settings.get<unknown>('proxy');
  const authorization = settings.get<unknown>('proxyAuthorization');
  return {
    proxy: typeof proxy === 'string' ? proxy.trim() : '',
    proxyAuthorization:
      typeof authorization === 'string' ? authorization.trim() : '',
    proxyStrictSSL: settings.get<unknown>('proxyStrictSSL') !== false,
  };
}

function createCompletionNetwork(settings: CompletionProxySettings): CompletionNetwork {
  let dispatcher: Dispatcher | undefined;
  if (settings.proxy) {
    try {
      const proxy = new URL(settings.proxy);
      if (
        !/^https?:\/\//i.test(settings.proxy) ||
        (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') ||
        /[\x00-\x20\x7f\\]/.test(settings.proxy) ||
        /[^\t\x20-\x7e\x80-\xff]/.test(settings.proxyAuthorization)
      ) {
        throw new Error('Invalid proxy.');
      }
      dispatcher = new ProxyAgent({
        uri: settings.proxy,
        ...(settings.proxyAuthorization ? { token: settings.proxyAuthorization } : {}),
        requestTls: { rejectUnauthorized: settings.proxyStrictSSL },
        proxyTls: { rejectUnauthorized: settings.proxyStrictSSL },
      });
    } catch {
      throw new CompletionConfigurationError(
        'completion-invalid-config',
        'VS Code HTTP proxy configuration is invalid.',
      );
    }
  } else if (!settings.proxyStrictSSL) {
    dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }
  const requestDispatcher = dispatcher;
  return {
    fetch: (url, request) =>
      undiciFetch(url, { ...request, ...(requestDispatcher ? { dispatcher: requestDispatcher } : {}) }),
    ...(requestDispatcher ? { dispose: () => requestDispatcher.destroy() } : {}),
  };
}

function requireSettings(
  result: CompletionConnectionSettingsResult,
  reference: CompletionModelReference,
  kind?: AlgorithmRequestKind,
): CompletionConnectionSettings {
  const settings = result.configuration;
  if (result.status === 'invalid') {
    throw new CompletionConfigurationError(
      'completion-invalid-config',
      result.error ?? 'Completion connection settings are invalid.',
    );
  }
  if (!settings.enabled || result.status !== 'ready' || !settings.model) {
    throw new CompletionConfigurationError(
      'completion-model-not-found',
      'Configure and enable an autocomplete model in VS Code settings.',
    );
  }
  if (
    reference.vendor !== INTERNAL_COMPLETION_VENDOR ||
    (reference.id !== settings.model &&
      (!settings.nes.enabled || reference.id !== settings.nes.model))
  ) {
    throw new CompletionConfigurationError(
      'completion-invalid-model-reference',
      'Completion model reference does not match the configured autocomplete model.',
    );
  }
  if (kind === 'copilot-replica/fim' && reference.id !== settings.model) {
    throw new CompletionConfigurationError(
      'completion-model-not-found',
      'FIM requires the configured primary autocomplete model.',
    );
  }
  if (kind === 'copilot-replica/nes' || kind === 'copilot-replica/cursor-prediction') {
    if (!settings.nes.enabled || reference.id !== settings.nes.model) {
      throw new CompletionConfigurationError(
        'completion-model-not-found',
        'Next-edit suggestions require the configured next-edit model to be enabled.',
      );
    }
    if (kind === 'copilot-replica/cursor-prediction' && !settings.nes.cursorPrediction) {
      throw new CompletionConfigurationError(
        'completion-cursor-prediction-unsupported',
        'Cursor prediction is disabled in VS Code settings.',
      );
    }
  }
  return settings;
}

function requestInteger(value: number | undefined, fallback: number, maximum: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function invalidResponse(): CompletionRuntimeError {
  return new CompletionRuntimeError(
    'completion-invalid-response',
    'Completion endpoint returned an invalid response.',
  );
}

function checkResponseError(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse();
  if (value.error !== undefined && value.error !== null) {
    throw new CompletionRuntimeError(
      'completion-http-error',
      'Completion endpoint reported an API error.',
    );
  }
}

function readChoices(value: unknown, chat: boolean): readonly CompletionChoice[] {
  checkResponseError(value);
  if (!Array.isArray(value.choices)) throw invalidResponse();
  return value.choices.map((choice: unknown) => {
    if (!isRecord(choice)) throw invalidResponse();
    const content = chat && isRecord(choice.message) ? choice.message.content : choice.text;
    if (typeof content !== 'string' && !(chat && content === null)) {
      throw invalidResponse();
    }
    return {
      text: typeof content === 'string' ? content : '',
      ...(typeof choice.finish_reason === 'string'
        ? { finishReason: choice.finish_reason }
        : {}),
    };
  });
}

function createRequestScope(
  token: vscode.CancellationToken,
  timeoutMs: number,
  network: CompletionNetwork,
) {
  const controller = new AbortController();
  let abortError: Error | undefined;
  let subscription: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: CompletionFetchResponse | undefined;
  let reader: CompletionBodyReader | undefined;
  let disposed = false;
  let cleanup: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    if (disposed) return cleanup ?? Promise.resolve();
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    subscription?.dispose();
    controller.abort(abortError);
    const bodyCleanup = (async () => {
      try {
        if (reader) await reader.cancel();
        else await response?.body?.cancel();
      } catch {
        // The fetch abort may have already closed or locked the response body.
      } finally {
        try {
          reader?.releaseLock();
        } catch {
          // A cancelled pending read releases its lock when it settles.
        }
      }
    })();
    const networkCleanup = (async () => {
      try {
        await network.dispose?.();
      } catch {
        // Cleanup errors must not replace the request result or expose credentials.
      }
    })();
    cleanup = Promise.all([bodyCleanup, networkCleanup]).then(() => undefined);
    return cleanup;
  };
  const abort = (error: Error): void => {
    if (disposed) return;
    abortError = error;
    void dispose();
  };
  subscription = token.onCancellationRequested(() => abort(new vscode.CancellationError()));
  if (disposed) subscription.dispose();
  if (token.isCancellationRequested) abort(new vscode.CancellationError());
  if (!disposed) {
    timer = setTimeout(
      () =>
        abort(
          new CompletionRuntimeError('completion-request-failed', 'Completion request timed out.'),
        ),
      timeoutMs,
    );
  }

  return {
    signal: controller.signal,
    dispose,
    error(error: unknown): Error {
      if (abortError) return abortError;
      if (error instanceof CompletionConfigurationError || error instanceof CompletionRuntimeError) {
        return error;
      }
      return new CompletionRuntimeError('completion-request-failed', 'Completion request failed.');
    },
    attachResponse(value: CompletionFetchResponse): void {
      response = value;
      if (disposed) void value.body?.cancel().catch(() => undefined);
    },
    attachReader(value: CompletionBodyReader): void {
      reader = value;
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (controller.signal.aborted) throw abortError ?? new vscode.CancellationError();
      let onAbort: (() => void) | undefined;
      try {
        return await new Promise<T>((resolve, reject) => {
          onAbort = () => reject(abortError ?? new vscode.CancellationError());
          controller.signal.addEventListener('abort', onAbort, { once: true });
          operation().then(resolve, reject);
        });
      } finally {
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      }
    },
  };
}

type RequestScope = ReturnType<typeof createRequestScope>;

interface SseEvent {
  readonly type: string;
  readonly data: string;
}

function readStreamingEvent(event: SseEvent): { readonly done: boolean; readonly text: string } {
  if (event.type === 'error') {
    throw new CompletionRuntimeError('completion-http-error', 'Completion endpoint reported an API error.');
  }
  if (event.data.trim() === '[DONE]') return { done: true, text: '' };
  let value: unknown;
  try {
    value = JSON.parse(event.data);
  } catch {
    throw invalidResponse();
  }
  checkResponseError(value);
  if (!Array.isArray(value.choices)) {
    if ('usage' in value) return { done: false, text: '' };
    throw invalidResponse();
  }
  for (const choice of value.choices) {
    if (!isRecord(choice)) throw invalidResponse();
    if (choice.index !== undefined && choice.index !== 0) continue;
    const content = isRecord(choice.delta) ? choice.delta.content : choice.text;
    if (content !== undefined && content !== null && typeof content !== 'string') {
      throw invalidResponse();
    }
    return { done: false, text: typeof content === 'string' ? content : '' };
  }
  return { done: false, text: '' };
}

function streamCompletionText(reader: CompletionBodyReader, scope: RequestScope): AsyncIterable<string> {
  const iterator = (async function* () {
    const decoder = new TextDecoder();
    let buffer = '';
    let data: string[] = [];
    let eventType = '';
    const drainEvents = (final: boolean): SseEvent[] => {
      const events: SseEvent[] = [];
      const line = (value: string): void => {
        if (!value) {
          if (data.length) events.push({ type: eventType, data: data.join('\n') });
          data = [];
          eventType = '';
          return;
        }
        if (value.startsWith(':')) return;
        const colon = value.indexOf(':');
        const field = colon === -1 ? value : value.slice(0, colon);
        const content = colon === -1 ? '' : value.slice(colon + 1).replace(/^ /, '');
        if (field === 'data') data.push(content);
        else if (field === 'event') eventType = content;
        else if (value.trimStart().startsWith('{')) throw invalidResponse();
      };
      for (;;) {
        const end = buffer.search(/[\r\n]/);
        if (end === -1 || (!final && buffer[end] === '\r' && end + 1 === buffer.length)) break;
        const length = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1;
        line(buffer.slice(0, end));
        buffer = buffer.slice(end + length);
      }
      if (final) {
        if (buffer) line(buffer);
        buffer = '';
        line('');
      }
      if (buffer.length + data.reduce((length, value) => length + value.length, 0) > 1_048_576) {
        throw invalidResponse();
      }
      return events;
    };
    try {
      for (;;) {
        const chunk = await scope.run(() => reader.read());
        if (!chunk.done && !(chunk.value instanceof Uint8Array)) throw invalidResponse();
        buffer += chunk.done
          ? decoder.decode()
          : decoder.decode(chunk.value instanceof Uint8Array ? chunk.value : undefined, { stream: true });
        for (const event of drainEvents(chunk.done)) {
          const result = readStreamingEvent(event);
          if (result.done) return;
          if (result.text) yield result.text;
        }
        if (chunk.done) return;
      }
    } catch (error) {
      throw scope.error(error);
    } finally {
      await scope.dispose();
    }
  })();

  // An unstarted async generator does not run finally on return(). Own cleanup here too.
  const managed: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]: () => managed,
    next: () => iterator.next(),
    async return() {
      const cleanup = scope.dispose();
      try {
        return await iterator.return();
      } finally {
        await cleanup;
      }
    },
    async throw() {
      const cleanup = scope.dispose();
      try {
        return await iterator.throw(new CompletionRuntimeError('completion-request-failed', 'Completion stream interrupted.'));
      } finally {
        await cleanup;
      }
    },
  };
  return managed;
}

class EndpointCompletionModel implements CompletionModel {
  constructor(
    private readonly reference: CompletionModelReference,
    private readonly readSettings: CompletionSettingsReader,
    private readonly createNetwork: CompletionNetworkFactory,
  ) {}

  async getCapabilities(): Promise<CompletionModelCapabilities> {
    const settings = requireSettings(this.readSettings(), this.reference);
    return { supportsNextCursorLinePrediction: settings.nes.cursorPrediction };
  }

  complete(request: CopilotReplicaAlgorithmFimRequest, token: vscode.CancellationToken): Promise<CopilotReplicaAlgorithmFimResponse>;
  complete(request: CopilotReplicaAlgorithmNesRequest, token: vscode.CancellationToken): Promise<CopilotReplicaAlgorithmNesResponse>;
  complete(request: CopilotReplicaAlgorithmCursorPredictionRequest, token: vscode.CancellationToken): Promise<CopilotReplicaAlgorithmCursorPredictionResponse>;
  async complete(request: ReplicaRequest, token: vscode.CancellationToken): Promise<ReplicaResponse> {
    const settings = requireSettings(this.readSettings(), this.reference, request.kind);
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    const fim = request.kind === 'copilot-replica/fim';
    const chat = !fim || settings.apiType === 'chat-completions';
    const candidateCount = fim ? requestInteger(request.options.candidateCount, settings.candidateCount, 10) : 1;
    // Native prefix/suffix FIM with a single candidate is read over SSE so it can stop as soon as a stop sequence appears.
    const streamFim = fim && !chat && settings.fimTemplate === 'suffix-param' && candidateCount === 1;
    const body: Record<string, unknown> = { ...settings.extraBody };
    for (const field of ['model', 'prompt', 'messages', 'n', 'max_tokens', 'max_completion_tokens', 'temperature', 'stop', 'stream', 'prediction']) {
      delete body[field];
    }
    Object.assign(body, {
      model: this.reference.id,
      n: candidateCount,
      max_tokens: fim
        ? requestInteger(request.options.maxTokens, settings.maxTokens, settings.maxTokens)
        : requestInteger(request.maxTokens, settings.nes.maxTokens, settings.nes.maxTokens),
      temperature: settings.temperature,
      stream: !fim || streamFim,
    });
    let prompt = '';
    let stops: readonly string[] = [];
    if (request.kind === 'copilot-replica/fim') {
      const nativeSuffix = settings.fimTemplate === 'suffix-param' && !chat;
      const template: CompatibleCompletionRequest = {
        kind: settings.fimTemplate === 'suffix-param' ? 'fim' : settings.fimTemplate,
        prefix: request.prefix,
        suffix: request.suffix,
        targetPath: request.targetPath,
        contexts: request.contexts,
        options: request.options,
      };
      prompt = nativeSuffix ? request.prefix : buildCompatibleUserPrompt(template);
      stops = buildEffectiveStops([
        ...(request.options.stop ?? []),
        ...(settings.fimTemplate === 'qwen2.5-coder' ? QWEN_FIM_STOPS : []),
      ]);
      body.stop = stops;
      if (chat) {
        body.messages = [
          { role: 'system', content: buildCompatibleSystemPrompt(template.kind) },
          { role: 'user', content: prompt },
        ];
      } else {
        body.prompt = prompt;
        if (nativeSuffix) body.suffix = request.suffix;
      }
    } else {
      body.messages = request.messages.map((message) => ({ ...message }));
      if (request.kind === 'copilot-replica/nes' && request.prediction) {
        body.prediction = { ...request.prediction };
      }
    }
    const headers: Record<string, string> = Object.fromEntries(
      Object.entries(settings.extraHeaders).map(([name, value]) => [
        name,
        value.replaceAll('${APIKEY}', settings.apiKey),
      ]),
    );
    headers['content-type'] = 'application/json';
    headers.accept = fim && !streamFim ? 'application/json' : 'text/event-stream';
    if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;

    const network = this.createNetwork(readProxySettings());
    const scope = createRequestScope(token, settings.timeoutMs, network);
    let streaming = false;
    try {
      const response = await scope.run(async () => {
        const result = await network.fetch(
          `${settings.baseUrl}/${chat ? 'chat/completions' : 'completions'}`,
          { method: 'POST', body: JSON.stringify(body), headers, signal: scope.signal, redirect: 'error' },
        );
        scope.attachResponse(result);
        return result;
      });
      if (!response.ok) {
        throw new CompletionRuntimeError('completion-http-error', `Completion endpoint returned HTTP ${response.status}.`);
      }
      if (streamFim) {
        if (!response.body) throw invalidResponse();
        const reader = response.body.getReader();
        scope.attachReader(reader);
        const iterator = streamCompletionText(reader, scope)[Symbol.asyncIterator]();
        let raw = '';
        let stopped = false;
        try {
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            raw += next.value;
            if (truncateAtFirstStop(raw, stops).length < raw.length) {
              stopped = true;
              break;
            }
          }
        } finally {
          await iterator.return?.();
        }
        const text = postprocessNativeCompletionText(raw, stops);
        return {
          kind: 'copilot-replica/fim',
          text,
          choices: [{ text, ...(stopped ? { finishReason: 'stop' } : {}) }],
        };
      }
      if (fim) {
        const value = await scope.run(() => response.json());
        const choices = readChoices(value, chat).map((choice) => ({
          ...choice,
          text: chat
            ? postprocessCompatibleCompletionText(choice.text, prompt, stops)
            : postprocessNativeCompletionText(choice.text, stops),
        }));
        return {
          kind: 'copilot-replica/fim',
          text: choices[0]?.text ?? '',
          choices,
          ...(choices[0]?.finishReason === undefined ? {} : { finishReason: choices[0].finishReason }),
          ...(isRecord(value) && value.usage !== undefined ? { usage: value.usage } : {}),
        };
      }
      if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        const choices = readChoices(await scope.run(() => response.json()), true);
        return {
          kind: request.kind,
          text: (async function* () {
            if (token.isCancellationRequested) throw new vscode.CancellationError();
            if (choices[0]?.text) yield choices[0].text;
          })(),
        };
      }
      if (!response.body) throw invalidResponse();
      const reader = response.body.getReader();
      scope.attachReader(reader);
      const text = streamCompletionText(reader, scope);
      streaming = true;
      return { kind: request.kind, text };
    } catch (error) {
      throw scope.error(error);
    } finally {
      if (!streaming) await scope.dispose();
    }
  }
}

export class ConfiguredCompletionModelResolver implements CompletionModelResolver {
  constructor(
    private readonly readSettings: CompletionSettingsReader = readCompletionConnectionSettings,
    private readonly createNetwork: CompletionNetworkFactory = createCompletionNetwork,
  ) {}

  getConfigurationFingerprint(reference: CompletionModelReference): string {
    const snapshot = JSON.stringify(
      { reference, settings: this.readSettings(), proxy: readProxySettings() },
      (_key: string, value: unknown) =>
        isRecord(value)
          ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
          : value,
    );
    return createHash('sha256').update(snapshot).digest('hex');
  }

  async resolveCompletionModel(reference: CompletionModelReference, token: vscode.CancellationToken): Promise<CompletionModel> {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    requireSettings(this.readSettings(), reference);
    return new EndpointCompletionModel({ ...reference }, this.readSettings, this.createNetwork);
  }

  async evaluateModelForRequest(reference: CompletionModelReference, kind: AlgorithmRequestKind): Promise<CompletionModelEligibility> {
    try {
      requireSettings(this.readSettings(), reference, kind);
      return { eligible: true };
    } catch (error) {
      return error instanceof CompletionConfigurationError
        ? { eligible: false, code: error.code, message: error.message }
        : { eligible: false, code: 'completion-invalid-config', message: 'Completion settings are invalid.' };
    }
  }
}
