import type { CompletionAlgorithmDefinition } from './types';
import { CompletionAlgorithmRegistry } from './registry';
import { copilotReplicaAlgorithmDefinition } from './copilot/algorithm';

export const COMPLETION_ALGORITHM_DEFINITIONS: readonly CompletionAlgorithmDefinition[] =
  [
    copilotReplicaAlgorithmDefinition,
  ];

export const completionAlgorithmRegistry = new CompletionAlgorithmRegistry(
  COMPLETION_ALGORITHM_DEFINITIONS,
);
