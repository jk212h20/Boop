import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/experimental/ThreatBot';
import { createInitialGameState, executeMove, getAllValidMoves, resolveGraduationChoice } from '../src/bot/LocalGame';
import { GameState } from '../src/types';

function cats(): GameState {
  const s = createInitialGameState();
  s.currentTurn = 'gray';
  for (const color of ['orange', 'gray'] as const) {
    s.players[color]!.kittensInPool = 0;
    s.players[color]!.catsInPool = 8;
  }
  return s;
}
function put(s: GameState, color: 'orange' | 'gray', row: number, col: number) {
  s.board[row][col] = { type: 'cat', color };
  s.players[color]!.catsInPool--;
}
const config = { searchDepth: 2, timeBudgetMs: 850, silent: true };

test('takes a cat-line win and leaves input unchanged', () => {
  const s = cats(); put(s, 'gray', 2, 2); put(s, 'gray', 2, 3);
  const before = JSON.stringify(s);
  const move = createBot('gray', config).findBestMove(s)!;
  const next = executeMove(s, move.row, move.col, move.pieceType, 'gray').newState;
  assert.equal(next.winner, 'gray');
  assert.equal(JSON.stringify(s), before);
});

test('blocks an immediate win instead of blindly prioritizing promotion', () => {
  const s = cats(); put(s, 'orange', 2, 2); put(s, 'orange', 2, 3);
  const move = createBot('gray', config).findBestMove(s)!;
  const next = executeMove(s, move.row, move.col, move.pieceType, 'gray').newState;
  assert.notEqual(next.winner, 'orange');
  for (const reply of getAllValidMoves(next, 'orange')) {
    const after = executeMove(next, reply.row, reply.col, reply.pieceType, 'orange').newState;
    assert.notEqual(after.winner, 'orange', `winning reply ${JSON.stringify(reply)}`);
  }
});

test('does not boop the opponent into victory', () => {
  const s = cats(); put(s, 'orange', 2, 1); put(s, 'orange', 2, 2); put(s, 'orange', 1, 3);
  const move = createBot('gray', config).findBestMove(s)!;
  assert.notEqual(executeMove(s, move.row, move.col, move.pieceType, 'gray').newState.winner, 'orange');
});

test('takes the all-eight-cats win', () => {
  const s = cats();
  for (const [r, c] of [[0,0],[0,2],[0,4],[2,0],[2,4],[4,0],[4,2]]) put(s,'gray',r,c);
  const move = createBot('gray', config).findBestMove(s)!;
  assert.equal(executeMove(s, move.row, move.col, move.pieceType, 'gray').newState.winner, 'gray');
});

test('searches graduation options and accounts for their owner', () => {
  const s = createInitialGameState(); s.currentTurn = 'gray';
  s.phase = 'selecting_graduation'; s.pendingGraduationPlayer = 'gray';
  s.board[0][0] = { color: 'gray', type: 'kitten' };
  s.board[2][2] = { color: 'gray', type: 'cat' };
  s.players.gray!.kittensInPool = 0; s.players.gray!.catsInPool = 0;
  s.pendingGraduationOptions = [[{ row: 2, col: 2 }], [{ row: 0, col: 0 }]];
  const choice = createBot('gray', { ...config, searchDepth: 1 }).findBestGraduation(s);
  assert.equal(choice, 1); // gain a permanent cat instead of recycling an existing one
  assert.equal(resolveGraduationChoice(s, choice).valid, true);
});

test('tiny fixed work budget returns a legal move without incomplete iteration or state mutation', () => {
  const s = createInitialGameState(); s.currentTurn = 'gray';
  const bot = createBot('gray', { searchDepth: 50, nodeBudget: 1, timeBudgetMs: 1 });
  const move = bot.findBestMove(s)!;
  assert.equal(executeMove(s, move.row, move.col, move.pieceType, 'gray').valid, true);
  assert.equal(bot.getStats().nodes, 1);
});

test('ignores finished positions and wrong turns', () => {
  const s = createInitialGameState(); const bot = createBot('gray');
  assert.equal(bot.findBestMove(s), null);
  s.currentTurn = 'gray'; s.phase = 'finished'; s.winner = 'orange';
  assert.equal(bot.findBestMove(s), null);
});
