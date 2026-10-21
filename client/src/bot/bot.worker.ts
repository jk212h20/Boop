import { createBot } from './BotAI';
import { executeMove, resolveGraduationChoice } from './LocalGame';
import { BotRequest, BotReply } from './workerProtocol';

self.onmessage = ({ data }: MessageEvent<BotRequest>) => {
  const start = performance.now();
  const bot = createBot(data.color, data.config);
  let state = data.state;
  const settle = () => {
    while (state.phase === 'selecting_graduation' && state.pendingGraduationPlayer === data.color) {
      bot.setConfig({ timeBudgetMs: Math.max(1, data.config.timeBudgetMs - (performance.now() - start)) });
      const choice = bot.findBestGraduation(state);
      const result = resolveGraduationChoice(state, choice);
      if (!result.valid) throw new Error(result.error);
      state = result.newState;
    }
  };
  try {
    settle();
    if (state.phase === 'playing' && state.currentTurn === data.color) {
      bot.setConfig({ timeBudgetMs: Math.max(1, data.config.timeBudgetMs - (performance.now() - start)) });
      const move = bot.findBestMove(state);
      if (!move) throw new Error('No legal bot move');
      const result = executeMove(state, move.row, move.col, move.pieceType, data.color);
      if (!result.valid) throw new Error(result.error);
      state = result.newState;
      settle();
    }
    self.postMessage({ state, stats: bot.getStats() } satisfies BotReply);
  } catch (error) {
    self.postMessage({ error: String(error) } satisfies BotReply);
  }
};
