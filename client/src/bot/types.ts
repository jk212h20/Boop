// Bot-specific types

import { PieceType, Cell, PlayerColor, GameState, Piece, Board } from '../types';

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
  // Tier 5 scoring weights
  twoInRowCats: number;
  twoInRowKittens: number;
  knocksOpponentOff: number;
  knocksOpponentToEdge: number;
  centerControl: number;
  edgePosition: number;
  createsTwoWayThreat: number;
  
  // Timing
  thinkingDelayMs: number;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  twoInRowCats: 30,
  twoInRowKittens: 15,
  knocksOpponentOff: 25,
  knocksOpponentToEdge: 10,
  centerControl: 10,
  edgePosition: -5,
  createsTwoWayThreat: 20,
  thinkingDelayMs: 800,
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
