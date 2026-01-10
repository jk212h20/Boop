// Bot AI Decision Engine
// Implements priority cascade + minimax tree search with smart pruning optimizations
// - Move ordering for better alpha-beta cutoffs
// - Iterative deepening for optimal move ordering
// - Transposition table for position caching
// - Killer move heuristic for sibling position optimization

import { GameState, PlayerColor, Board, Cell, PieceType } from '../types';
import { Move, BotConfig, DEFAULT_BOT_CONFIG, CENTER_POSITIONS, CORNER_POSITIONS } from './types';
import {
  getAllValidMoves,
  simulateMove,
  getOpponentColor,
  isValidPosition,
} from './LocalGame';

const BOARD_SIZE = 6;

// Line directions for checking
const LINE_DIRECTIONS: [number, number][] = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal down-right
  [1, -1]   // diagonal down-left
];

// Inner ring positions (not center, not edge)
const INNER_RING_POSITIONS: Cell[] = [
  { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 },
  { row: 2, col: 1 }, { row: 2, col: 4 },
  { row: 3, col: 1 }, { row: 3, col: 4 },
  { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 },
];

// Transposition table entry types
const TT_EXACT = 0;
const TT_LOWER = 1; // Alpha cutoff (score >= beta)
const TT_UPPER = 2; // Beta cutoff (score <= alpha)

interface TTEntry {
  hash: string;
  depth: number;
  score: number;
  flag: number;
  bestMove: Move | null;
}

export class BotAI {
  private config: BotConfig;
  private color: PlayerColor;
  
  // Smart pruning data structures
  private transpositionTable: Map<string, TTEntry> = new Map();
  private killerMoves: Map<number, Move[]> = new Map(); // depth -> [killer1, killer2]
  private historyTable: Map<string, number> = new Map(); // move key -> score
  private nodesSearched: number = 0;
  private ttHits: number = 0;
  private ttCutoffs: number = 0;

  constructor(color: PlayerColor, config: BotConfig = DEFAULT_BOT_CONFIG) {
    this.color = color;
    this.config = config;
  }

  // Main decision function - returns best move
  findBestMove(state: GameState): Move | null {
    const allMoves = getAllValidMoves(state, this.color);
    
    if (allMoves.length === 0) {
      return null;
    }

    // Reset stats for this search
    this.nodesSearched = 0;
    this.ttHits = 0;
    this.ttCutoffs = 0;
    this.killerMoves.clear();
    this.historyTable.clear();
    // Keep transposition table between moves (but could clear if memory is an issue)

    // TIER 1: Find winning moves - just pick any, a win is a win
    const winningMoves = this.findWinningMoves(state, allMoves);
    if (winningMoves.length > 0) {
      this.log('[Bot] Tier 1: Taking winning move');
      return this.pickRandom(winningMoves);
    }

    // TIER 2: Block opponent's winning moves - use tree search to pick best
    const blockingMoves = this.findBlockingMoves(state, allMoves);
    if (blockingMoves.length > 0) {
      this.log('[Bot] Tier 2: Blocking opponent win');
      return this.pickBestByTreeSearch(state, blockingMoves);
    }

    // TIER 3: Create graduation - use tree search to pick best
    const graduationMoves = this.findGraduationMoves(state, allMoves);
    if (graduationMoves.length > 0) {
      this.log('[Bot] Tier 3: Creating graduation');
      return this.pickBestByTreeSearch(state, graduationMoves);
    }

    // TIER 4: Block opponent's graduation - use tree search to pick best
    const blockGraduationMoves = this.findBlockGraduationMoves(state, allMoves);
    if (blockGraduationMoves.length > 0) {
      this.log('[Bot] Tier 4: Blocking opponent graduation');
      return this.pickBestByTreeSearch(state, blockGraduationMoves);
    }

    // TIER 5: Use tree search on all moves
    this.log('[Bot] Tier 5: Using tree search');
    return this.pickBestByTreeSearch(state, allMoves);
  }

  // Pick the best move using iterative deepening minimax tree search
  private pickBestByTreeSearch(state: GameState, moves: Move[]): Move {
    if (moves.length === 0) {
      throw new Error('No moves to evaluate');
    }
    
    if (moves.length === 1) {
      return moves[0];
    }

    const maxDepth = this.config.searchDepth;
    let bestMove: Move = moves[0];
    let bestScore = -Infinity;
    
    // Iterative deepening: search depth 1, then 2, then 3, etc.
    // This improves move ordering for deeper searches
    for (let depth = 1; depth <= maxDepth; depth++) {
      const startTime = Date.now();
      const result = this.searchRoot(state, moves, depth);
      const elapsed = Date.now() - startTime;
      
      bestMove = result.move;
      bestScore = result.score;
      
      this.log(`[Bot] Depth ${depth}: Best=(${bestMove.row},${bestMove.col}) ${bestMove.pieceType} Score=${bestScore.toFixed(1)} Nodes=${this.nodesSearched} TT=${this.ttHits}/${this.ttCutoffs} Time=${elapsed}ms`);
      
      // If we found a winning move, no need to search deeper
      if (bestScore >= 9000) {
        break;
      }
    }

    return bestMove;
  }

  // Search at root level with move ordering
  private searchRoot(state: GameState, moves: Move[], depth: number): { move: Move; score: number } {
    // Order moves for better pruning
    const orderedMoves = this.orderMoves(state, moves, this.color, depth);
    
    let bestMove = orderedMoves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of orderedMoves) {
      const sim = simulateMove(state, move.row, move.col, move.pieceType, this.color);
      
      if (!sim.valid) continue;

      let score: number;
      
      if (sim.wins) {
        score = 10000;
      } else {
        const resultingState = this.buildResultingState(state, sim, this.color);
        const opponentColor = getOpponentColor(this.color);
        score = -this.negamax(resultingState, depth - 1, opponentColor, -beta, -alpha);
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      
      alpha = Math.max(alpha, score);
    }

    return { move: bestMove, score: bestScore };
  }

  // Order moves for better alpha-beta pruning
  // Good ordering is critical for pruning efficiency
  private orderMoves(state: GameState, moves: Move[], player: PlayerColor, depth: number): Move[] {
    const scored: { move: Move; priority: number }[] = [];
    
    // Get killer moves for this depth
    const killers = this.killerMoves.get(depth) || [];
    
    for (const move of moves) {
      let priority = 0;
      
      // Check simulation result for tactical moves
      const sim = simulateMove(state, move.row, move.col, move.pieceType, player);
      
      if (!sim.valid) {
        priority = -10000;
      } else if (sim.wins) {
        // Winning moves first (highest priority)
        priority = 100000;
      } else if (sim.createsGraduation) {
        // Graduation moves are very good
        priority = 50000;
      } else {
        // Check if this is a killer move
        const isKiller = killers.some(k => 
          k.row === move.row && k.col === move.col && k.pieceType === move.pieceType
        );
        if (isKiller) {
          priority = 40000;
        }
        
        // History heuristic
        const histKey = this.getMoveKey(move);
        priority += this.historyTable.get(histKey) || 0;
        
        // Position-based heuristics
        if (this.isCenterPosition(move.row, move.col)) {
          priority += 150;
        } else if (this.isInnerRingPosition(move.row, move.col)) {
          priority += 80;
        } else if (this.isCornerPosition(move.row, move.col)) {
          priority -= 100;
        } else if (this.isEdgePosition(move.row, move.col)) {
          priority -= 50;
        }
        
        // Cats are generally more valuable placements
        if (move.pieceType === 'cat') {
          priority += 50;
        }
        
        // Bonus for booping opponent pieces off
        const oppBooped = sim.boopedPieces.filter(bp => {
          if (bp.to === null) {
            const piece = state.board[bp.from.row][bp.from.col];
            return piece && piece.color !== player;
          }
          return false;
        }).length;
        priority += oppBooped * 200;
      }
      
      scored.push({ move, priority });
    }
    
    // Sort by priority descending
    scored.sort((a, b) => b.priority - a.priority);
    
    return scored.map(s => s.move);
  }

  // Negamax with alpha-beta pruning, transposition table, and killer moves
  private negamax(
    state: GameState,
    depth: number,
    currentPlayer: PlayerColor,
    alpha: number,
    beta: number
  ): number {
    this.nodesSearched++;
    
    // Check transposition table
    const posHash = this.hashPosition(state, currentPlayer);
    const ttEntry = this.transpositionTable.get(posHash);
    
    if (ttEntry && ttEntry.depth >= depth) {
      this.ttHits++;
      
      if (ttEntry.flag === TT_EXACT) {
        this.ttCutoffs++;
        return ttEntry.score;
      } else if (ttEntry.flag === TT_LOWER) {
        alpha = Math.max(alpha, ttEntry.score);
      } else if (ttEntry.flag === TT_UPPER) {
        beta = Math.min(beta, ttEntry.score);
      }
      
      if (alpha >= beta) {
        this.ttCutoffs++;
        return ttEntry.score;
      }
    }

    // Base case: depth 0 or game over
    if (depth <= 0 || state.phase === 'finished') {
      const score = this.evaluateBoard(state, currentPlayer);
      return score;
    }

    const moves = getAllValidMoves(state, currentPlayer);
    
    if (moves.length === 0) {
      return this.evaluateBoard(state, currentPlayer);
    }

    // Order moves for better pruning
    const orderedMoves = this.orderMoves(state, moves, currentPlayer, depth);

    let bestScore = -Infinity;
    let bestMove: Move | null = null;
    const originalAlpha = alpha;

    for (const move of orderedMoves) {
      const sim = simulateMove(state, move.row, move.col, move.pieceType, currentPlayer);
      
      if (!sim.valid) continue;

      let score: number;

      // Check for immediate win
      if (sim.wins) {
        score = 10000;
      } else {
        const resultingState = this.buildResultingState(state, sim, currentPlayer);
        const opponent = getOpponentColor(currentPlayer);
        
        // Recursively evaluate
        score = -this.negamax(resultingState, depth - 1, opponent, -beta, -alpha);
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      
      alpha = Math.max(alpha, score);
      
      // Alpha-beta pruning
      if (alpha >= beta) {
        // Store killer move (caused a cutoff)
        this.storeKillerMove(move, depth);
        // Update history table
        this.updateHistory(move, depth);
        break;
      }
    }

    // Store in transposition table
    let flag = TT_EXACT;
    if (bestScore <= originalAlpha) {
      flag = TT_UPPER;
    } else if (bestScore >= beta) {
      flag = TT_LOWER;
    }
    
    this.transpositionTable.set(posHash, {
      hash: posHash,
      depth,
      score: bestScore,
      flag,
      bestMove,
    });

    return bestScore;
  }

  // Store a killer move (move that caused a beta cutoff)
  private storeKillerMove(move: Move, depth: number): void {
    let killers = this.killerMoves.get(depth);
    if (!killers) {
      killers = [];
      this.killerMoves.set(depth, killers);
    }
    
    // Don't duplicate
    const isDuplicate = killers.some(k => 
      k.row === move.row && k.col === move.col && k.pieceType === move.pieceType
    );
    
    if (!isDuplicate) {
      // Keep only 2 killer moves per depth
      killers.unshift(move);
      if (killers.length > 2) {
        killers.pop();
      }
    }
  }

  // Update history table (moves that cause cutoffs get higher scores)
  private updateHistory(move: Move, depth: number): void {
    const key = this.getMoveKey(move);
    const current = this.historyTable.get(key) || 0;
    // Bonus based on depth (deeper cutoffs are more valuable)
    this.historyTable.set(key, current + depth * depth);
  }

  // Get a unique key for a move
  private getMoveKey(move: Move): string {
    return `${move.row},${move.col},${move.pieceType}`;
  }

  // Hash a position for transposition table
  // Simple string-based hashing (could use Zobrist for more efficiency)
  private hashPosition(state: GameState, currentPlayer: PlayerColor): string {
    const boardStr = state.board.map(row => 
      row.map(cell => {
        if (!cell) return '.';
        return cell.color[0] + cell.type[0]; // e.g., "ok" for orange kitten
      }).join('')
    ).join('|');
    
    const playerStr = currentPlayer;
    const poolStr = `${state.players.orange?.kittensInPool || 0},${state.players.orange?.catsInPool || 0},${state.players.gray?.kittensInPool || 0},${state.players.gray?.catsInPool || 0}`;
    
    return `${boardStr}:${playerStr}:${poolStr}`;
  }

  // Static board evaluation function
  private evaluateBoard(state: GameState, forPlayer: PlayerColor): number {
    let score = 0;
    const opponent = getOpponentColor(forPlayer);

    // Evaluate piece positions
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = state.board[row][col];
        if (!piece) continue;

        const isOurs = piece.color === forPlayer;
        const multiplier = isOurs ? 1 : -1;
        const typeMultiplier = piece.type === 'cat' ? this.config.catMultiplier : 1;
        
        // Position value
        let positionValue = 0;
        
        if (this.isCenterPosition(row, col)) {
          positionValue = this.config.pieceInCenter;
        } else if (this.isInnerRingPosition(row, col)) {
          positionValue = this.config.pieceInInnerRing;
        } else if (this.isCornerPosition(row, col)) {
          positionValue = this.config.pieceInCorner;
        } else if (this.isEdgePosition(row, col)) {
          positionValue = this.config.pieceOnEdge;
        }

        score += multiplier * positionValue * typeMultiplier;
      }
    }

    // Evaluate threats (2-in-a-row)
    const ourCatThreats = this.countTwoInRow(state.board, forPlayer, 'cat');
    const ourKittenThreats = this.countTwoInRow(state.board, forPlayer, 'kitten');
    const oppCatThreats = this.countTwoInRow(state.board, opponent, 'cat');
    const oppKittenThreats = this.countTwoInRow(state.board, opponent, 'kitten');

    score += ourCatThreats * this.config.twoInRowCats;
    score += ourKittenThreats * this.config.twoInRowKittens;
    score -= oppCatThreats * this.config.twoInRowCats;
    score -= oppKittenThreats * this.config.twoInRowKittens;

    // Cat advantage with diminishing returns
    const ourPlayer = state.players[forPlayer];
    const oppPlayer = state.players[opponent];
    
    if (ourPlayer && oppPlayer) {
      const ourCatsOnBoard = this.countCatsOnBoard(state.board, forPlayer);
      const oppCatsOnBoard = this.countCatsOnBoard(state.board, opponent);
      const ourTotalCats = ourPlayer.catsInPool + ourCatsOnBoard;
      const oppTotalCats = oppPlayer.catsInPool + oppCatsOnBoard;
      
      score += this.catValueWithDiminishing(ourTotalCats);
      score -= this.catValueWithDiminishing(oppTotalCats);
    }

    return score;
  }

  // Build a game state from simulation result
  private buildResultingState(
    originalState: GameState,
    sim: { newBoard: Board; newKittensInPool: number; newCatsInPool: number; boopedPieces: { from: Cell; to: Cell | null }[] },
    movingPlayer: PlayerColor
  ): GameState {
    const opponent = getOpponentColor(movingPlayer);
    
    // Calculate pieces booped off for each player
    let ourBoopedOff = 0;
    let oppBoopedOff = 0;
    
    for (const bp of sim.boopedPieces) {
      if (bp.to === null) {
        const piece = originalState.board[bp.from.row][bp.from.col];
        if (piece) {
          if (piece.color === movingPlayer) {
            ourBoopedOff++;
          } else {
            oppBoopedOff++;
          }
        }
      }
    }

    const newState: GameState = {
      ...originalState,
      board: sim.newBoard,
      currentTurn: opponent,
      players: {
        ...originalState.players,
        [movingPlayer]: originalState.players[movingPlayer] ? {
          ...originalState.players[movingPlayer]!,
          kittensInPool: sim.newKittensInPool,
          catsInPool: sim.newCatsInPool,
        } : null,
      },
    };

    return newState;
  }

  // TIER 1: Find moves that win the game
  private findWinningMoves(state: GameState, moves: Move[]): Move[] {
    const winning: Move[] = [];
    
    for (const move of moves) {
      const sim = simulateMove(state, move.row, move.col, move.pieceType, this.color);
      if (sim.valid && sim.wins) {
        winning.push(move);
      }
    }
    
    return winning;
  }

  // TIER 2: Find moves that block opponent's winning threats
  private findBlockingMoves(state: GameState, moves: Move[]): Move[] {
    const opponentColor = getOpponentColor(this.color);
    const opponentMoves = getAllValidMoves(state, opponentColor);
    
    // Find cells where opponent could win
    const opponentWinCells = new Set<string>();
    
    for (const oppMove of opponentMoves) {
      const sim = simulateMove(state, oppMove.row, oppMove.col, oppMove.pieceType, opponentColor);
      if (sim.valid && sim.wins) {
        opponentWinCells.add(`${oppMove.row},${oppMove.col}`);
      }
    }
    
    if (opponentWinCells.size === 0) {
      return [];
    }
    
    // Find our moves that occupy those cells
    const blocking: Move[] = [];
    for (const move of moves) {
      const key = `${move.row},${move.col}`;
      if (opponentWinCells.has(key)) {
        blocking.push(move);
      }
    }
    
    return blocking;
  }

  // TIER 3: Find moves that create graduation
  private findGraduationMoves(state: GameState, moves: Move[]): Move[] {
    const graduation: Move[] = [];
    
    for (const move of moves) {
      const sim = simulateMove(state, move.row, move.col, move.pieceType, this.color);
      if (sim.valid && sim.createsGraduation) {
        graduation.push(move);
      }
    }
    
    return graduation;
  }

  // TIER 4: Find moves that block opponent's graduation opportunities
  private findBlockGraduationMoves(state: GameState, moves: Move[]): Move[] {
    const opponentColor = getOpponentColor(this.color);
    const opponentMoves = getAllValidMoves(state, opponentColor);
    
    // Find cells where opponent could graduate
    const opponentGradCells = new Set<string>();
    
    for (const oppMove of opponentMoves) {
      const sim = simulateMove(state, oppMove.row, oppMove.col, oppMove.pieceType, opponentColor);
      if (sim.valid && sim.createsGraduation) {
        opponentGradCells.add(`${oppMove.row},${oppMove.col}`);
      }
    }
    
    if (opponentGradCells.size === 0) {
      return [];
    }
    
    // Find our moves that occupy those cells
    const blocking: Move[] = [];
    for (const move of moves) {
      const key = `${move.row},${move.col}`;
      if (opponentGradCells.has(key)) {
        blocking.push(move);
      }
    }
    
    return blocking;
  }

  // Count 2-in-a-row formations for a player/piece type
  private countTwoInRow(board: Board, color: PlayerColor, pieceType: PieceType): number {
    let count = 0;
    const found = new Set<string>();
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dRow, dCol] of LINE_DIRECTIONS) {
          let pieces = 0;
          let empty = 0;
          const cells: Cell[] = [];
          
          for (let i = 0; i < 3; i++) {
            const r = row + i * dRow;
            const c = col + i * dCol;
            
            if (!isValidPosition(r, c)) break;
            
            const piece = board[r][c];
            cells.push({ row: r, col: c });
            
            if (piece === null) {
              empty++;
            } else if (piece.color === color && piece.type === pieceType) {
              pieces++;
            } else {
              break;
            }
          }
          
          // 2 pieces + 1 empty in a line of 3
          if (pieces === 2 && empty === 1 && cells.length === 3) {
            const key = cells.map(c => `${c.row},${c.col}`).sort().join('|');
            if (!found.has(key)) {
              found.add(key);
              count++;
            }
          }
        }
      }
    }
    
    return count;
  }

  // Position helpers
  private isCenterPosition(row: number, col: number): boolean {
    return CENTER_POSITIONS.some(p => p.row === row && p.col === col);
  }

  private isInnerRingPosition(row: number, col: number): boolean {
    return INNER_RING_POSITIONS.some(p => p.row === row && p.col === col);
  }

  private isCornerPosition(row: number, col: number): boolean {
    return CORNER_POSITIONS.some(p => p.row === row && p.col === col);
  }

  private isEdgePosition(row: number, col: number): boolean {
    return row === 0 || row === 5 || col === 0 || col === 5;
  }

  // Count cats on board for a player
  private countCatsOnBoard(board: Board, color: PlayerColor): number {
    let count = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece.color === color && piece.type === 'cat') {
          count++;
        }
      }
    }
    return count;
  }

  // Calculate cat value with diminishing returns
  private catValueWithDiminishing(catCount: number): number {
    if (catCount <= 0) return 0;
    
    let value = 0;
    const catValues = [25, 20, 15];
    
    for (let i = 0; i < catCount; i++) {
      if (i < catValues.length) {
        value += catValues[i];
      } else {
        value += 8;
      }
    }
    
    return value;
  }

  // Random selection from array
  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  // Conditional logging (respects silent mode)
  private log(message: string): void {
    if (!this.config.silent) {
      console.log(message);
    }
  }

  // Get config for debugging/tuning
  getConfig(): BotConfig {
    return { ...this.config };
  }

  // Update config
  setConfig(newConfig: Partial<BotConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Clear transposition table (useful between games)
  clearCache(): void {
    this.transpositionTable.clear();
    this.killerMoves.clear();
    this.historyTable.clear();
  }

  // Get search statistics (for debugging)
  getStats(): { nodes: number; ttHits: number; ttCutoffs: number; ttSize: number } {
    return {
      nodes: this.nodesSearched,
      ttHits: this.ttHits,
      ttCutoffs: this.ttCutoffs,
      ttSize: this.transpositionTable.size,
    };
  }
}

// Factory function to create bot
export function createBot(color: PlayerColor, config?: Partial<BotConfig>): BotAI {
  const fullConfig = { ...DEFAULT_BOT_CONFIG, ...config };
  return new BotAI(color, fullConfig);
}
