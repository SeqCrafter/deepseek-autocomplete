export interface CompletionChoice {
  readonly text: string;
  readonly finishReason?: string;
}

export interface BufferedCompletionResponse {
  readonly mode: 'buffered';
  readonly choices: readonly CompletionChoice[];
  readonly usage?: unknown;
}

export interface StreamingCompletionResponse {
  readonly mode: 'streaming';
  readonly text: AsyncIterable<string>;
}

export interface CopilotReplicaAlgorithmFimResponse {
  readonly kind: 'copilot-replica/fim';
  readonly text: string;
  readonly finishReason?: string;
  readonly usage?: unknown;
  readonly choices?: readonly CompletionChoice[];
}

export interface CopilotReplicaAlgorithmNesResponse {
  readonly kind: 'copilot-replica/nes';
  readonly text: AsyncIterable<string>;
}

export interface CopilotReplicaAlgorithmCursorPredictionResponse {
  readonly kind: 'copilot-replica/cursor-prediction';
  readonly text: AsyncIterable<string>;
}

export interface AlgorithmResponseMap {
  readonly 'copilot-replica/fim': CopilotReplicaAlgorithmFimResponse;
  readonly 'copilot-replica/nes': CopilotReplicaAlgorithmNesResponse;
  readonly 'copilot-replica/cursor-prediction': CopilotReplicaAlgorithmCursorPredictionResponse;
}

export interface CompletionResponseMap {
  readonly fim: BufferedCompletionResponse;
  readonly codegemma: BufferedCompletionResponse;
  readonly 'qwen2.5-coder': BufferedCompletionResponse;
  readonly 'copilot-replica-nes': StreamingCompletionResponse;
}

export type AlgorithmResponse = AlgorithmResponseMap[keyof AlgorithmResponseMap];
export type CompletionResponse = CompletionResponseMap[keyof CompletionResponseMap];
