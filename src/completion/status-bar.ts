import * as vscode from 'vscode';
import { t } from '../i18n';
import type { CompletionManager } from './manager';
import { usageStats } from './stats';
import { readCompletionConnectionSettings } from './vscode-configuration';

export class CompletionStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'deepseekAutocomplete.completion',
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
    this.item.name = 'Dspilot';
    this.item.command = this.command;
    this.subscription = vscode.Disposable.from(
      manager.onDidChangeState(() => this.update()),
      usageStats.onDidChange(() => this.update()),
    );
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
    if (!manager.enabled) {
      icon = 'circle-slash';
    } else if (settings.status !== 'ready') {
      icon = 'alert';
    } else if (manager.busy) {
      icon = 'loading~spin';
    }
    // Icon-only item: sparkle = ready, circle-slash = disabled, alert = misconfigured, spinner = generating.
    // The tooltip only shows this session's usage statistics.
    this.state = { text: `$(${icon})`, tooltip: this.formatStats() };
    this.item.text = this.state.text;
    this.item.tooltip = this.state.tooltip;
  }

  private formatStats(): string {
    const stats = usageStats.getSnapshot();
    const format = (value: number) => value.toLocaleString();
    return [
      t('Dspilot usage (this session)'),
      t('Requests sent: {0}', format(stats.requests)),
      t('Cache hits: {0}', format(stats.cacheHits)),
      t('Requests saved by debounce: {0}', format(stats.debounced)),
      t('Prompt tokens: {0}', format(stats.promptTokens)),
      t('Completion tokens: {0}', format(stats.completionTokens)),
    ].join('\n');
  }
}
