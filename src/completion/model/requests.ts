export type CompletionTemplate = 'fim' | 'codegemma' | 'qwen2.5-coder' | 'copilot-replica-nes';
export type CompletionTemplates = 'all' | readonly CompletionTemplate[];

export interface CompletionExecutionOptions {
  readonly candidateCount?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
}

export interface EditAlgorithmSyntaxRange {
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface CompletionSourceContext {
  readonly uri?: string;
  readonly path?: string;
  readonly content: string;
  readonly range?: EditAlgorithmSyntaxRange;
}

export interface CopilotReplicaFimMetadata {
  readonly languageId?: string;
  readonly nextIndent?: number;
  readonly trimByIndentation?: boolean;
  readonly promptTokens?: number;
  readonly suffixTokens?: number;
  readonly codeAnnotations?: boolean;
}

export interface CopilotReplicaAlgorithmFimRequest {
  readonly kind: 'copilot-replica/fim';
  readonly targetPath?: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly contexts: readonly CompletionSourceContext[];
  readonly options: CompletionExecutionOptions;
  readonly metadata?: CopilotReplicaFimMetadata;
}

export interface CompletionChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

export type CopilotReplicaNesResponseFormat =
  | 'codeBlock'
  | 'editWindowOnly'
  | 'unifiedXml'
  | 'editWindowWithEditIntent'
  | 'editWindowWithEditIntentShort';

export type CopilotReplicaResponseFormat =
  | { readonly kind: 'nes'; readonly format: CopilotReplicaNesResponseFormat }
  | { readonly kind: 'cursor-prediction' };

export interface CompletionPrediction {
  readonly type: 'content';
  readonly content: string;
}

export interface CopilotReplicaAlgorithmNesRequest {
  readonly kind: 'copilot-replica/nes';
  readonly messages: readonly CompletionChatMessage[];
  readonly maxTokens?: number;
  readonly prediction?: CompletionPrediction;
  readonly responseFormat: Extract<CopilotReplicaResponseFormat, { readonly kind: 'nes' }>;
}

export interface CopilotReplicaAlgorithmCursorPredictionRequest {
  readonly kind: 'copilot-replica/cursor-prediction';
  readonly messages: readonly CompletionChatMessage[];
  readonly maxTokens?: number;
  readonly responseFormat: Extract<CopilotReplicaResponseFormat, { readonly kind: 'cursor-prediction' }>;
}

export interface FimCompletionRequest {
  readonly kind: 'fim';
  readonly prefix: string;
  readonly suffix: string;
  readonly options: CompletionExecutionOptions;
}

export interface CodeGemmaCompletionContext {
  readonly path?: string;
  readonly content: string;
}

export interface CodeGemmaCompletionRequest {
  readonly kind: 'codegemma';
  readonly targetPath?: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly contexts: readonly CodeGemmaCompletionContext[];
  readonly options: CompletionExecutionOptions;
}

export interface QwenCompletionRequest extends Omit<CodeGemmaCompletionRequest, 'kind'> {
  readonly kind: 'qwen2.5-coder';
}

export interface CopilotReplicaNesCompletionRequest {
  readonly kind: 'copilot-replica-nes';
  readonly messages: readonly CompletionChatMessage[];
  readonly maxTokens?: number;
  readonly prediction?: CompletionPrediction;
  readonly responseFormat: CopilotReplicaResponseFormat;
}

export interface AlgorithmRequestMap {
  readonly 'copilot-replica/fim': CopilotReplicaAlgorithmFimRequest;
  readonly 'copilot-replica/nes': CopilotReplicaAlgorithmNesRequest;
  readonly 'copilot-replica/cursor-prediction': CopilotReplicaAlgorithmCursorPredictionRequest;
}

export interface CompletionRequestMap {
  readonly fim: FimCompletionRequest;
  readonly codegemma: CodeGemmaCompletionRequest;
  readonly 'qwen2.5-coder': QwenCompletionRequest;
  readonly 'copilot-replica-nes': CopilotReplicaNesCompletionRequest;
}

export type AlgorithmRequestKind = keyof AlgorithmRequestMap;
export type CompletionRequestKind = keyof CompletionRequestMap;
export type AlgorithmRequest = AlgorithmRequestMap[AlgorithmRequestKind];
export type CompletionRequest = CompletionRequestMap[CompletionRequestKind];
