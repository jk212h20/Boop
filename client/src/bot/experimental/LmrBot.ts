// Deterministic work-bounded alpha-beta over canonical live-game transitions.
import { pairValue } from '../evaluation';
import { GameState, PlayerColor } from '../../types';
import { Move, BotConfig, DEFAULT_BOT_CONFIG } from '../types';
import { executeMove, getAllValidMoves, getOpponentColor, resolveGraduationChoice } from '../LocalGame';

const WIN = 100000;
const WORK_LIMIT = Symbol('search work limit');
interface Entry { depth: number; score: number; flag: 'exact' | 'lower' | 'upper'; action: number }
interface Child { state: GameState; action: number; score: number }
export interface SearchStats { nodes: number; ttHits: number; ttCutoffs: number; ttSize: number; completedDepth: number; elapsedMs: number }

export class BotAI {
  private table = new Map<string, Entry>();
  private remaining = 0;
  private history = new Float64Array(144);
  private stats: SearchStats = { nodes: 0, ttHits: 0, ttCutoffs: 0, ttSize: 0, completedDepth: 0, elapsedMs: 0 };
  constructor(private color: PlayerColor, private config: BotConfig = DEFAULT_BOT_CONFIG) {}

  findBestMove(state: GameState): Move | null {
    if (state.phase !== 'playing' || state.currentTurn !== this.color) return null;
    const moves = getAllValidMoves(state, this.color);
    if (!moves.length) return null;
    const action = this.choose(state, moves);
    return moves[action];
  }

  // Graduation is a real decision node, not an automatic "most kittens" shortcut.
  findBestGraduation(state: GameState): number {
    if (state.phase !== 'selecting_graduation' || state.pendingGraduationPlayer !== this.color) return 0;
    return this.choose(state);
  }

  private choose(state: GameState, moves?: Move[]): number {
    const start = performance.now();
    this.remaining = Math.max(1, Math.floor(this.config.nodeBudget ?? 30000));
    this.table.clear(); // scores/depths never leak between games or config changes
    this.history.fill(0);
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
          const value = this.search(child.state, depth - (state.phase === 'playing' ? 1 : 0), alpha, Infinity);
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
  private actor(state: GameState): PlayerColor { return state.pendingGraduationPlayer ?? state.currentTurn; }
  private key(state: GameState): string {
    let key = '';
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const p = state.board[r][c];
      key += !p ? '.' : p.color === 'orange' ? (p.type === 'cat' ? 'C' : 'K') : (p.type === 'cat' ? 'c' : 'k');
    }
    key += state.currentTurn + state.phase + state.pendingGraduationPlayer;
    for (const color of ['orange', 'gray'] as const) {
      const p = state.players[color];
      key += `/${p?.kittensInPool},${p?.catsInPool},${p?.kittensRetired}`;
    }
    // Options can differ for identical boards depending on the unresolved
    // choice sequence. Keep their ordering because TT actions are indices.
    if (state.pendingGraduationOptions) for (const option of state.pendingGraduationOptions) {
      key += '/'; for (const cell of option) key += String.fromCharCode(65 + cell.row * 6 + cell.col);
    }
    return key;
  }

  private children(state: GameState, moves = getAllValidMoves(state, state.currentTurn)): Child[] {
    const selecting = state.phase === 'selecting_graduation';
    const count = selecting ? state.pendingGraduationOptions?.length ?? 0 : moves.length;
    const children: Child[] = [];
    const maximize = this.actor(state) === this.color;
    for (let action = 0; action < count; action++) {
      this.spendNode();
      const move = moves[action];
      const result = selecting ? resolveGraduationChoice(state, action) : executeMove(state, move.row, move.col, move.pieceType, state.currentTurn);
      if (result.valid) children.push({ action, state: result.newState, score: this.evaluate(result.newState) });
    }
    children.sort((a, b) => maximize ? b.score - a.score : a.score - b.score);
    return children;
  }

  private search(state: GameState, depth: number, alpha: number, beta: number): number {
    if (state.phase === 'finished') return this.evaluate(state);
    // Always settle pending choices, even at the horizon (they don't consume a turn).
    if (depth <= 0 && state.phase !== 'selecting_graduation') return this.evaluate(state);
    const key = this.key(state);
    const originalAlpha = alpha, originalBeta = beta;
    const entry = this.table.get(key);
    if (entry && entry.depth >= depth) {
      this.stats.ttHits++;
      if (entry.flag === 'exact') { this.stats.ttCutoffs++; return entry.score; }
      if (entry.flag === 'lower') alpha = Math.max(alpha, entry.score);
      else beta = Math.min(beta, entry.score);
      if (alpha >= beta) { this.stats.ttCutoffs++; return entry.score; }
    }
    const selecting = state.phase === 'selecting_graduation';
    const moves = selecting ? [] : getAllValidMoves(state, state.currentTurn);
    const count = selecting ? state.pendingGraduationOptions?.length ?? 0 : moves.length;
    if (!count) return this.evaluate(state);
    const maximize = this.actor(state) === this.color;
    const offset = state.currentTurn === 'orange' ? 0 : 72;
    const historyIndex = (move: Move) => offset + (move.pieceType === 'cat' ? 36 : 0) + move.row * 6 + move.col;
    const order = Array.from({ length: count }, (_, action) => action);
    // Search the prior principal move first, then moves that actually caused
    // cutoffs. Generate/apply a child only when visited: a TT-first cutoff no
    // longer clones and evaluates every sibling that will be discarded.
    order.sort((a, b) => Number(b === entry?.action) - Number(a === entry?.action) ||
      (selecting ? 0 : this.history[historyIndex(moves[b])] - this.history[historyIndex(moves[a])]) ||
      (selecting ? 0 : Math.abs(moves[a].row - 2.5) + Math.abs(moves[a].col - 2.5) - Math.abs(moves[b].row - 2.5) - Math.abs(moves[b].col - 2.5)));
    let best = maximize ? -Infinity : Infinity, action = order[0];
    let searched = 0;
    const quiet = !selecting && depth >= 3 &&
      pairValue(state, 'orange', this.config).winningSquares === 0 &&
      pairValue(state, 'gray', this.config).winningSquares === 0;
    const nextDepth = depth - (selecting ? 0 : 1);
    for (const candidate of order) {
      this.spendNode();
      const move = moves[candidate];
      const result = selecting ? resolveGraduationChoice(state, candidate) : executeMove(state, move.row, move.col, move.pieceType, state.currentTurn);
      if (!result.valid) continue;
      // Reduce late quiet moves one placement, then fully re-search any
      // move that improves the bound. No reductions for promotion choices,
      // terminal transitions, or positions with direct cat-line threats.
      const reduce = quiet && searched >= 6 && result.newState.phase === 'playing' &&
        pairValue(result.newState, 'orange', this.config).winningSquares === 0 &&
        pairValue(result.newState, 'gray', this.config).winningSquares === 0;
      let score = this.search(result.newState, nextDepth - (reduce ? 1 : 0), alpha, beta);
      if (reduce && (maximize ? score > alpha : score < beta))
        score = this.search(result.newState, nextDepth, alpha, beta);
      searched++;
      if (maximize ? score > best : score < best) { best = score; action = candidate; }
      if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (alpha >= beta) {
        if (!selecting) this.history[historyIndex(move)] += Math.max(1, depth * depth);
        break;
      }
    }
    if (this.table.size < 30000) this.table.set(key, { depth, score: best, action,
      flag: best <= originalAlpha ? 'upper' : best >= originalBeta ? 'lower' : 'exact' });
    return best;
  }

  private evaluate(state: GameState): number {
    if (state.phase === 'finished') return state.winner === this.color ? WIN : -WIN;
    return this.playerValue(state, this.color) - this.playerValue(state, getOpponentColor(this.color));
  }

  private playerValue(state: GameState, color: PlayerColor): number {
    let value = 0, cats = state.players[color]?.catsInPool ?? 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const p = state.board[r][c];
      if (!p || p.color !== color) continue;
      if (p.type === 'cat') cats++;
      const position = (r === 0 || r === 5) && (c === 0 || c === 5) ? this.config.pieceInCorner :
        r === 0 || r === 5 || c === 0 || c === 5 ? this.config.pieceOnEdge :
        r >= 2 && r <= 3 && c >= 2 && c <= 3 ? this.config.pieceInCenter : this.config.pieceInInnerRing;
      value += position * (p.type === 'cat' ? this.config.catMultiplier : 1);
    }
    // Permanent promotion matters more than easily-booped positional gains.
    value += cats * 65;
    value += pairValue(state, color, this.config).score;
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
