// Bot AI Decision Engine
// Implements priority cascade + additive scoring for Tier 5

import { GameState, PlayerColor, Board, Cell, PieceType } from '../types';
import { Move, ScoredMove, BotConfig, DEFAULT_BOT_CONFIG, CENTER_POSITIONS } from './types';
import {
  getAllValidMoves,
  simulateMove,
  findLinesOfTwo,
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

    // TIER 1: Find winning moves
    const winningMoves = this.findWinningMoves(state, allMoves);
    if (winningMoves.length > 0) {
      console.log('[Bot] Tier 1: Taking winning move');
      return this.pickRandom(winningMoves);
    }

    // TIER 2: Block opponent's winning moves
    const blockingMoves = this.findBlockingMoves(state, allMoves);
    if (blockingMoves.length > 0) {
      console.log('[Bot] Tier 2: Blocking opponent win');
      return this.pickRandom(blockingMoves);
    }

    // TIER 3: Create graduation (3 kittens in a row)
    const graduationMoves = this.findGraduationMoves(state, allMoves);
    if (graduationMoves.length > 0) {
      console.log('[Bot] Tier 3: Creating graduation');
      return this.pickBestScored(graduationMoves);
    }

    // TIER 4: Block opponent's graduation
    const blockGraduationMoves = this.findBlockGraduationMoves(state, allMoves);
    if (blockGraduationMoves.length > 0) {
      console.log('[Bot] Tier 4: Blocking opponent graduation');
      return this.pickRandom(blockGraduationMoves);
    }

    // TIER 5: Score all moves with additive scoring
    console.log('[Bot] Tier 5: Using positional scoring');
    const scoredMoves = this.scoreAllMoves(state, allMoves);
    return this.pickBestScored(scoredMoves);
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

  // TIER 3: Find moves that create graduation (3 kittens/cats in a row for us)
  private findGraduationMoves(state: GameState, moves: Move[]): ScoredMove[] {
    const graduation: ScoredMove[] = [];
    
    for (const move of moves) {
      const sim = simulateMove(state, move.row, move.col, move.pieceType, this.color);
      if (sim.valid && sim.createsGraduation) {
        graduation.push({
          ...move,
          score: move.pieceType === 'kitten' ? 100 : 50, // Prefer kitten graduations
          reason: 'Creates graduation',
        });
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

  // TIER 5: Score all moves with additive positional scoring
  private scoreAllMoves(state: GameState, moves: Move[]): ScoredMove[] {
    const scored: ScoredMove[] = [];
    const opponentColor = getOpponentColor(this.color);
    
    for (const move of moves) {
      let score = 0;
      const reasons: string[] = [];
      
      const sim = simulateMove(state, move.row, move.col, move.pieceType, this.color);
      if (!sim.valid) continue;
      
      // Check for 2-in-a-row cats after this move
      const catLines = this.countTwoInRow(sim.newBoard, this.color, 'cat');
      if (catLines > 0) {
        score += catLines * this.config.twoInRowCats;
        reasons.push(`+${catLines * this.config.twoInRowCats} (${catLines} two-in-row cats)`);
      }
      
      // Check for 2-in-a-row kittens after this move
      const kittenLines = this.countTwoInRow(sim.newBoard, this.color, 'kitten');
      if (kittenLines > 0) {
        score += kittenLines * this.config.twoInRowKittens;
        reasons.push(`+${kittenLines * this.config.twoInRowKittens} (${kittenLines} two-in-row kittens)`);
      }
      
      // Check if we knocked opponent pieces off the board
      const knockedOff = sim.boopedPieces.filter(bp => {
        if (bp.to === null) {
          // Check if the piece was opponent's
          const piece = state.board[bp.from.row][bp.from.col];
          return piece && piece.color === opponentColor;
        }
        return false;
      }).length;
      
      if (knockedOff > 0) {
        score += knockedOff * this.config.knocksOpponentOff;
        reasons.push(`+${knockedOff * this.config.knocksOpponentOff} (knocked ${knockedOff} off)`);
      }
      
      // Check if we knocked opponent to edge
      const knockedToEdge = sim.boopedPieces.filter(bp => {
        if (bp.to !== null) {
          const piece = sim.newBoard[bp.to.row][bp.to.col];
          if (piece && piece.color === opponentColor) {
            return this.isEdgePosition(bp.to.row, bp.to.col);
          }
        }
        return false;
      }).length;
      
      if (knockedToEdge > 0) {
        score += knockedToEdge * this.config.knocksOpponentToEdge;
        reasons.push(`+${knockedToEdge * this.config.knocksOpponentToEdge} (pushed ${knockedToEdge} to edge)`);
      }
      
      // Position scoring
      if (this.isCenterPosition(move.row, move.col)) {
        score += this.config.centerControl;
        reasons.push(`+${this.config.centerControl} (center control)`);
      }
      
      if (this.isEdgePosition(move.row, move.col)) {
        score += this.config.edgePosition;
        reasons.push(`${this.config.edgePosition} (edge position)`);
      }
      
      // Check for creating two-way threats
      const twoWayThreats = this.countTwoWayThreats(sim.newBoard, this.color);
      if (twoWayThreats > 0) {
        score += twoWayThreats * this.config.createsTwoWayThreat;
        reasons.push(`+${twoWayThreats * this.config.createsTwoWayThreat} (${twoWayThreats} two-way threats)`);
      }
      
      // Slight preference for cats over kittens in late game
      const player = state.players[this.color];
      if (player && player.catsInPool > 0 && move.pieceType === 'cat') {
        score += 5;
        reasons.push('+5 (prefer cat)');
      }
      
      scored.push({
        ...move,
        score,
        reason: reasons.length > 0 ? reasons.join(', ') : 'base move',
      });
    }
    
    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
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

  // Count two-way threats (multiple winning paths)
  private countTwoWayThreats(board: Board, color: PlayerColor): number {
    // A two-way threat is when we have multiple 2-in-a-row cats
    // that opponent cannot block both
    const catLines = findLinesOfTwo(board, color, 'cat');
    
    // Count cells that appear in multiple lines
    const cellCounts = new Map<string, number>();
    for (const line of catLines) {
      for (const cell of line) {
        const key = `${cell.row},${cell.col}`;
        const piece = board[cell.row][cell.col];
        if (piece === null) {
          // This is the empty cell that could complete the line
          cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
        }
      }
    }
    
    // If multiple lines share the same completion cell, that's not a two-way threat
    // A true two-way threat has different completion cells
    let threats = 0;
    if (catLines.length >= 2) {
      threats = Math.min(catLines.length - 1, 2); // Cap at 2
    }
    
    return threats;
  }

  // Position helpers
  private isCenterPosition(row: number, col: number): boolean {
    return CENTER_POSITIONS.some(p => p.row === row && p.col === col);
  }

  private isEdgePosition(row: number, col: number): boolean {
    return row === 0 || row === 5 || col === 0 || col === 5;
  }

  // Random selection from array
  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  // Pick best from scored moves (with some randomness among top scores)
  private pickBestScored(moves: ScoredMove[]): Move {
    if (moves.length === 0) {
      throw new Error('No moves to pick from');
    }
    
    // Sort by score descending
    const sorted = [...moves].sort((a, b) => b.score - a.score);
    
    // Get all moves with the top score
    const topScore = sorted[0].score;
    const topMoves = sorted.filter(m => m.score === topScore);
    
    // Pick randomly among top scorers
    const chosen = this.pickRandom(topMoves);
    console.log(`[Bot] Chose: (${chosen.row}, ${chosen.col}) ${chosen.pieceType} - Score: ${chosen.score} - ${chosen.reason}`);
    
    return {
      row: chosen.row,
      col: chosen.col,
      pieceType: chosen.pieceType,
    };
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
