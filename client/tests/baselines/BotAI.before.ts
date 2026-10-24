// Frozen pre-strengthening engine from 130d26f, 2026-10-24. Test-only.
// Deadline-bounded alpha-beta over the SAME transitions used by live games.
import { GameState, PlayerColor, Board } from '../../src/types';
import { Move, BotConfig, DEFAULT_BOT_CONFIG } from '../../src/bot/types';
import { executeMove, getAllValidMoves, getOpponentColor, resolveGraduationChoice } from '../../src/bot/LocalGame';

const WIN = 100000;
const TIMEOUT = Symbol('search deadline');
interface Entry { depth: number; score: number; flag: 'exact' | 'lower' | 'upper'; action: number }
interface Child { state: GameState; action: number; score: number }
export interface SearchStats { nodes: number; ttHits: number; ttCutoffs: number; ttSize: number; completedDepth: number; elapsedMs: number }

export class BotAI {
  private table = new Map<string, Entry>();
  private deadline = Infinity;
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
    const budget = Number.isFinite(this.config.timeBudgetMs) ? this.config.timeBudgetMs : 850;
    this.deadline = start + Math.max(1, Math.min(900, budget));
    this.table.clear(); // scores/depths never leak between games or config changes
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
          this.checkTime();
          const value = this.search(child.state, depth - (state.phase === 'playing' ? 1 : 0), alpha, Infinity);
          if (value > score) { score = value; candidate = child.action; }
          alpha = Math.max(alpha, score);
        }
        // Never publish the result of an incomplete iteration.
        best = candidate;
        this.stats.completedDepth = depth;
        if (Math.abs(score) >= WIN) break;
      }
    } catch (error) { if (error !== TIMEOUT) throw error; }
    this.stats.elapsedMs = performance.now() - start;
    this.stats.ttSize = this.table.size;
    return best;
  }

  private checkTime() { if (performance.now() >= this.deadline) throw TIMEOUT; }
  private actor(state: GameState): PlayerColor { return state.pendingGraduationPlayer ?? state.currentTurn; }
  private key(state: GameState): string {
    return state.board.flat().map(p => p ? (p.color === 'orange' ? (p.type === 'cat' ? 'C' : 'K') : (p.type === 'cat' ? 'c' : 'k')) : '.').join('') +
      JSON.stringify([state.currentTurn, state.phase, state.pendingGraduationPlayer, state.pendingGraduationOptions,
        ...(['orange', 'gray'] as const).flatMap(c => { const p = state.players[c]; return [p?.kittensInPool, p?.catsInPool, p?.kittensRetired]; })]);
  }

  private children(state: GameState, moves = getAllValidMoves(state, state.currentTurn)): Child[] {
    const selecting = state.phase === 'selecting_graduation';
    const count = selecting ? state.pendingGraduationOptions?.length ?? 0 : moves.length;
    const children: Child[] = [];
    const maximize = this.actor(state) === this.color;
    for (let action = 0; action < count; action++) {
      this.checkTime();
      const move = moves[action];
      const result = selecting ? resolveGraduationChoice(state, action) : executeMove(state, move.row, move.col, move.pieceType, state.currentTurn);
      if (result.valid) children.push({ action, state: result.newState, score: this.evaluate(result.newState) });
    }
    children.sort((a, b) => maximize ? b.score - a.score : a.score - b.score);
    return children;
  }

  private search(state: GameState, depth: number, alpha: number, beta: number): number {
    this.checkTime();
    this.stats.nodes++;
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
    const children = this.children(state);
    if (!children.length) return this.evaluate(state);
    if (entry) children.sort((a, b) => Number(b.action === entry.action) - Number(a.action === entry.action));
    const maximize = this.actor(state) === this.color;
    let best = maximize ? -Infinity : Infinity, action = children[0].action;
    const nextDepth = depth - (state.phase === 'playing' ? 1 : 0);
    for (const child of children) {
      const score = this.search(child.state, nextDepth, alpha, beta);
      if (maximize ? score > best : score < best) { best = score; action = child.action; }
      if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (alpha >= beta) break;
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
    value += this.lineValue(state.board, color);
    return value;
  }

  private lineValue(board: Board, color: PlayerColor): number {
    let value = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const endR = r + dr * 2, endC = c + dc * 2;
      if (endR < 0 || endR > 5 || endC < 0 || endC > 5) continue;
      let cats = 0, kittens = 0, blocked = false;
      for (let i = 0; i < 3; i++) {
        const p = board[r + dr * i][c + dc * i];
        if (p && p.color !== color) { blocked = true; break; }
        if (p?.type === 'cat') cats++; else if (p) kittens++;
      }
      if (blocked) continue;
      if (cats === 2) value += this.config.twoInRowCats;
      else if (cats + kittens === 2) value += this.config.twoInRowKittens;
      else if (cats === 1) value += 3;
    }
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
