// Bot-specific types

import { PieceType, Cell, Board } from '../types';

export interface Move {
  row: number;
  col: number;
  pieceType: PieceType;
}

export interface ScoredMove extends Move {
  score: number;
  reason: string; // For debugging/display
}

export interface SimulationResult {
  valid: boolean;
  newBoard: Board;
  boopedPieces: { from: Cell; to: Cell | null }[];
  graduatedPieces: Cell[];
  wins: boolean;
  winCondition?: 'three_cats_in_row' | 'all_eight_cats';
  createsGraduation: boolean;
  newKittensInPool: number;
  newCatsInPool: number;
}

export interface ThreatAnalysis {
  winningMoves: Move[];           // Moves that win the game
  graduationMoves: Move[];        // Moves that create graduation
  twoInRowCatMoves: Move[];       // Moves that create 2 cats in a row
  twoInRowKittenMoves: Move[];    // Moves that create 2 kittens in a row
}

export interface BotConfig {
  // Tree search settings
  searchDepth: number;            // How many moves to look ahead (2-3 recommended)
  
  // Static board evaluation weights (for tree search)
  pieceInCenter: number;          // Bonus for pieces in center 4 squares
  pieceInInnerRing: number;       // Bonus for pieces in inner ring (not center, not edge)
  pieceOnEdge: number;            // Penalty for pieces on edge
  pieceInCorner: number;          // Extra penalty for corner pieces
  catMultiplier: number;          // Cats worth this much more than kittens
  ownPieceBoopedOff: number;      // Penalty when our piece gets booped off
  oppPieceBoopedOff: number;      // Bonus when opponent piece gets booped off
  
  // Threat evaluation
  twoInRowCats: number;           // Bonus for 2 cats in a row (one away from win)
  twoInRowKittens: number;        // Bonus for 2 kittens in a row
  
  // Timing & Output
  thinkingDelayMs: number;
  silent: boolean;                // Suppress console output (for tournaments)
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  // Tree search - depth 2 = look at our move + opponent response
  searchDepth: 2,
  
  // Position values (per piece)
  pieceInCenter: 15,
  pieceInInnerRing: 8,
  pieceOnEdge: -5,
  pieceInCorner: -12,
  catMultiplier: 1.5,
  ownPieceBoopedOff: -20,
  oppPieceBoopedOff: 25,
  
  // Threat values
  twoInRowCats: 30,
  twoInRowKittens: 12,
  
  thinkingDelayMs: 800,
  silent: false,
};

// Board positions categorized
export const CENTER_POSITIONS: Cell[] = [
  { row: 2, col: 2 }, { row: 2, col: 3 },
  { row: 3, col: 2 }, { row: 3, col: 3 },
];

export const EDGE_POSITIONS: Cell[] = [];
for (let i = 0; i < 6; i++) {
  EDGE_POSITIONS.push({ row: 0, col: i }); // Top edge
  EDGE_POSITIONS.push({ row: 5, col: i }); // Bottom edge
  if (i > 0 && i < 5) {
    EDGE_POSITIONS.push({ row: i, col: 0 }); // Left edge
    EDGE_POSITIONS.push({ row: i, col: 5 }); // Right edge
  }
}

export const CORNER_POSITIONS: Cell[] = [
  { row: 0, col: 0 }, { row: 0, col: 5 },
  { row: 5, col: 0 }, { row: 5, col: 5 },
];
