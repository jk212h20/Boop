// Bot AI Decision Engine
// Implements priority cascade + minimax tree search for move selection

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

export class BotAI {
  private config: BotConfig;
  private color: PlayerColor;

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

  // Pick the best move using minimax tree search
  private pickBestByTreeSearch(state: GameState, moves: Move[]): Move {
    if (moves.length === 0) {
      throw new Error('No moves to evaluate');
    }
    
    if (moves.length === 1) {
      return moves[0];
    }

    const depth = this.config.searchDepth;
    const scoredMoves: { move: Move; score: number }[] = [];

    for (const move of moves) {
      const score = this.evaluateMoveWithTree(state, move, depth);
      scoredMoves.push({ move, score });
    }

    // Sort by score descending
    scoredMoves.sort((a, b) => b.score - a.score);
    
    // Find all moves with the top score (for random tie-breaking)
    const topScore = scoredMoves[0].score;
    const topMoves = scoredMoves.filter(m => m.score === topScore);
    
    // Pick randomly among top-scoring moves
    const chosen = this.pickRandom(topMoves);
    
    this.log(`[Bot] Best move: (${chosen.move.row}, ${chosen.move.col}) ${chosen.move.pieceType} - Score: ${chosen.score.toFixed(1)} (${topMoves.length} tied)`);
    return chosen.move;
  }

  // Evaluate a single move using minimax
  private evaluateMoveWithTree(state: GameState, move: Move, depth: number): number {
    // Apply the move
    const sim = simulateMove(state, move.row, move.col, move.pieceType, this.color);
    
    if (!sim.valid) {
      return -Infinity;
    }

    // If this move wins, return very high score
    if (sim.wins) {
      return 10000;
    }

    // Build the resulting state
    const resultingState = this.buildResultingState(state, sim, this.color);
    
    // Run negamax from opponent's perspective
    const opponentColor = getOpponentColor(this.color);
    const score = -this.negamax(resultingState, depth - 1, opponentColor, -Infinity, Infinity);
    
    return score;
  }

  // Negamax with alpha-beta pruning
  private negamax(
    state: GameState,
    depth: number,
    currentPlayer: PlayerColor,
    alpha: number,
    beta: number
  ): number {
    // Base case: depth 0 or game over
    if (depth <= 0 || state.phase === 'finished') {
      // Evaluate from current player's perspective
      return this.evaluateBoard(state, currentPlayer);
    }

    const moves = getAllValidMoves(state, currentPlayer);
    
    if (moves.length === 0) {
      return this.evaluateBoard(state, currentPlayer);
    }

    let bestScore = -Infinity;

    for (const move of moves) {
      const sim = simulateMove(state, move.row, move.col, move.pieceType, currentPlayer);
      
      if (!sim.valid) continue;

      // Check for immediate win
      if (sim.wins) {
        return 10000; // Winning is best
      }

      const resultingState = this.buildResultingState(state, sim, currentPlayer);
      const opponent = getOpponentColor(currentPlayer);
      
      // Recursively evaluate
      const score = -this.negamax(resultingState, depth - 1, opponent, -beta, -alpha);
      
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, score);
      
      // Alpha-beta pruning
      if (alpha >= beta) {
        break;
      }
    }

    return bestScore;
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
    // First few cats are very valuable, additional cats less so
    const ourPlayer = state.players[forPlayer];
    const oppPlayer = state.players[opponent];
    
    if (ourPlayer && oppPlayer) {
      // Count total cats (in pool + on board)
      const ourCatsOnBoard = this.countCatsOnBoard(state.board, forPlayer);
      const oppCatsOnBoard = this.countCatsOnBoard(state.board, opponent);
      const ourTotalCats = ourPlayer.catsInPool + ourCatsOnBoard;
      const oppTotalCats = oppPlayer.catsInPool + oppCatsOnBoard;
      
      // Diminishing returns: 1st cat = 25pts, 2nd = 20pts, 3rd = 15pts, 4th+ = 8pts
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
  // 1st cat = 25pts, 2nd = 20pts, 3rd = 15pts, 4th+ = 8pts each
  private catValueWithDiminishing(catCount: number): number {
    if (catCount <= 0) return 0;
    
    let value = 0;
    const catValues = [25, 20, 15]; // First 3 cats have high value
    
    for (let i = 0; i < catCount; i++) {
      if (i < catValues.length) {
        value += catValues[i];
      } else {
        value += 8; // 4th cat onwards
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
}

// Factory function to create bot
export function createBot(color: PlayerColor, config?: Partial<BotConfig>): BotAI {
  const fullConfig = { ...DEFAULT_BOT_CONFIG, ...config };
  return new BotAI(color, fullConfig);
}
