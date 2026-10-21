import { GameState, PlayerColor } from '../types';
import { BotConfig, DEFAULT_BOT_CONFIG } from './types';
import { BotReply, BotRequest } from './workerProtocol';
import { executeMove, getAllValidMoves, resolveGraduationChoice } from './LocalGame';

// Warm the worker when the game starts, not during the first timed turn.
export class BotWorkerClient {
  private worker: Worker | null;
  private cancelPending: (() => void) | null = null;
  readonly config: BotConfig;
  constructor(private color: PlayerColor, config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_BOT_CONFIG, ...config };
    try { this.worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' }); }
    catch { this.worker = null; }
  }
  dispose() { this.cancelPending?.(); this.worker?.terminate(); this.worker = null; }
  play(state: GameState): Promise<GameState | null> {
    return new Promise(resolve => {
      let done = false;
      const finish = (result: GameState | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.cancelPending = null;
        if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; }
        resolve(result);
      };
      const fallback = (reason: string) => {
        console.warn('[Bot] Worker unavailable; using legal fallback:', reason);
        this.worker?.terminate(); this.worker = null;
        let result = state;
        const settle = () => {
          while (result.phase === 'selecting_graduation' && result.pendingGraduationPlayer === this.color) {
            const resolved = resolveGraduationChoice(result, 0);
            if (!resolved.valid) break;
            result = resolved.newState;
          }
        };
        settle();
        if (result.phase === 'playing' && result.currentTurn === this.color) {
          const move = getAllValidMoves(result, this.color)[0];
          if (move) result = executeMove(result, move.row, move.col, move.pieceType, this.color).newState;
          settle();
        }
        finish(result);
      };
      const timer = setTimeout(() => fallback('one-second deadline exceeded'), 950);
      this.cancelPending = () => finish(null);
      if (!this.worker) { fallback('worker could not start'); return; }
      this.worker.onmessage = ({ data }: MessageEvent<BotReply>) => {
        if ('error' in data) fallback(data.error); else finish(data.state);
      };
      this.worker.onerror = event => { event.preventDefault(); fallback(event.message); };
      try { this.worker.postMessage({ state, color: this.color, config: this.config } satisfies BotRequest); }
      catch (error) { fallback(String(error)); }
    });
  }
}
