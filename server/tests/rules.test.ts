// Server engine rules regression tests — counterexamples from the rules audit
// (docs/AUDIT.md R01–R04, V01–V03 and the "two pieces in a line" reading).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { BoopGame } from '../src/game/GameState';
import { Piece, PlayerColor } from '../src/game/types';

const K = (c: PlayerColor): Piece => ({ color: c, type: 'kitten' });
const C = (c: PlayerColor): Piece => ({ color: c, type: 'cat' });

function freshGame() {
  const g = new BoopGame();
  (g as any).addPlayer('o', 'orange', 'tok-o');
  (g as any).addPlayer('g', 'gray', 'tok-g');
  (g as any).phase = 'playing';
  return {
    g,
    board: (g as any).board as (Piece | null)[][],
    orange: (g as any).players.orange,
    gray: (g as any).players.gray,
  };
}

test('R01: a cat-line win is not consumed by an overlapping graduation', () => {
  const { g, board, orange } = freshGame();
  board[3][0] = C('orange'); board[3][1] = C('orange'); board[3][2] = C('orange');
  orange.catsInPool = 1; orange.kittensInPool = 5; orange.kittensRetired = 3;
  const res = (g as any).placePiece('o', 3, 3, 'kitten'); // makes C C C K
  assert.equal(res.valid, true);
  assert.equal(res.winner, 'orange');
  assert.equal(res.winCondition, 'three_cats_in_row');
});

test('R02: a boop that completes the opponent\'s cat line wins for the opponent', () => {
  const { g, board, orange } = freshGame();
  orange.catsInPool = 1; orange.kittensInPool = 7;
  board[2][2] = C('gray');
  board[3][4] = C('gray'); board[3][5] = C('gray');
  // Orange cat at (1,1) pushes the gray cat (2,2) to (3,3): gray line completes.
  const res = (g as any).placePiece('o', 1, 1, 'cat');
  assert.equal(res.valid, true);
  assert.equal(res.winner, 'gray');
  assert.equal(res.winCondition, 'three_cats_in_row');
});

test('R03: all-8-on-board graduation offers every kitten as a choice', () => {
  const { g, board, orange } = freshGame();
  orange.kittensInPool = 1; orange.catsInPool = 0; orange.kittensRetired = 3;
  board[0][0] = K('orange'); board[2][2] = K('orange'); board[2][5] = K('orange');
  board[4][0] = C('orange'); board[4][2] = C('orange');
  board[5][3] = C('orange'); board[5][5] = C('orange');
  const res = (g as any).placePiece('o', 0, 3, 'kitten'); // 8 pieces, no line
  assert.equal(res.requiresGraduationChoice, true);
  assert.equal(res.pendingGraduationOptions.length, 4);
  for (const option of res.pendingGraduationOptions) {
    assert.equal(option.length, 1);
  }
  const sel = (g as any).selectGraduation('o', 2);
  assert.equal(sel.valid, true);
  assert.equal(sel.newCatsEarned, 1);
  assert.equal(orange.catsInPool, 1);
  assert.equal((g as any).currentTurn, 'gray');
});

test('R04: a triple plus eight pieces on board offers both activation types', () => {
  const { g, board, orange } = freshGame();
  orange.kittensInPool = 1; orange.kittensRetired = 4;
  board[0][0] = K('orange'); board[0][1] = K('orange');
  board[2][2] = C('orange'); board[2][5] = C('orange');
  board[4][0] = C('orange'); board[4][2] = C('orange'); board[5][3] = C('orange');
  const res = (g as any).placePiece('o', 0, 2, 'kitten'); // completes triple + 8th piece
  assert.equal(res.requiresGraduationChoice, true);
  assert.ok(res.pendingGraduationOptions.some((o: { length: number }) => o.length === 3));
  assert.ok(res.pendingGraduationOptions.some((o: { length: number }) => o.length === 1));
});

test('line of two: a gapped pair moves into its empty destination', () => {
  const { g, board } = freshGame();
  board[2][0] = K('gray'); board[2][2] = K('gray');
  const res = (g as any).placePiece('o', 2, 3, 'kitten');
  assert.equal(res.boopedPieces.length, 1);
  assert.deepEqual(res.boopedPieces[0].to, { row: 2, col: 1 });
});

test('line of two: both ends of an adjacent pair are protected', () => {
  const a = freshGame();
  a.board[2][1] = K('gray'); a.board[2][2] = K('gray');
  const r1 = (a.g as any).placePiece('o', 2, 3, 'kitten');
  const b = freshGame();
  b.board[2][1] = K('gray'); b.board[2][2] = K('gray');
  const r2 = (b.g as any).placePiece('o', 2, 0, 'kitten');
  assert.equal(r1.boopedPieces.length, 0);
  assert.equal(r2.boopedPieces.length, 0);
});

test('line of two: playing into the gap still pushes both pieces apart', () => {
  const { g, board } = freshGame();
  board[2][0] = K('gray'); board[2][2] = K('gray');
  const res = (g as any).placePiece('o', 2, 1, 'kitten');
  assert.equal(res.boopedPieces.length, 2);
});

test('ordinary boop of an unprotected piece still works', () => {
  const { g, board } = freshGame();
  board[2][2] = K('gray');
  const res = (g as any).placePiece('o', 2, 3, 'kitten');
  assert.equal(res.boopedPieces.length, 1);
  assert.deepEqual(res.boopedPieces[0].to, { row: 2, col: 1 });
});

test('V01/V02: invalid piece types and fractional coordinates are rejected', () => {
  const { g } = freshGame();
  assert.equal((g as any).placePiece('o', 2, 2, 'dragon').valid, false);
  assert.equal((g as any).placePiece('o', 1.5, 2, 'kitten').valid, false);
  assert.equal((g as any).placePiece('o', 2, Number.NaN, 'kitten').valid, false);
});

test('V03: non-integer graduation indices are rejected', () => {
  const { g } = freshGame();
  (g as any).phase = 'selecting_graduation';
  (g as any).pendingGraduationPlayer = 'orange';
  (g as any).pendingGraduationOptions = [[{ row: 0, col: 0 }]];
  assert.equal((g as any).selectGraduation('o', 0.5).valid, false);
  assert.equal((g as any).selectGraduation('o', Number.NaN).valid, false);
});

test('own and opponent kittens both boop despite a distant piece', () => {
  const { g, board } = freshGame();
  board[2][1] = K('orange'); board[2][3] = K('gray'); board[2][5] = K('gray');
  const res = (g as any).placePiece('o', 2, 2, 'kitten');
  assert.equal(res.boopedPieces.length, 2);
  assert.deepEqual(board[2][0], K('orange'));
  assert.deepEqual(board[2][4], K('gray'));
  assert.deepEqual(board[2][5], K('gray'));
});

test('R05: a boop that lines up the opponent\'s kittens graduates them for their owner', () => {
  const { g, board, orange } = freshGame();
  (g as any).currentTurn = 'gray';
  board[3][0] = K('orange'); board[3][1] = K('orange'); board[3][3] = K('orange');
  // Gray plays (3,4): the kitten at (3,3) is pushed to (3,2) -> orange 3-line.
  const res = (g as any).placePiece('g', 3, 4, 'kitten');
  assert.equal(res.valid, true);
  assert.equal(res.winner, null, 'graduation is not a win');
  assert.equal(res.graduatedPieces.length, 3);
  assert.equal(orange.kittensRetired, 3);
  assert.equal(orange.catsInPool, 3);
  assert.equal(board[3][0], null);
  assert.equal(board[3][1], null);
  assert.equal(board[3][2], null);
  assert.equal((g as any).currentTurn, 'orange');
});

test('R06: the booped opponent chooses when their line offers several groups', () => {
  const { g, board, orange } = freshGame();
  (g as any).currentTurn = 'gray';
  board[3][0] = K('orange'); board[3][1] = K('orange');
  board[3][2] = K('orange'); board[3][4] = K('orange');
  // Gray plays (3,5): the kitten at (3,4) is pushed to (3,3) -> orange line of 4.
  const res = (g as any).placePiece('g', 3, 5, 'kitten');
  assert.equal(res.valid, true);
  assert.equal(res.requiresGraduationChoice, true);
  assert.equal(res.pendingGraduationOptions.length, 2);
  assert.equal((g as any).pendingGraduationPlayer, 'orange');
  assert.equal((g as any).currentTurn, 'gray', 'turn is held until the choice');

  const sel = (g as any).selectGraduation('o', 0);
  assert.equal(sel.valid, true);
  assert.equal(sel.newCatsEarned, 3);
  assert.equal(orange.catsInPool, 3);
  assert.equal((g as any).currentTurn, 'orange');
});

test('R07: one boop can graduate both players on the post-boop board', () => {
  const { g, board, orange, gray } = freshGame();
  board[0][4] = K('orange'); board[1][4] = K('orange');
  board[2][0] = K('gray'); board[2][1] = K('gray'); board[2][3] = K('gray');
  // Orange plays (2,4): completes an orange column AND pushes the gray
  // kitten at (2,3) to (2,2), completing a gray line.
  const res = (g as any).placePiece('o', 2, 4, 'kitten');
  assert.equal(res.valid, true);
  assert.equal(res.winner, null);
  assert.equal(res.graduatedPieces.length, 6);
  assert.equal(orange.catsInPool, 3);
  assert.equal(gray.catsInPool, 3);
  assert.equal((g as any).currentTurn, 'gray');
});
