// Local Game Simulator for Bot AI
// This is a client-side port of the server's GameState logic for move simulation

import { Board, Piece, PlayerColor, PieceType, PlayerState, GameState, Cell } from '../types';
import { Move, SimulationResult } from './types';

const BOARD_SIZE = 6;
const STARTING_KITTENS = 8;
const MAX_CATS = 8;

// Directions for checking adjacency (including diagonals)
const DIRECTIONS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],          [0, 1],
  [1, -1],  [1, 0], [1, 1]
];

// Line directions for checking three in a row
const LINE_DIRECTIONS: [number, number][] = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal down-right
  [1, -1]   // diagonal down-left
];

// Deep clone a board
export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

// Deep clone game state
export function cloneGameState(state: GameState): GameState {
  return {
    board: cloneBoard(state.board),
    players: {
      orange: state.players.orange ? { ...state.players.orange } : null,
      gray: state.players.gray ? { ...state.players.gray } : null,
    },
    currentTurn: state.currentTurn,
    phase: state.phase,
    winner: state.winner,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    boopedPieces: [...state.boopedPieces],
    graduatedPieces: [...state.graduatedPieces],
  };
}

// Create empty board
export function createEmptyBoard(): Board {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
}

// Create initial game state for bot game
export function createInitialGameState(playerName: string = 'Player', botName: string = 'Bot'): GameState {
  return {
    board: createEmptyBoard(),
    players: {
      orange: {
        color: 'orange',
        kittensInPool: STARTING_KITTENS,
        catsInPool: 0,
        kittensRetired: 0,
        socketId: 'local-player',
        name: playerName,
        connected: true,
      },
      gray: {
        color: 'gray',
        kittensInPool: STARTING_KITTENS,
        catsInPool: 0,
        kittensRetired: 0,
        socketId: 'local-bot',
        name: botName,
        connected: true,
      },
    },
    currentTurn: 'orange',
    phase: 'playing',
    winner: null,
    lastMove: null,
    boopedPieces: [],
    graduatedPieces: [],
  };
}

// Check if position is valid
export function isValidPosition(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// Get piece at position
export function getPiece(board: Board, row: number, col: number): Piece | null {
  if (!isValidPosition(row, col)) return null;
  return board[row][col];
}

// Get all empty cells (valid moves)
export function getAllEmptyCells(board: Board): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] === null) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

// Get all valid moves for a player
export function getAllValidMoves(state: GameState, color: PlayerColor): Move[] {
  const player = state.players[color];
  if (!player) return [];
  
  const emptyCells = getAllEmptyCells(state.board);
  const moves: Move[] = [];
  
  for (const cell of emptyCells) {
    if (player.kittensInPool > 0) {
      moves.push({ row: cell.row, col: cell.col, pieceType: 'kitten' });
    }
    if (player.catsInPool > 0) {
      moves.push({ row: cell.row, col: cell.col, pieceType: 'cat' });
    }
  }
  
  return moves;
}

// Execute boop mechanic (returns updated board and info)
function executeBoop(
  board: Board,
  placedRow: number,
  placedCol: number,
  placedPiece: Piece,
  players: { orange: PlayerState | null; gray: PlayerState | null }
): { board: Board; boopedPieces: { from: Cell; to: Cell | null }[] } {
  const newBoard = cloneBoard(board);
  const boopedPieces: { from: Cell; to: Cell | null }[] = [];
  const placedType = placedPiece.type;

  for (const [dRow, dCol] of DIRECTIONS) {
    const adjRow = placedRow + dRow;
    const adjCol = placedCol + dCol;
    const adjPiece = getPiece(newBoard, adjRow, adjCol);

    if (!adjPiece) continue;

    // Kittens cannot boop cats
    if (placedType === 'kitten' && adjPiece.type === 'cat') {
      continue;
    }

    // Calculate destination
    const destRow = adjRow + dRow;
    const destCol = adjCol + dCol;

    // Check if destination is blocked by another piece
    if (isValidPosition(destRow, destCol) && newBoard[destRow][destCol] !== null) {
      continue;
    }

    // Execute the boop
    newBoard[adjRow][adjCol] = null;

    if (isValidPosition(destRow, destCol)) {
      // Move to new position
      newBoard[destRow][destCol] = adjPiece;
      boopedPieces.push({
        from: { row: adjRow, col: adjCol },
        to: { row: destRow, col: destCol }
      });
    } else {
      // Pushed off the board - return to owner's pool
      const owner = players[adjPiece.color];
      if (owner) {
        if (adjPiece.type === 'kitten') {
          owner.kittensInPool++;
        } else {
          owner.catsInPool++;
        }
      }
      boopedPieces.push({
        from: { row: adjRow, col: adjCol },
        to: null
      });
    }
  }

  return { board: newBoard, boopedPieces };
}

// Get a line of consecutive pieces from a position
function getLineFromPosition(
  board: Board,
  startRow: number,
  startCol: number,
  dRow: number,
  dCol: number,
  playerColor: PlayerColor
): Cell[] {
  const line: Cell[] = [];
  let row = startRow;
  let col = startCol;

  while (isValidPosition(row, col)) {
    const piece = board[row][col];
    if (piece && piece.color === playerColor) {
      line.push({ row, col });
      row += dRow;
      col += dCol;
    } else {
      break;
    }
  }

  return line;
}

// Find all lines of 3+ pieces for a player (with at least one kitten)
export function findLinesOfThree(board: Board, playerColor: PlayerColor): Cell[][] {
  const lines: Cell[][] = [];
  const found = new Set<string>(); // Avoid duplicates

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const [dRow, dCol] of LINE_DIRECTIONS) {
        const line = getLineFromPosition(board, row, col, dRow, dCol, playerColor);
        if (line.length >= 3) {
          // Check if any are kittens
          const hasKitten = line.some(cell => {
            const piece = board[cell.row][cell.col];
            return piece && piece.type === 'kitten';
          });
          if (hasKitten) {
            const key = line.slice(0, 3).map(c => `${c.row},${c.col}`).sort().join('|');
            if (!found.has(key)) {
              found.add(key);
              lines.push(line.slice(0, 3));
            }
          }
        }
      }
    }
  }

  return lines;
}

// Find lines of 3 cats (win condition)
export function findCatLines(board: Board, playerColor: PlayerColor): Cell[][] {
  const lines: Cell[][] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const [dRow, dCol] of LINE_DIRECTIONS) {
        let count = 0;
        const line: Cell[] = [];
        
        for (let i = 0; i < 3; i++) {
          const r = row + i * dRow;
          const c = col + i * dCol;
          
          if (!isValidPosition(r, c)) break;
          
          const piece = board[r][c];
          if (piece && piece.color === playerColor && piece.type === 'cat') {
            count++;
            line.push({ row: r, col: c });
          } else {
            break;
          }
        }
        
        if (count === 3) {
          lines.push(line);
        }
      }
    }
  }

  return lines;
}

// Count pieces on board for a player
export function countPiecesOnBoard(board: Board, playerColor: PlayerColor): { total: number; kittens: number; cats: number } {
  let kittens = 0;
  let cats = 0;
  
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (piece && piece.color === playerColor) {
        if (piece.type === 'kitten') kittens++;
        else cats++;
      }
    }
  }
  
  return { total: kittens + cats, kittens, cats };
}

// Find all unique graduation options (3-in-a-row combinations)
export function findGraduationOptions(board: Board, playerColor: PlayerColor): Cell[][] {
  const options: Cell[][] = [];
  const seen = new Set<string>();

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const [dRow, dCol] of LINE_DIRECTIONS) {
        const line: Cell[] = [];
        let r = row;
        let c = col;

        while (isValidPosition(r, c)) {
          const piece = board[r][c];
          if (piece && piece.color === playerColor) {
            line.push({ row: r, col: c });
            r += dRow;
            c += dCol;
          } else {
            break;
          }
        }
        
        if (line.length >= 3) {
          // Check if any are kittens
          const hasKitten = line.some(cell => {
            const piece = board[cell.row][cell.col];
            return piece && piece.type === 'kitten';
          });
          
          if (!hasKitten) continue;

          // For lines of 4+, we need to offer multiple options
          for (let i = 0; i <= line.length - 3; i++) {
            const option = line.slice(i, i + 3);
            const optionHasKitten = option.some(cell => {
              const piece = board[cell.row][cell.col];
              return piece && piece.type === 'kitten';
            });
            
            if (optionHasKitten) {
              const key = option
                .map(c => `${c.row},${c.col}`)
                .sort()
                .join('|');
              
              if (!seen.has(key)) {
                seen.add(key);
                options.push(option);
              }
            }
          }
        }
      }
    }
  }

  return options;
}

// Execute a specific graduation option
function executeGraduationOption(
  board: Board,
  option: Cell[],
  player: PlayerState
): { board: Board; graduatedPieces: Cell[]; catsEarned: number } {
  const newBoard = cloneBoard(board);
  const graduatedPieces: Cell[] = [];
  let catsEarned = 0;

  for (const cell of option) {
    const piece = newBoard[cell.row][cell.col];
    if (piece) {
      newBoard[cell.row][cell.col] = null;
      graduatedPieces.push(cell);

      if (piece.type === 'kitten') {
        player.kittensRetired++;
        player.catsInPool++;
        catsEarned++;
      } else {
        player.catsInPool++;
      }
    }
  }

  return { board: newBoard, graduatedPieces, catsEarned };
}

// Check and execute graduation
function checkAndExecuteGraduation(
  board: Board,
  player: PlayerState,
  playerColor: PlayerColor
): { board: Board; graduatedPieces: Cell[]; catsEarned: number; pendingOptions?: Cell[][] } {
  const newBoard = cloneBoard(board);

  // Find all unique graduation options
  const options = findGraduationOptions(newBoard, playerColor);

  if (options.length === 0) {
    // Check if all 8 pieces are on board
    const piecesOnBoard = countPiecesOnBoard(newBoard, playerColor);
    if (piecesOnBoard.total >= 8 && player.kittensRetired + player.catsInPool < MAX_CATS) {
      // Find a kitten to graduate
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const piece = newBoard[row][col];
          if (piece && piece.color === playerColor && piece.type === 'kitten') {
            newBoard[row][col] = null;
            player.kittensRetired++;
            player.catsInPool++;
            return { board: newBoard, graduatedPieces: [{ row, col }], catsEarned: 1 };
          }
        }
      }
    }
    return { board: newBoard, graduatedPieces: [], catsEarned: 0 };
  }

  // If only one option, auto-select it
  if (options.length === 1) {
    return executeGraduationOption(newBoard, options[0], player);
  }

  // Multiple options - return them for player to choose
  return { board: newBoard, graduatedPieces: [], catsEarned: 0, pendingOptions: options };
}

// Check win condition
function checkWinCondition(
  board: Board,
  playerColor: PlayerColor
): 'three_cats_in_row' | 'all_eight_cats' | null {
  // Check for 3 cats in a row
  const catLines = findCatLines(board, playerColor);
  if (catLines.length > 0) {
    return 'three_cats_in_row';
  }

  // Check for all 8 cats on board
  const counts = countPiecesOnBoard(board, playerColor);
  if (counts.cats >= 8) {
    return 'all_eight_cats';
  }

  return null;
}

// Simulate a move and return the result
export function simulateMove(
  state: GameState,
  row: number,
  col: number,
  pieceType: PieceType,
  color: PlayerColor
): SimulationResult {
  // Validate position is empty
  if (!isValidPosition(row, col) || state.board[row][col] !== null) {
    return {
      valid: false,
      newBoard: state.board,
      boopedPieces: [],
      graduatedPieces: [],
      wins: false,
      createsGraduation: false,
      newKittensInPool: state.players[color]?.kittensInPool || 0,
      newCatsInPool: state.players[color]?.catsInPool || 0,
    };
  }

  const player = state.players[color];
  if (!player) {
    return {
      valid: false,
      newBoard: state.board,
      boopedPieces: [],
      graduatedPieces: [],
      wins: false,
      createsGraduation: false,
      newKittensInPool: 0,
      newCatsInPool: 0,
    };
  }

  // Check if player has the piece type
  if (pieceType === 'kitten' && player.kittensInPool <= 0) {
    return {
      valid: false,
      newBoard: state.board,
      boopedPieces: [],
      graduatedPieces: [],
      wins: false,
      createsGraduation: false,
      newKittensInPool: player.kittensInPool,
      newCatsInPool: player.catsInPool,
    };
  }
  if (pieceType === 'cat' && player.catsInPool <= 0) {
    return {
      valid: false,
      newBoard: state.board,
      boopedPieces: [],
      graduatedPieces: [],
      wins: false,
      createsGraduation: false,
      newKittensInPool: player.kittensInPool,
      newCatsInPool: player.catsInPool,
    };
  }

  // Clone for simulation
  const simPlayers = {
    orange: state.players.orange ? { ...state.players.orange } : null,
    gray: state.players.gray ? { ...state.players.gray } : null,
  };
  const simPlayer = simPlayers[color]!;

  // Place the piece
  let simBoard = cloneBoard(state.board);
  const newPiece: Piece = { color, type: pieceType };
  simBoard[row][col] = newPiece;

  // Deduct from pool
  if (pieceType === 'kitten') {
    simPlayer.kittensInPool--;
  } else {
    simPlayer.catsInPool--;
  }

  // Execute booping
  const boopResult = executeBoop(simBoard, row, col, newPiece, simPlayers);
  simBoard = boopResult.board;

  // Check for graduation
  const gradResult = checkAndExecuteGraduation(simBoard, simPlayer, color);
  simBoard = gradResult.board;

  // Check for win
  const winResult = checkWinCondition(simBoard, color);

  return {
    valid: true,
    newBoard: simBoard,
    boopedPieces: boopResult.boopedPieces,
    graduatedPieces: gradResult.graduatedPieces,
    wins: winResult !== null,
    winCondition: winResult || undefined,
    createsGraduation: gradResult.graduatedPieces.length > 0,
    newKittensInPool: simPlayer.kittensInPool,
    newCatsInPool: simPlayer.catsInPool,
  };
}

// Execute a move and return new game state (for actual game play)
export function executeMove(
  state: GameState,
  row: number,
  col: number,
  pieceType: PieceType,
  color: PlayerColor
): { newState: GameState; valid: boolean; error?: string } {
  // Validate turn
  if (state.currentTurn !== color) {
    return { newState: state, valid: false, error: 'Not your turn' };
  }

  if (state.phase !== 'playing') {
    return { newState: state, valid: false, error: 'Game not in playing phase' };
  }

  // Clone state and player
  const newState = cloneGameState(state);
  const player = newState.players[color]!;

  // Validate position is empty
  if (!isValidPosition(row, col) || newState.board[row][col] !== null) {
    return { newState: state, valid: false, error: 'Invalid position' };
  }

  // Validate player has the piece type
  if (pieceType === 'kitten' && player.kittensInPool <= 0) {
    return { newState: state, valid: false, error: 'No kittens available' };
  }
  if (pieceType === 'cat' && player.catsInPool <= 0) {
    return { newState: state, valid: false, error: 'No cats available' };
  }

  // Place the piece
  const newPiece: Piece = { color, type: pieceType };
  newState.board[row][col] = newPiece;

  // Deduct from pool
  if (pieceType === 'kitten') {
    player.kittensInPool--;
  } else {
    player.catsInPool--;
  }

  newState.lastMove = { row, col };

  // Execute booping
  const boopResult = executeBoop(newState.board, row, col, newPiece, newState.players);
  newState.board = boopResult.board;
  newState.boopedPieces = boopResult.boopedPieces;

  // Check for graduation
  const gradResult = checkAndExecuteGraduation(newState.board, player, color);
  newState.board = gradResult.board;
  newState.graduatedPieces = gradResult.graduatedPieces;

  // If there are pending graduation options, enter selection phase
  if (gradResult.pendingOptions && gradResult.pendingOptions.length > 1) {
    newState.phase = 'selecting_graduation';
    newState.pendingGraduationOptions = gradResult.pendingOptions;
    newState.pendingGraduationPlayer = color;
    // Don't switch turns yet
    return { newState, valid: true };
  }

  // Check for win
  const winResult = checkWinCondition(newState.board, color);
  if (winResult) {
    newState.phase = 'finished';
    newState.winner = color;
  } else {
    // Switch turns
    newState.currentTurn = color === 'orange' ? 'gray' : 'orange';
  }

  return { newState, valid: true };
}

// Find lines of 2 pieces (for scoring potential threats)
export function findLinesOfTwo(board: Board, playerColor: PlayerColor, pieceType?: PieceType): Cell[][] {
  const lines: Cell[][] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const [dRow, dCol] of LINE_DIRECTIONS) {
        const cells: Cell[] = [];
        let emptyCount = 0;
        let pieceCount = 0;
        
        for (let i = 0; i < 3; i++) {
          const r = row + i * dRow;
          const c = col + i * dCol;
          
          if (!isValidPosition(r, c)) break;
          
          const piece = board[r][c];
          if (piece === null) {
            emptyCount++;
            cells.push({ row: r, col: c });
          } else if (piece.color === playerColor && (!pieceType || piece.type === pieceType)) {
            pieceCount++;
            cells.push({ row: r, col: c });
          } else {
            break;
          }
        }
        
        // Found 2 pieces + 1 empty = potential line
        if (pieceCount === 2 && emptyCount === 1 && cells.length === 3) {
          lines.push(cells);
        }
      }
    }
  }

  return lines;
}

// Get opponent color
export function getOpponentColor(color: PlayerColor): PlayerColor {
  return color === 'orange' ? 'gray' : 'orange';
}
