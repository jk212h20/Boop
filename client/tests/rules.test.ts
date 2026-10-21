// Client engine rules regression tests — mirrors server/tests/rules.test.ts
// for the LocalGame engine used by the local bot game.
// Run: npm test (from client/)
import { test } from 'node:test';
import assert from 'node:assert';
import {
  createInitialGameState, executeMove, cloneGameState, resolveGraduationChoice,
} from '../src/bot/LocalGame';
import { MEOW_LIMIT, offBoardBoops } from '../src/animationTiming';
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

test('line of two: gapped pair moves; adjacent pair protected; free push works', () => {
  const gap = setup(s => { s.board[2][0] = K('gray'); s.board[2][2] = K('gray'); });
  const rGap = executeMove(gap, 2, 3, 'kitten', 'orange');
  assert.equal(rGap.newState.boopedPieces.length, 1);
  assert.deepEqual(rGap.newState.boopedPieces[0].to, { row: 2, col: 1 });

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

// Early-game reproduction: both adjacent kittens must move, even when a
// distant piece shares the opponent kitten's ray.
for (const own of ['orange', 'gray'] as PlayerColor[]) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1]]) {
    test(`boop is color-neutral with a distant piece: ${own} ray ${dr},${dc}`, () => {
      const opp = own === 'orange' ? 'gray' : 'orange';
      const st = setup(s => {
        s.currentTurn = own;
        s.board[2-dr][2-dc] = K(own);
        s.board[2+dr][2+dc] = K(opp);
        s.board[2+3*dr][2+3*dc] = K(opp);
      });
      const result = executeMove(st, 2, 2, 'kitten', own);
      assert.equal(result.valid, true);
      assert.equal(result.newState.boopedPieces.length, 2);
      assert.deepEqual(result.newState.board[2-2*dr][2-2*dc], K(own));
      assert.deepEqual(result.newState.board[2+2*dr][2+2*dc], K(opp));
      assert.deepEqual(result.newState.board[2+3*dr][2+3*dc], K(opp));
      assert.equal(st.board[2+2*dr][2+2*dc], null, 'input state unchanged');
    });
  }
}

test('R05: a boop that lines up the opponent\'s kittens graduates them for their owner', () => {
  const st = setup(s => {
    s.board[3][0] = K('orange'); s.board[3][1] = K('orange'); s.board[3][3] = K('orange');
    s.currentTurn = 'gray';
  });
  // Gray plays (3,4): the kitten at (3,3) is pushed to (3,2) -> orange 3-line.
  const r = executeMove(st, 3, 4, 'kitten', 'gray');
  assert.equal(r.valid, true);
  assert.equal(r.newState.winner, null);
  assert.equal(r.newState.graduatedPieces.length, 3);
  assert.equal(r.newState.players.orange!.kittensRetired, 3);
  assert.equal(r.newState.players.orange!.catsInPool, 3);
  assert.equal(r.newState.board[3][0], null);
  assert.equal(r.newState.board[3][2], null);
  assert.equal(r.newState.currentTurn, 'orange');
});

test('R06: the booped opponent chooses when their line offers several groups', () => {
  const st = setup(s => {
    s.board[3][0] = K('orange'); s.board[3][1] = K('orange');
    s.board[3][2] = K('orange'); s.board[3][4] = K('orange');
    s.currentTurn = 'gray';
  });
  const r = executeMove(st, 3, 5, 'kitten', 'gray');
  assert.equal(r.newState.phase, 'selecting_graduation');
  assert.equal(r.newState.pendingGraduationPlayer, 'orange');
  assert.equal(r.newState.pendingGraduationOptions!.length, 2);
  assert.equal(r.newState.currentTurn, 'gray', 'turn held until the choice');

  const sel = resolveGraduationChoice(r.newState, 0);
  assert.equal(sel.valid, true);
  assert.equal(sel.newState.players.orange!.catsInPool, 3);
  assert.equal(sel.newState.phase, 'playing');
  assert.equal(sel.newState.currentTurn, 'orange');
});

test('R07: one boop can graduate both players on the post-boop board', () => {
  const st = setup(s => {
    s.board[0][4] = K('orange'); s.board[1][4] = K('orange');
    s.board[2][0] = K('gray'); s.board[2][1] = K('gray'); s.board[2][3] = K('gray');
  });
  const r = executeMove(st, 2, 4, 'kitten', 'orange');
  assert.equal(r.valid, true);
  assert.equal(r.newState.winner, null);
  assert.equal(r.newState.graduatedPieces.length, 6);
  assert.equal(r.newState.players.orange!.catsInPool, 3);
  assert.equal(r.newState.players.gray!.catsInPool, 3);
  assert.equal(r.newState.currentTurn, 'gray');
});

test('R08: a boop-formed line graduates only its owner, with the piece that left', () => {
  const st = setup(s => {
    s.board[3][0] = K('orange'); s.board[3][1] = K('orange'); s.board[3][3] = K('orange');
    s.currentTurn = 'gray';
  });
  // Gray plays (3,4): the orange kitten at (3,3) is pushed into the EMPTY cell
  // (3,2). The client used to fill the animation from the pre-move board, so
  // that cell showed a guessed colour (the promoted group looked mixed).
  const r = executeMove(st, 3, 4, 'kitten', 'gray');
  assert.equal(r.valid, true);
  assert.equal(st.board[3][2], null, 'the cell the boop filled started empty');
  assert.equal(r.newState.graduatedPieces.length, 3);
  for (const cell of r.newState.graduatedPieces) {
    assert.deepEqual(cell.piece, K('orange'));
  }
});

test('R09: both players\' graduations on one move keep their own piece data', () => {
  const st = setup(s => {
    s.board[0][4] = K('orange'); s.board[1][4] = K('orange');
    s.board[2][0] = K('gray'); s.board[2][1] = K('gray'); s.board[2][3] = K('gray');
  });
  const r = executeMove(st, 2, 4, 'kitten', 'orange');
  assert.equal(r.newState.graduatedPieces.length, 6);
  assert.equal(r.newState.graduatedPieces.filter(c => c.piece.color === 'orange').length, 3);
  assert.equal(r.newState.graduatedPieces.filter(c => c.piece.color === 'gray').length, 3);
});

test('R06b: a resolved graduation choice carries its piece data', () => {
  const st = setup(s => {
    s.board[3][0] = K('orange'); s.board[3][1] = K('orange');
    s.board[3][2] = K('orange'); s.board[3][4] = K('orange');
    s.currentTurn = 'gray';
  });
  const r = executeMove(st, 3, 5, 'kitten', 'gray');
  assert.equal(r.newState.phase, 'selecting_graduation');
  const sel = resolveGraduationChoice(r.newState, 0);
  assert.equal(sel.valid, true);
  assert.equal(sel.newState.graduatedPieces.length, 3);
  for (const cell of sel.newState.graduatedPieces) {
    assert.deepEqual(cell.piece, K('orange'));
  }
});

// A meow belongs to the cats that leave the bed. A boop that only slides a
// piece along the quilt must not yowl, and a double boop must not stack up
// into a pile of meows.
test('only boops that push a piece off the bed meow, two at most', () => {
  const off = { from: { row: 0, col: 0 }, to: null };
  const along = { from: { row: 1, col: 1 }, to: { row: 1, col: 2 } };
  assert.deepEqual(offBoardBoops([along]), []);
  assert.deepEqual(offBoardBoops([off, along]), [off]);
  const third = { from: { row: 2, col: 2 }, to: null };
  const fourth = { from: { row: 3, col: 3 }, to: null };
  assert.deepEqual(offBoardBoops([off, third, fourth]), [off, third]);
  assert.equal(MEOW_LIMIT, 2);
});
