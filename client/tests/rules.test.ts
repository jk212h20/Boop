// Client engine rules regression tests — mirrors server/tests/rules.test.ts
// for the LocalGame engine used by the local bot game.
// Run: npm test (from client/)
import { test } from 'node:test';
import assert from 'node:assert';
import {
  createInitialGameState, executeMove, cloneGameState,
} from '../src/bot/LocalGame';
import { applyBotGraduationChoice } from '../src/hooks/useBotGame';
import type { GameState, Piece, PlayerColor } from '../src/types';

const K = (c: PlayerColor): Piece => ({ color: c, type: 'kitten' });
const C = (c: PlayerColor): Piece => ({ color: c, type: 'cat' });

function setup(mutate: (st: GameState) => void): GameState {
  const st = createInitialGameState('Nick', 'Bot');
  mutate(st);
  return st;
}

test('R01: a cat-line win is not consumed by an overlapping graduation', () => {
  const st = setup(s => {
    s.board[3][0] = C('orange'); s.board[3][1] = C('orange'); s.board[3][2] = C('orange');
    s.players.orange!.catsInPool = 1; s.players.orange!.kittensInPool = 5; s.players.orange!.kittensRetired = 3;
  });
  const r = executeMove(st, 3, 3, 'kitten', 'orange');
  assert.equal(r.valid, true);
  assert.equal(r.newState.winner, 'orange');
  assert.equal(r.newState.phase, 'finished');
});

test('R02: a boop that completes the opponent\'s cat line wins for the opponent', () => {
  const st = setup(s => {
    s.players.orange!.catsInPool = 1; s.players.orange!.kittensInPool = 7;
    s.board[2][2] = C('gray');
    s.board[3][4] = C('gray'); s.board[3][5] = C('gray');
  });
  const r = executeMove(st, 1, 1, 'cat', 'orange');
  assert.equal(r.valid, true);
  assert.equal(r.newState.winner, 'gray');
});

test('R03: all-8-on-board graduation offers every kitten as a choice', () => {
  const st = setup(s => {
    s.players.orange!.kittensInPool = 1;
    s.board[0][0] = K('orange'); s.board[2][2] = K('orange'); s.board[2][5] = K('orange');
    s.board[4][0] = C('orange'); s.board[4][2] = C('orange');
    s.board[5][3] = C('orange'); s.board[5][5] = C('orange');
  });
  const r = executeMove(st, 0, 3, 'kitten', 'orange');
  assert.equal(r.newState.phase, 'selecting_graduation');
  assert.equal(r.newState.pendingGraduationPlayer, 'orange');
  const opts = r.newState.pendingGraduationOptions!;
  assert.equal(opts.length, 4);
  for (const option of opts) assert.equal(option.length, 1);
});

test('R04: a triple plus eight pieces on board offers both activation types', () => {
  const st = setup(s => {
    s.players.orange!.kittensInPool = 1; s.players.orange!.kittensRetired = 4;
    s.board[0][0] = K('orange'); s.board[0][1] = K('orange');
    s.board[2][2] = C('orange'); s.board[2][5] = C('orange');
    s.board[4][0] = C('orange'); s.board[4][2] = C('orange'); s.board[5][3] = C('orange');
  });
  const r = executeMove(st, 0, 2, 'kitten', 'orange');
  const opts = r.newState.pendingGraduationOptions!;
  assert.ok(opts.some(o => o.length === 3));
  assert.ok(opts.some(o => o.length === 1));
});

test('line of two: gapped pair protected; adjacent pair protected; free push works', () => {
  const gap = setup(s => { s.board[2][0] = K('gray'); s.board[2][2] = K('gray'); });
  const rGap = executeMove(gap, 2, 3, 'kitten', 'orange');
  assert.equal(rGap.newState.boopedPieces.length, 0);

  const pair = setup(s => { s.board[2][1] = K('gray'); s.board[2][2] = K('gray'); });
  const rPair = executeMove(pair, 2, 3, 'kitten', 'orange');
  assert.equal(rPair.newState.boopedPieces.length, 0);

  const free = setup(s => { s.board[2][2] = K('gray'); });
  const rFree = executeMove(free, 2, 3, 'kitten', 'orange');
  assert.equal(rFree.newState.boopedPieces.length, 1);
  assert.deepEqual(rFree.newState.boopedPieces[0].to, { row: 2, col: 1 });
});

test('cloneGameState preserves pending graduation selection', () => {
  const st = createInitialGameState('Nick', 'Bot');
  st.phase = 'selecting_graduation';
  st.pendingGraduationPlayer = 'gray';
  st.pendingGraduationOptions = [[{ row: 0, col: 0 }]];
  const clone = cloneGameState(st);
  assert.deepEqual(clone.pendingGraduationOptions, st.pendingGraduationOptions);
  assert.equal(clone.pendingGraduationPlayer, 'gray');
});

test('V01/V02: invalid piece types and fractional coordinates are rejected', () => {
  const st = createInitialGameState('Nick', 'Bot');
  assert.equal(executeMove(st, 2, 2, 'dragon' as any, 'orange').valid, false);
  assert.equal(executeMove(st, 1.5, 2, 'kitten', 'orange').valid, false);
});

test('B01: bot graduation resolver resolves the pending selection', () => {
  const st = createInitialGameState('Nick', 'Bot');
  st.phase = 'selecting_graduation';
  st.pendingGraduationPlayer = 'gray';
  st.currentTurn = 'gray';
  st.pendingGraduationOptions = [
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    [{ row: 5, col: 5 }],
  ];
  st.board[0][0] = K('gray'); st.board[0][1] = K('gray'); st.board[0][2] = K('gray');
  st.board[5][5] = K('gray');

  const resolved = applyBotGraduationChoice(st, 'gray');
  assert.equal(resolved.phase, 'playing');
  assert.equal(resolved.currentTurn, 'orange');
  assert.equal(resolved.graduatedPieces.length, 3);
  assert.equal(resolved.pendingGraduationOptions, undefined);
  assert.equal(resolved.players.gray!.catsInPool, 3);
});
