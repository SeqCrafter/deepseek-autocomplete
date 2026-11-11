import * as vscode from 'vscode';
import { CompletionManager } from './completion/manager';
import { ConfiguredCompletionModelResolver } from './completion/model/resolver';
import { CompletionStatusBar } from './completion/status-bar';
import type { CompletionModelResolver } from './completion/types';
import {
  contextProviderApiV1,
  registerDefaultCopilotContextProviders,
} from './completion/copilot/default-context-providers';
import type { CopilotContextProvider } from './completion/copilot/context-provider';
import { readProposedApiManifestSnapshot, type ProposedApiManifestSnapshot } from './proposed-api/manifest';
import { disposeLogger } from './logger';

export interface UnifyChatProviderExtensionApi {
  getContextProviderAPI(version: 'v1'): {
    registerContextProvider(provider: CopilotContextProvider): vscode.Disposable;
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<UnifyChatProviderExtensionApi> {
  const proposals: ProposedApiManifestSnapshot = await readProposedApiManifestSnapshot(context).catch(() => ({
    declared: ['inlineCompletionsAdditions'],
    enabled: [],
  }));
  const nextEditAvailable = proposals.enabled.includes('inlineCompletionsAdditions');
  const productionResolver = new ConfiguredCompletionModelResolver();
  const modelResolver: CompletionModelResolver = productionResolver;

  const completionManager = new CompletionManager(modelResolver, undefined, nextEditAvailable);
  const statusBar = new CompletionStatusBar(completionManager, context.extension.id);
  context.subscriptions.push(
    registerDefaultCopilotContextProviders(),
    completionManager,
    statusBar,
    new vscode.Disposable(disposeLogger),
  );

  return {
    getContextProviderAPI(version) {
      if (version !== 'v1') throw new Error(`Unsupported context provider API version: ${version}`);
      return contextProviderApiV1();
    },
  };
}

export function deactivate(): void {
  disposeLogger();
}
