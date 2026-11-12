import * as vscode from 'vscode';

export interface UsageStatsSnapshot {
  /** Requests actually sent to the API. */
  readonly requests: number;
  /** Suggestions served from the local cache or from text already typed. */
  readonly cacheHits: number;
  /** Requests avoided because the user kept typing during the debounce window. */
  readonly debounced: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

function readCount(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Session-scoped counters shown in the status bar tooltip. */
export class UsageStats implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private state: UsageStatsSnapshot = emptySnapshot();
  readonly onDidChange = this.emitter.event;

  getSnapshot(): UsageStatsSnapshot {
    return this.state;
  }

  recordRequest(): void {
    this.update({ requests: this.state.requests + 1 });
  }

  recordCacheHit(): void {
    this.update({ cacheHits: this.state.cacheHits + 1 });
  }

  recordDebounced(): void {
    this.update({ debounced: this.state.debounced + 1 });
  }

  /** Accepts the OpenAI-style `usage` object; unknown shapes are ignored. */
  recordUsage(usage: unknown): void {
    if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return;
    const record = usage as Readonly<Record<string, unknown>>;
    const prompt = readCount(record, 'prompt_tokens');
    const completion = readCount(record, 'completion_tokens');
    if (prompt === 0 && completion === 0) return;
    this.update({
      promptTokens: this.state.promptTokens + prompt,
      completionTokens: this.state.completionTokens + completion,
    });
  }

  reset(): void {
    this.state = emptySnapshot();
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private update(patch: Partial<UsageStatsSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.emitter.fire();
  }
}

function emptySnapshot(): UsageStatsSnapshot {
  return { requests: 0, cacheHits: 0, debounced: 0, promptTokens: 0, completionTokens: 0 };
}

export const usageStats = new UsageStats();
