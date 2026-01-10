// Game Types for Boop

export type PlayerColor = 'orange' | 'gray';
export type PieceType = 'kitten' | 'cat';

export interface Piece {
  color: PlayerColor;
  type: PieceType;
}

export interface Cell {
  row: number;
  col: number;
}

export interface BoardCell extends Cell {
  piece: Piece | null;
}

// 6x6 board
export type Board = (Piece | null)[][];

export interface PlayerState {
  color: PlayerColor;
  kittensInPool: number;  // Available kittens to place
  catsInPool: number;     // Available cats to place
  kittensRetired: number; // Kittens that graduated (removed from game)
  socketId: string;
  name: string;
  connected: boolean;
  playerToken?: string;   // Persistent token for reconnection
}

// A boop effect with embedded piece data
export interface BoopEffect {
  from: Cell;
  to: Cell | null; // null means booped off board
  piece: Piece;    // The piece that was booped
}

export interface GameState {
  board: Board;
  players: {
    orange: PlayerState | null;
    gray: PlayerState | null;
  };
  currentTurn: PlayerColor;
  phase: 'waiting' | 'playing' | 'selecting_graduation' | 'finished';
  winner: PlayerColor | null;
  lastMove: Cell | null;
  boopedPieces: BoopEffect[];
  graduatedPieces: Cell[];
  pendingGraduationOptions?: Cell[][]; // Multiple 3-in-a-row options to choose from
  pendingGraduationPlayer?: PlayerColor; // Which player needs to choose
}

export interface MoveResult {
  valid: boolean;
  error?: string;
  boopedPieces: BoopEffect[];
  graduatedPieces: Cell[];
  newCatsEarned: number;
  winner: PlayerColor | null;
  winCondition?: 'three_cats_in_row' | 'all_eight_cats';
  pendingGraduationOptions?: Cell[][]; // If player needs to choose which 3 to graduate
  requiresGraduationChoice?: boolean;
}

export interface GraduationResult {
  valid: boolean;
  error?: string;
  graduatedPieces: Cell[];
  newCatsEarned: number;
  winner: PlayerColor | null;
  winCondition?: 'three_cats_in_row' | 'all_eight_cats';
}

export interface PlacePieceAction {
  row: number;
  col: number;
  pieceType: PieceType;
}

// Directions for checking adjacency (including diagonals)
export const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],          [0, 1],
  [1, -1],  [1, 0], [1, 1]
] as const;

// Line directions for checking three in a row
export const LINE_DIRECTIONS = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal down-right
  [1, -1]   // diagonal down-left
] as const;
