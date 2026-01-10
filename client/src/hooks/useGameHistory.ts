import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, MoveRecord, Board, PlayerColor, PieceType, BoopEffect, GraduationEffect, Cell } from '../types';
import { cloneBoard } from '../bot/LocalGame';

interface UseGameHistoryReturn {
  // History data
  history: MoveRecord[];
  currentMoveIndex: number;  // -1 = initial state, 0+ = after move N
  
  // Navigation
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  goBack: () => void;
  goForward: () => void;
  
  // State for current view
  isViewingHistory: boolean;  // True if not at latest move
  viewingBoard: Board;        // Board at current view position
  viewingMove: MoveRecord | null;  // The move at current position (null if at start)
  
  // Recording
  recordMove: (
    boardBefore: Board,
    boardAfter: Board,
    player: PlayerColor,
    placement: { row: number; col: number; pieceType: PieceType },
    boops: BoopEffect[],
    graduatedPieces: Cell[],
    playersBefore: { orange: { kittensInPool: number; catsInPool: number }; gray: { kittensInPool: number; catsInPool: number } },
    playersAfter: { orange: { kittensInPool: number; catsInPool: number }; gray: { kittensInPool: number; catsInPool: number } }
  ) => void;
  
  // Reset
  clearHistory: () => void;
}

export function useGameHistory(initialBoard?: Board): UseGameHistoryReturn {
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  
  // Store the initial board state (before any moves)
  const initialBoardRef = useRef<Board>(
    initialBoard || Array(6).fill(null).map(() => Array(6).fill(null))
  );
  
  // Update initial board when a new game starts
  useEffect(() => {
    if (initialBoard) {
      initialBoardRef.current = cloneBoard(initialBoard);
    }
  }, [initialBoard]);
  
  // Computed values
  const isViewingHistory = currentMoveIndex < history.length - 1;
  
  const viewingBoard = currentMoveIndex === -1
    ? initialBoardRef.current
    : currentMoveIndex < history.length
      ? history[currentMoveIndex].boardAfter
      : history.length > 0
        ? history[history.length - 1].boardAfter
        : initialBoardRef.current;
  
  const viewingMove = currentMoveIndex >= 0 && currentMoveIndex < history.length
    ? history[currentMoveIndex]
    : null;
  
  // Navigation functions
  const goToMove = useCallback((index: number) => {
    const maxIndex = history.length - 1;
    const clampedIndex = Math.max(-1, Math.min(index, maxIndex));
    setCurrentMoveIndex(clampedIndex);
  }, [history.length]);
  
  const goToStart = useCallback(() => {
    setCurrentMoveIndex(-1);
  }, []);
  
  const goToEnd = useCallback(() => {
    setCurrentMoveIndex(history.length - 1);
  }, [history.length]);
  
  const goBack = useCallback(() => {
    setCurrentMoveIndex(prev => Math.max(-1, prev - 1));
  }, []);
  
  const goForward = useCallback(() => {
    setCurrentMoveIndex(prev => Math.min(history.length - 1, prev + 1));
  }, [history.length]);
  
  // Record a new move
  const recordMove = useCallback((
    boardBefore: Board,
    boardAfter: Board,
    player: PlayerColor,
    placement: { row: number; col: number; pieceType: PieceType },
    boops: BoopEffect[],
    graduatedPieces: Cell[],
    playersBefore: { orange: { kittensInPool: number; catsInPool: number }; gray: { kittensInPool: number; catsInPool: number } },
    playersAfter: { orange: { kittensInPool: number; catsInPool: number }; gray: { kittensInPool: number; catsInPool: number } }
  ) => {
    const newMove: MoveRecord = {
      moveNumber: history.length + 1,
      player,
      placement,
      boops,
      graduations: graduatedPieces.length > 0 
        ? [{ cells: graduatedPieces, player }]
        : [],
      boardBefore: cloneBoard(boardBefore),
      boardAfter: cloneBoard(boardAfter),
      playersBefore: { ...playersBefore },
      playersAfter: { ...playersAfter },
    };
    
    setHistory(prev => [...prev, newMove]);
    // Auto-advance to latest move
    setCurrentMoveIndex(history.length);  // Will be the new length - 1 after state update
  }, [history.length]);
  
  // Clear history (for new game)
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentMoveIndex(-1);
  }, []);
  
  return {
    history,
    currentMoveIndex,
    goToMove,
    goToStart,
    goToEnd,
    goBack,
    goForward,
    isViewingHistory,
    viewingBoard,
    viewingMove,
    recordMove,
    clearHistory,
  };
}

// Helper to format a move for display
export function formatMove(move: MoveRecord): string {
  const colLetters = 'ABCDEF';
  const col = colLetters[move.placement.col];
  const row = move.placement.row + 1;
  const piece = move.placement.pieceType === 'kitten' ? '🐱' : '😼';
  
  let result = `${piece} ${col}${row}`;
  
  if (move.boops.length > 0) {
    const boopedOff = move.boops.filter(b => b.to === null).length;
    const boopedOnBoard = move.boops.length - boopedOff;
    if (boopedOnBoard > 0) {
      result += ` ↔${boopedOnBoard}`;
    }
    if (boopedOff > 0) {
      result += ` ✕${boopedOff}`;
    }
  }
  
  if (move.graduations.length > 0) {
    result += ' 🎓';
  }
  
  return result;
}

// Helper to get cell notation (e.g., "A1", "F6")
export function getCellNotation(row: number, col: number): string {
  const colLetters = 'ABCDEF';
  return `${colLetters[col]}${row + 1}`;
}
