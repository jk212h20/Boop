import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/BotAI';
import { createBot as candidate } from '../src/bot/experimental/PvsBot';
import { corpus } from '../tools/botRepro';
import { executeMove, resolveGraduationChoice } from '../src/bot/LocalGame';

// PVS is an exact alpha-beta optimization, not a pruning approximation. At a
// fully completed fixed depth it must preserve minimax value (ties may differ).
test('PVS preserves full-width minimax scores and input across saved positions', () => {
  for (const {name,state} of corpus()) {
    const color = state.pendingGraduationPlayer ?? state.currentTurn;
    const before = JSON.stringify(state);
    const config = { searchDepth: 2, nodeBudget: 1000000, silent: true };
    const a = createBot(color, config), b = candidate(color, config);
    const selecting = state.phase === 'selecting_graduation';
    const act = (bot: typeof a) => selecting ? bot.findBestGraduation(state) : bot.findBestMove(state);
    const aa = act(a), bb = act(b as unknown as typeof a);
    const next = (action: ReturnType<typeof act>) => selecting ? resolveGraduationChoice(state, action as number).newState :
      executeMove(state, (action as any).row, (action as any).col, (action as any).pieceType, color).newState;
    // Internal exact search here deliberately verifies scores rather than tied actions.
    const value = (bot: any, action: ReturnType<typeof act>) => bot.search(next(action), selecting ? 2 : 1, -Infinity, Infinity);
    assert.equal(value(a,aa), value(b,bb), name);
    // Proven terminal wins stop iterative deepening before the depth ceiling.
    assert.ok(a.getStats().completedDepth===2 || Math.abs(value(a,aa))===100000,name);
    assert.ok(b.getStats().completedDepth===2 || Math.abs(value(b,bb))===100000,name);
    assert.equal(JSON.stringify(state),before,name);
  }
});

test('PVS fixed-work decisions repeat after cache reuse and respect allowance', () => {
  for (const {state} of corpus().slice(0,8)) {
    const bot = candidate(state.pendingGraduationPlayer ?? state.currentTurn);
    const act = () => state.phase === 'selecting_graduation' ? bot.findBestGraduation(state) : bot.findBestMove(state);
    const a=act(),stats=bot.getStats(),b=act();
    assert.deepEqual(a,b);
    assert.equal(stats.nodes,bot.getStats().nodes);
    assert.ok(stats.nodes<=30000);
  }
});
