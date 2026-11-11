import * as vscode from 'vscode';
import { t } from '../i18n';
import type { CompletionManager } from './manager';
import { readCompletionConnectionSettings } from './vscode-configuration';

export class CompletionStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'unifyChatProvider.completion',
    vscode.StatusBarAlignment.Right,
    100,
  );
  private readonly subscription: vscode.Disposable;
  private readonly command: vscode.Command;
  private state = { text: '', tooltip: '' };

  constructor(private readonly manager: CompletionManager, extensionId: string) {
    this.command = {
      command: 'workbench.action.openSettings',
      title: t('Open Autocomplete Settings'),
      arguments: [`@ext:${extensionId}`],
    };
    this.item.name = 'DeepSeek Autocomplete';
    this.item.command = this.command;
    this.subscription = manager.onDidChangeState(() => this.update());
    this.update();
    this.item.show();
  }

  getState() {
    return { ...this.state, command: { ...this.command, arguments: [...(this.command.arguments ?? [])] } };
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private update(): void {
    const settings = readCompletionConnectionSettings();
    const manager = this.manager.getState();
    let icon = 'sparkle';
    let tooltip = t('Autocomplete ({0})\nAlgorithm: copilot-replica\nClick to open extension settings.', settings.configuration.model);
    if (!manager.enabled) {
      icon = 'circle-slash';
      tooltip = t('Autocomplete is disabled. Click to open extension settings.');
    } else if (settings.status !== 'ready') {
      icon = 'alert';
      tooltip = settings.status === 'invalid'
        ? t('Autocomplete configuration is invalid: {0}', settings.error ?? '')
        : t('Set an API base URL and model in the extension settings to enable autocomplete.');
    } else if (manager.busy) {
      icon = 'loading~spin';
      tooltip = t('Generating an autocomplete suggestion...');
    } else if (settings.configuration.nes.enabled && !manager.nextEditAvailable) {
      tooltip += '\n' + t('Next-edit suggestions require the inlineCompletionsAdditions Proposed API; ordinary autocomplete remains available.');
    }
    // Icon-only item: sparkle = ready, circle-slash = disabled, alert = misconfigured, spinner = generating.
    this.state = { text: `$(${icon})`, tooltip: `DeepSeek Autocomplete\n${tooltip}` };
    this.item.text = this.state.text;
    this.item.tooltip = this.state.tooltip;
  }
}
