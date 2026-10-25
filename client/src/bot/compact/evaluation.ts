// Numeric port of frozen v4 evaluation; arithmetic/order deliberately preserved.
import { CompactState, owner } from './CompactGame';
import { BotConfig } from '../types';

// Only actual three-cell windows count: a two-cell edge diagonal has no
// completion square and never enters this list. Build once, not at every leaf.
export const LINE_WINDOWS: readonly (readonly number[])[] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      if (r + dr * 2 < 0 || r + dr * 2 > 5 || c + dc * 2 < 0 || c + dc * 2 > 5) continue;
      lines.push([r * 6 + c, (r + dr) * 6 + c + dc, (r + dr * 2) * 6 + c + dc * 2]);
    }
  }
  return lines;
})();
const square = (board: Uint8Array, index: number) => board[index];

/** Can placing this type in the gap preserve a member of the pair?
 * An adjacent piece stays if it is a cat facing a kitten, or if its push
 * destination is occupied (by EITHER colour). Off-board destinations are NOT
 * blockers. This is the live rule, not ordinary tic-tac-toe line counting. */
function stays(board: Uint8Array, member: number, missing: number, kitten: boolean): boolean {
  const p = square(board, member)!;
  if (kitten && !(p & 1)) return true;
  const r = Math.floor(member / 6), c = member % 6;
  const dr = r - Math.floor(missing / 6), dc = c - missing % 6;
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return true;
  const tr = r + dr, tc = c + dc;
  return tr >= 0 && tr < 6 && tc >= 0 && tc < 6 && board[tr * 6 + tc] !== 0;
}

export interface PairValue {
  score: number;
  winningSquares: number;
  promotionSquares: number;
  adjacent: number;
  gapped: number;
  unplayable: number;
}

/** Exported breakdown for differential tests; this backend is experimental. */
export function pairValue(state: CompactState, color: number, config: BotConfig): PairValue {
  const board = state.board;
  const kittenPool = state.stock[color * 3], catPool = state.stock[color * 3 + 1];
  let score = 0, adjacent = 0, gapped = 0, unplayable = 0;
  // Bitsets are safe here using two 18-cell halves; no Set allocations per leaf.
  let winsLow = 0, winsHigh = 0, promotionsLow = 0, promotionsHigh = 0;
  for (const line of LINE_WINDOWS) {
    let count = 0, cats = 0, empty = -1, blocked = false;
    for (let i = 0; i < 3; i++) {
      const p = square(board, line[i]);
      if (!p) empty = i;
      else if (owner(p) !== color) { blocked = true; break; }
      else { count++; if (!(p & 1)) cats++; }
    }
    if (blocked || count !== 2) continue;
    const missing = line[empty];
    const members = empty === 0 ? [line[1], line[2]] : empty === 1 ? [line[0], line[2]] : [line[0], line[1]];
    if (empty === 1) gapped++; else adjacent++;
    const kitten = !!kittenPool && stays(board, members[0], missing, true) && stays(board, members[1], missing, true);
    const cat = !!catPool && stays(board, members[0], missing, false) && stays(board, members[1], missing, false);
    if (!kitten && !cat) {
      // A setup, not a next-move threat. Gapped pieces need external blockers
      // first; do not reward an impossible completion as a ready-made line.
      unplayable++;
      score += (cats === 2 ? config.twoInRowCats : config.twoInRowKittens) * .08;
      continue;
    }
    if (cats === 2 && cat) {
      if (missing < 18) winsLow |= 1 << missing; else winsHigh |= 1 << (missing - 18);
      score += config.twoInRowCats;
    } else {
      // A mixed line graduates too, but recycles its existing adults. Value
      // only the newly promoted kittens, not three imaginary new cats.
      const gains = 2 - cats + (kitten ? 1 : 0);
      if (gains > 0) {
        if (missing < 18) promotionsLow |= 1 << missing; else promotionsHigh |= 1 << (missing - 18);
        score += config.twoInRowKittens * gains / 3;
      }
    }
  }
  const popcount = (v: number) => { let n = 0; while (v) { v &= v - 1; n++; } return n; };
  const winningSquares = popcount(winsLow) + popcount(winsHigh);
  const promotionSquares = popcount(promotionsLow) + popcount(promotionsHigh);
  // These are completion threats, not proven forced wins: the opponent may
  // boop the pair, occupy a completion, win first, or force a graduation.
  // Side-to-move matters; even a double threat is not scored as terminal.
  const toMove = (state.pending >= 0 ? state.pending : state.turn) === color;
  if (winningSquares) score += (toMove ? 180 : 80) + Math.min(3, winningSquares - 1) * 55;
  if (promotionSquares) score += Math.min(4, promotionSquares) * (toMove ? 12 : 6);
  return { score, winningSquares, promotionSquares, adjacent, gapped, unplayable };
}
