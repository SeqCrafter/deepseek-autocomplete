import * as vscode from 'vscode';

let channel: vscode.LogOutputChannel | undefined;

function getChannel(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel('DeepSeek Autocomplete', { log: true });
  return channel;
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}

export const authLog = {
  verbose(context: string, message: string): void {
    if (vscode.workspace.getConfiguration('unifyChatProvider').get<boolean>('verbose', false)) {
      getChannel().debug(`[${context}] ${message}`);
    }
  },
  error(context: string, message: string, _error?: unknown): void {
    // Provider errors can contain echoed credentials or source-code prompts.
    getChannel().error(`[${context}] ${message}`);
  },
  warn(context: string, message: string): void {
    getChannel().warn(`[${context}] ${message}`);
  },
};
