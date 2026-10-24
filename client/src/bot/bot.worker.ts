import { createBot } from './BotAI';
import { executeMove, resolveGraduationChoice } from './LocalGame';
import { BotRequest, BotReply } from './workerProtocol';

self.onmessage = ({ data }: MessageEvent<BotRequest>) => {
  const bot = createBot(data.color, data.config);
  let state = data.state;
  // Each decision has the same frozen node allowance. A reply can include
  // pending choices plus a placement; none is weakened by elapsed wall time.
  const settle = () => {
    while (state.phase === 'selecting_graduation' && state.pendingGraduationPlayer === data.color) {
      const choice = bot.findBestGraduation(state);
      const result = resolveGraduationChoice(state, choice);
      if (!result.valid) throw new Error(result.error);
      state = result.newState;
    }
  };
  try {
    settle();
    if (state.phase === 'playing' && state.currentTurn === data.color) {
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
