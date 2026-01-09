// Shared types between client and server

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

export type Board = (Piece | null)[][];

export interface PlayerState {
  color: PlayerColor;
  kittensInPool: number;
  catsInPool: number;
  kittensRetired: number;
  socketId: string;
  name: string;
  connected: boolean;
}

export interface GameState {
  board: Board;
  players: {
    orange: PlayerState | null;
    gray: PlayerState | null;
  };
  currentTurn: PlayerColor;
  phase: 'waiting' | 'playing' | 'finished';
  winner: PlayerColor | null;
  lastMove: Cell | null;
  boopedPieces: { from: Cell; to: Cell | null }[];
  graduatedPieces: Cell[];
}

export interface RoomInfo {
  roomCode: string;
  roomId: string;
  playerColor: PlayerColor;
}

export interface GameUpdate {
  gameState: GameState;
  lastMove?: { row: number; col: number; pieceType: PieceType };
  boopedPieces: { from: Cell; to: Cell | null }[];
  graduatedPieces: Cell[];
  newCatsEarned: number;
}

export interface GameOverInfo {
  winner: PlayerColor;
  winCondition: 'three_cats_in_row' | 'all_eight_cats';
  gameState: GameState;
}

export type GameScreen = 'lobby' | 'waiting' | 'playing' | 'gameover';
