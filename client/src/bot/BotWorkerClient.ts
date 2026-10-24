import { GameState, PlayerColor } from '../types';
import { BotConfig, DEFAULT_BOT_CONFIG } from './types';
import { BotReply, BotRequest } from './workerProtocol';

/** A slow worker is still the same opponent. No time watchdog may substitute
 * a weaker move. Failure is visible/retryable, cancellation is explicit. */
export class BotWorkerClient {
  private worker: Worker | null = null;
  private cancelPending: (() => void) | null = null;
  readonly config: BotConfig;
  constructor(private color: PlayerColor, config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_BOT_CONFIG, ...config };
    try { this.worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' }); }
    catch { /* report concretely on submission, never silently weaken */ }
  }
  dispose() { this.cancelPending?.(); this.worker?.terminate(); this.worker = null; }
  play(state: GameState): Promise<GameState | null> {
    if (!this.worker) return Promise.reject(new Error('Bot worker unavailable. Reload to retry; no substitute move was played.'));
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (result: GameState | null, error?: Error) => {
        if (done) return;
        done = true; this.cancelPending = null;
        if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; }
        if (error) reject(error); else resolve(result);
      };
      this.cancelPending = () => finish(null);
      this.worker!.onmessage = ({ data }: MessageEvent<BotReply>) => {
        if ('error' in data) finish(null, new Error(data.error)); else finish(data.state);
      };
      this.worker!.onerror = event => { event.preventDefault(); finish(null, new Error(event.message || 'Bot worker failed; no move was played.')); };
      try { this.worker!.postMessage({ state, color: this.color, config: this.config } satisfies BotRequest); }
      catch (error) { finish(null, error instanceof Error ? error : new Error(String(error))); }
    });
  }
}
