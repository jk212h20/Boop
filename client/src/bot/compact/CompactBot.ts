// Experimental numeric backend: v4 search/order/evaluation, not a released identity.
// Deterministic work-bounded alpha-beta over rules-equivalent numeric transitions.
import { pairValue } from './evaluation';
import { GameState, PlayerColor } from '../../types';
import { CompactState, encode, owner, colorIndex, legalMoves, place, select } from './CompactGame';
import { Move, BotConfig, DEFAULT_BOT_CONFIG } from '../types';

const WIN = 100000;
const WORK_LIMIT = Symbol('search work limit');
interface Entry { depth: number; score: number; flag: 'exact' | 'lower' | 'upper'; action: number }
interface Child { state: CompactState; action: number; score: number }
export interface SearchStats { nodes: number; ttHits: number; ttCutoffs: number; ttSize: number; completedDepth: number; elapsedMs: number }

export class BotAI {
  private table = new Map<string, Entry>();
  private remaining = 0;
  private path = new Set<string>();
  private history = new Float64Array(144);
  private stats: SearchStats = { nodes: 0, ttHits: 0, ttCutoffs: 0, ttSize: 0, completedDepth: 0, elapsedMs: 0 };
  constructor(private color: PlayerColor, private config: BotConfig = DEFAULT_BOT_CONFIG,
    private extraValue?: (state: CompactState, color: number) => number,
    private repetitionAware = false) {}

  findBestMove(state: GameState): Move | null {
    if (state.phase !== 'playing' || state.currentTurn !== this.color) return null;
    const compact = encode(state);
    const moves = legalMoves(compact);
    if (!moves.length) return null;
    const action = this.choose(compact, moves);
    return moves[action];
  }

  // Graduation is a real decision node, not an automatic "most kittens" shortcut.
  findBestGraduation(state: GameState): number {
    if (state.phase !== 'selecting_graduation' || state.pendingGraduationPlayer !== this.color) return 0;
    return this.choose(encode(state));
  }

  private choose(state: CompactState, moves?: Move[]): number {
    const start = performance.now();
    this.remaining = Math.max(1, Math.floor(this.config.nodeBudget ?? 30000));
    this.table.clear(); // scores/depths never leak between games or config changes
    this.history.fill(0);
    this.path.clear();
    if (this.repetitionAware) this.path.add(this.key(state));
    this.stats = { nodes: 0, ttHits: 0, ttCutoffs: 0, ttSize: 0, completedDepth: 0, elapsedMs: 0 };
    let best = 0;
    try {
      const children = this.children(state, moves);
      if (!children.length) return best;
      // A legal, statically ranked fallback even if depth 1 cannot finish.
      best = children[0].action;
      const maxDepth = Number.isFinite(this.config.searchDepth) ? Math.max(1, this.config.searchDepth) : 12;
      for (let depth = 1; depth <= maxDepth; depth++) {
        let score = -Infinity;
        let candidate = best;
        let alpha = -Infinity;
        children.sort((a, b) => Number(b.action === best) - Number(a.action === best) || b.score - a.score);
        for (const child of children) {
          const value = this.search(child.state, depth - (state.phase === 0 ? 1 : 0), alpha, Infinity);
          child.score = value; // next iteration orders by searched value, not the old leaf score
          if (value > score) { score = value; candidate = child.action; }
          alpha = Math.max(alpha, score);
        }
        // Never publish the result of an incomplete iteration.
        best = candidate;
        this.stats.completedDepth = depth;
        if (Math.abs(score) >= WIN) break;
      }
    } catch (error) { if (error !== WORK_LIMIT) throw error; }
    this.stats.elapsedMs = performance.now() - start;
    this.stats.ttSize = this.table.size;
    return best;
  }

  /** One node = one attempted canonical placement or graduation transition.
   * Root ordering attempts count, repeated iterative-deepening attempts count,
   * invalid attempts count. Cache probes/evaluations do not create nodes.
   * Charge BEFORE applying the transition; never exceed the fixed allowance. */
  private spendNode() {
    if (this.remaining <= 0) throw WORK_LIMIT;
    this.remaining--; this.stats.nodes++;
  }
  private actor(state: CompactState): number { return state.pending >= 0 ? state.pending : state.turn; }
  private key(state: CompactState): string {
    // Collision-free exact encoding, not a probabilistic hash. Fixed-size prefix.
    let key = String.fromCharCode(...state.board, ...state.stock, state.turn, state.phase, state.pending + 1);
    for (const option of state.options) key += '/' + String.fromCharCode(...option.map(i => i + 65));
    return key;
  }

  private children(state: CompactState, moves = legalMoves(state)): Child[] {
    const selecting = state.phase === 1;
    const count = selecting ? state.options.length : moves.length;
    const children: Child[] = [];
    const maximize = this.actor(state) === colorIndex(this.color);
    for (let action = 0; action < count; action++) {
      this.spendNode();
      const move = moves[action];
      const result = selecting ? select(state, action) : place(state, move.row, move.col, move.pieceType === 'cat');
      if (result) children.push({ action, state: result, score: this.evaluate(result) });
    }
    children.sort((a, b) => maximize ? b.score - a.score : a.score - b.score);
    return children;
  }

  private search(state: CompactState, depth: number, alpha: number, beta: number): number {
    if (!this.repetitionAware || state.phase === 2) return this.searchBody(state, depth, alpha, beta);
    const key = this.key(state);
    // Search policy, NOT a Boop draw rule: an exact path cycle is no progress.
    if (this.path.has(key)) return 0;
    this.path.add(key);
    try { return this.searchBody(state, depth, alpha, beta); }
    finally { this.path.delete(key); }
  }

  private searchBody(state: CompactState, depth: number, alpha: number, beta: number): number {
    if (state.phase === 2) return this.evaluate(state);
    // Always settle pending choices, even at the horizon (they don't consume a turn).
    if (depth <= 0 && state.phase !== 1) return this.evaluate(state);
    const key = this.key(state);
    const originalAlpha = alpha, originalBeta = beta;
    // Cycle scores depend on ancestors; ordinary board-only TT bounds are unsafe.
    const entry = this.repetitionAware ? undefined : this.table.get(key);
    if (entry && entry.depth >= depth) {
      this.stats.ttHits++;
      if (entry.flag === 'exact') { this.stats.ttCutoffs++; return entry.score; }
      if (entry.flag === 'lower') alpha = Math.max(alpha, entry.score);
      else beta = Math.min(beta, entry.score);
      if (alpha >= beta) { this.stats.ttCutoffs++; return entry.score; }
    }
    const selecting = state.phase === 1;
    const moves = selecting ? [] : legalMoves(state);
    const count = selecting ? state.options.length : moves.length;
    if (!count) return this.evaluate(state);
    const maximize = this.actor(state) === colorIndex(this.color);
    const offset = state.turn === 0 ? 0 : 72;
    const historyIndex = (move: Move) => offset + (move.pieceType === 'cat' ? 36 : 0) + move.row * 6 + move.col;
    const order = Array.from({ length: count }, (_, action) => action);
    // Search the prior principal move first, then moves that actually caused
    // cutoffs. Generate/apply a child only when visited: a TT-first cutoff no
    // longer clones and evaluates every sibling that will be discarded.
    order.sort((a, b) => Number(b === entry?.action) - Number(a === entry?.action) ||
      (selecting ? 0 : this.history[historyIndex(moves[b])] - this.history[historyIndex(moves[a])]) ||
      (selecting ? 0 : Math.abs(moves[a].row - 2.5) + Math.abs(moves[a].col - 2.5) - Math.abs(moves[b].row - 2.5) - Math.abs(moves[b].col - 2.5)));
    let best = maximize ? -Infinity : Infinity, action = order[0];
    const nextDepth = depth - (selecting ? 0 : 1);
    for (const candidate of order) {
      this.spendNode();
      const move = moves[candidate];
      const result = selecting ? select(state, candidate) : place(state, move.row, move.col, move.pieceType === 'cat');
      if (!result) continue;
      const score = this.search(result, nextDepth, alpha, beta);
      if (maximize ? score > best : score < best) { best = score; action = candidate; }
      if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (alpha >= beta) {
        if (!selecting) this.history[historyIndex(move)] += Math.max(1, depth * depth);
        break;
      }
    }
    if (!this.repetitionAware && this.table.size < 30000) this.table.set(key, { depth, score: best, action,
      flag: best <= originalAlpha ? 'upper' : best >= originalBeta ? 'lower' : 'exact' });
    return best;
  }

  private evaluate(state: CompactState): number {
    if (state.phase === 2) return state.winner === colorIndex(this.color) ? WIN : -WIN;
    return this.playerValue(state, colorIndex(this.color)) - this.playerValue(state, 1 - colorIndex(this.color));
  }

  private playerValue(state: CompactState, color: number): number {
    let value = 0, cats = state.stock[color * 3 + 1];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const p = state.board[r * 6 + c];
      if (!p || owner(p) !== color) continue;
      if (!(p & 1)) cats++;
      const position = (r === 0 || r === 5) && (c === 0 || c === 5) ? this.config.pieceInCorner :
        r === 0 || r === 5 || c === 0 || c === 5 ? this.config.pieceOnEdge :
        r >= 2 && r <= 3 && c >= 2 && c <= 3 ? this.config.pieceInCenter : this.config.pieceInInnerRing;
      value += position * (!(p & 1) ? this.config.catMultiplier : 1);
    }
    // Permanent promotion matters more than easily-booped positional gains.
    value += cats * 65;
    value += pairValue(state, color, this.config).score;
    if (this.extraValue) value += this.extraValue(state, color);
    return value;
  }

  getConfig(): BotConfig { return { ...this.config }; }
  setConfig(config: Partial<BotConfig>) { this.config = { ...this.config, ...config }; this.clearCache(); }
  clearCache() { this.table.clear(); }
  getStats(): SearchStats { return { ...this.stats }; }
}
export function createBot(color: PlayerColor, config?: Partial<BotConfig>): BotAI {
  return new BotAI(color, { ...DEFAULT_BOT_CONFIG, ...config });
}
