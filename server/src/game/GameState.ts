import {
  Board,
  Piece,
  PlayerColor,
  PieceType,
  PlayerState,
  GameState,
  MoveResult,
  GraduationResult,
  Cell,
  DIRECTIONS,
  LINE_DIRECTIONS
} from './types';

const BOARD_SIZE = 6;
const STARTING_KITTENS = 8;
const MAX_CATS = 8;

export class BoopGame {
  private board: Board;
  private players: { orange: PlayerState | null; gray: PlayerState | null };
  private currentTurn: PlayerColor;
  private phase: 'waiting' | 'playing' | 'selecting_graduation' | 'finished';
  private winner: PlayerColor | null;
  private lastMove: Cell | null;
  private boopedPieces: { from: Cell; to: Cell | null }[];
  private graduatedPieces: Cell[];
  private pendingGraduationOptions: Cell[][] | null;
  private pendingGraduationPlayer: PlayerColor | null;

  constructor() {
    this.board = this.createEmptyBoard();
    this.players = { orange: null, gray: null };
    this.currentTurn = 'orange';
    this.phase = 'waiting';
    this.winner = null;
    this.lastMove = null;
    this.boopedPieces = [];
    this.graduatedPieces = [];
    this.pendingGraduationOptions = null;
    this.pendingGraduationPlayer = null;
  }

  private createEmptyBoard(): Board {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  }

  // Add a player to the game (with optional token for rejoin support)
  addPlayer(socketId: string, name: string, playerToken?: string): PlayerColor | null {
    // Check if either slot is available (disconnected player slot can be taken)
    const orangeAvailable = !this.players.orange || !this.players.orange.connected;
    const grayAvailable = !this.players.gray || !this.players.gray.connected;

    if (!this.players.orange || (!this.players.orange.connected && orangeAvailable)) {
      this.players.orange = {
        color: 'orange',
        kittensInPool: this.players.orange?.kittensInPool ?? STARTING_KITTENS,
        catsInPool: this.players.orange?.catsInPool ?? 0,
        kittensRetired: this.players.orange?.kittensRetired ?? 0,
        socketId,
        name,
        connected: true,
        playerToken
      };
      // If gray is already connected, start the game
      if (this.players.gray?.connected) {
        this.phase = 'playing';
      }
      return 'orange';
    } else if (!this.players.gray || (!this.players.gray.connected && grayAvailable)) {
      this.players.gray = {
        color: 'gray',
        kittensInPool: this.players.gray?.kittensInPool ?? STARTING_KITTENS,
        catsInPool: this.players.gray?.catsInPool ?? 0,
        kittensRetired: this.players.gray?.kittensRetired ?? 0,
        socketId,
        name,
        connected: true,
        playerToken
      };
      // Both players joined and connected, start the game
      if (this.players.orange?.connected) {
        this.phase = 'playing';
      }
      return 'gray';
    }
    return null; // Game is full with both connected
  }

  // Disconnect a player (soft - keeps slot reserved for rejoin)
  disconnectPlayer(socketId: string): PlayerColor | null {
    if (this.players.orange?.socketId === socketId) {
      this.players.orange.connected = false;
      return 'orange';
    } else if (this.players.gray?.socketId === socketId) {
      this.players.gray.connected = false;
      return 'gray';
    }
    return null;
  }

  // Remove a player from the game (hard - clears their slot)
  removePlayer(socketId: string): PlayerColor | null {
    if (this.players.orange?.socketId === socketId) {
      const color = 'orange';
      this.players.orange = null;
      return color;
    } else if (this.players.gray?.socketId === socketId) {
      const color = 'gray';
      this.players.gray = null;
      return color;
    }
    return null;
  }

  // Rejoin a player by token to a specific color slot
  rejoinPlayer(socketId: string, playerToken: string, color: 'orange' | 'gray'): boolean {
    const player = this.players[color];
    if (!player) return false;
    
    // Verify token matches or slot is reserved for this token
    if (player.playerToken !== playerToken) return false;
    
    player.socketId = socketId;
    player.connected = true;
    
    // Resume game if both players connected
    if (this.players.orange?.connected && this.players.gray?.connected) {
      if (this.phase === 'waiting') {
        this.phase = 'playing';
      }
    }
    
    return true;
  }

  // Get player color by token
  getPlayerColorByToken(playerToken: string): PlayerColor | null {
    if (this.players.orange?.playerToken === playerToken) return 'orange';
    if (this.players.gray?.playerToken === playerToken) return 'gray';
    return null;
  }

  // Update player socket ID (for reconnection)
  updatePlayerSocket(playerToken: string, newSocketId: string): boolean {
    if (this.players.orange?.playerToken === playerToken) {
      this.players.orange.socketId = newSocketId;
      this.players.orange.connected = true;
      return true;
    }
    if (this.players.gray?.playerToken === playerToken) {
      this.players.gray.socketId = newSocketId;
      this.players.gray.connected = true;
      return true;
    }
    return false;
  }

  // Check if a position is within the board
  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  // Get piece at position
  private getPiece(row: number, col: number): Piece | null {
    if (!this.isValidPosition(row, col)) return null;
    return this.board[row][col];
  }

  // Place a piece (main game action)
  placePiece(socketId: string, row: number, col: number, pieceType: PieceType): MoveResult {
    // Reset animation tracking
    this.boopedPieces = [];
    this.graduatedPieces = [];

    // Validate it's this player's turn
    const player = this.getPlayerBySocketId(socketId);
    if (!player) {
      return { valid: false, error: 'Player not found', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    if (this.phase !== 'playing') {
      return { valid: false, error: 'Game is not in playing phase', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    if (player.color !== this.currentTurn) {
      return { valid: false, error: 'Not your turn', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    // Validate position is empty
    if (!this.isValidPosition(row, col)) {
      return { valid: false, error: 'Invalid position', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    if (this.board[row][col] !== null) {
      return { valid: false, error: 'Cell is occupied', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    // Validate player has the piece type available
    if (pieceType === 'kitten' && player.kittensInPool <= 0) {
      return { valid: false, error: 'No kittens available', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }
    if (pieceType === 'cat' && player.catsInPool <= 0) {
      return { valid: false, error: 'No cats available', boopedPieces: [], graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    // Place the piece
    const newPiece: Piece = { color: player.color, type: pieceType };
    this.board[row][col] = newPiece;

    // Deduct from pool
    if (pieceType === 'kitten') {
      player.kittensInPool--;
    } else {
      player.catsInPool--;
    }

    this.lastMove = { row, col };

    // Execute booping
    this.executeBoop(row, col, newPiece);

    // Check for graduation (3 in a row of current player's kittens)
    const graduationResult = this.checkAndExecuteGraduation(player.color);

    // If we entered graduation selection phase, don't switch turns or check win yet
    if (this.pendingGraduationOptions && this.pendingGraduationOptions.length > 1) {
      return {
        valid: true,
        boopedPieces: [...this.boopedPieces],
        graduatedPieces: [],
        newCatsEarned: 0,
        winner: null,
        requiresGraduationChoice: true,
        pendingGraduationOptions: this.pendingGraduationOptions
      };
    }

    // Check for win condition
    const winResult = this.checkWinCondition(player.color);

    if (winResult) {
      this.phase = 'finished';
      this.winner = player.color;
    }

    // Switch turns
    this.currentTurn = this.currentTurn === 'orange' ? 'gray' : 'orange';

    return {
      valid: true,
      boopedPieces: [...this.boopedPieces],
      graduatedPieces: [...this.graduatedPieces],
      newCatsEarned: graduationResult,
      winner: this.winner,
      winCondition: winResult || undefined
    };
  }

  // Execute the boop mechanic
  private executeBoop(placedRow: number, placedCol: number, placedPiece: Piece): void {
    const placedType = placedPiece.type;

    for (const [dRow, dCol] of DIRECTIONS) {
      const adjRow = placedRow + dRow;
      const adjCol = placedCol + dCol;
      const adjPiece = this.getPiece(adjRow, adjCol);

      if (!adjPiece) continue;

      // Kittens cannot boop cats
      if (placedType === 'kitten' && adjPiece.type === 'cat') {
        continue;
      }

      // Calculate destination
      const destRow = adjRow + dRow;
      const destCol = adjCol + dCol;

      // Check if destination is blocked by another piece (line of 2+ rule)
      if (this.isValidPosition(destRow, destCol) && this.board[destRow][destCol] !== null) {
        // Cannot push into an occupied space
        continue;
      }

      // Execute the boop
      this.board[adjRow][adjCol] = null;

      if (this.isValidPosition(destRow, destCol)) {
        // Move to new position
        this.board[destRow][destCol] = adjPiece;
        this.boopedPieces.push({
          from: { row: adjRow, col: adjCol },
          to: { row: destRow, col: destCol }
        });
      } else {
        // Pushed off the board - return to owner's pool
        const owner = adjPiece.color === 'orange' ? this.players.orange : this.players.gray;
        if (owner) {
          if (adjPiece.type === 'kitten') {
            owner.kittensInPool++;
          } else {
            owner.catsInPool++;
          }
        }
        this.boopedPieces.push({
          from: { row: adjRow, col: adjCol },
          to: null
        });
      }
    }
  }

  // Check for and execute graduation (3 kittens in a row)
  // Returns: number of cats earned (0 means either no graduation or pending choice)
  private checkAndExecuteGraduation(playerColor: PlayerColor): number {
    const player = this.players[playerColor];
    if (!player) return 0;

    // Find all unique graduation options for this player
    const options = this.findGraduationOptions(playerColor);

    if (options.length === 0) {
      // Check if all 8 pieces are on board - can graduate one kitten
      const piecesOnBoard = this.countPiecesOnBoard(playerColor);
      if (piecesOnBoard >= 8 && player.kittensRetired + player.catsInPool < MAX_CATS) {
        // Find a kitten to graduate
        for (let row = 0; row < BOARD_SIZE; row++) {
          for (let col = 0; col < BOARD_SIZE; col++) {
            const piece = this.board[row][col];
            if (piece && piece.color === playerColor && piece.type === 'kitten') {
              // Graduate this single kitten
              this.board[row][col] = null;
              player.kittensRetired++;
              player.catsInPool++;
              this.graduatedPieces.push({ row, col });
              return 1;
            }
          }
        }
      }
      return 0;
    }

    // If there's only one option, auto-select it
    if (options.length === 1) {
      return this.executeGraduationOption(options[0], playerColor);
    }

    // Multiple options - pause the game for player to choose
    this.pendingGraduationOptions = options;
    this.pendingGraduationPlayer = playerColor;
    this.phase = 'selecting_graduation';
    // Don't switch turns yet - keep it on the current player to select
    return 0;
  }

  // Find all unique graduation options (3-in-a-row combinations)
  private findGraduationOptions(playerColor: PlayerColor): Cell[][] {
    const options: Cell[][] = [];
    const seen = new Set<string>();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dRow, dCol] of LINE_DIRECTIONS) {
          const line = this.getLineFromPosition(row, col, dRow, dCol, playerColor);
          
          if (line.length >= 3) {
            // Check if any are kittens (need at least one kitten to graduate)
            const hasKitten = line.some(cell => {
              const piece = this.board[cell.row][cell.col];
              return piece && piece.type === 'kitten';
            });
            
            if (!hasKitten) continue;

            // For lines of 4+, we need to offer multiple options
            // e.g., line of 4 offers positions [0,1,2] and [1,2,3]
            for (let i = 0; i <= line.length - 3; i++) {
              const option = line.slice(i, i + 3);
              // Check this specific option has a kitten
              const optionHasKitten = option.some(cell => {
                const piece = this.board[cell.row][cell.col];
                return piece && piece.type === 'kitten';
              });
              
              if (optionHasKitten) {
                // Create a unique key for this option (sorted to ensure uniqueness)
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
  private executeGraduationOption(option: Cell[], playerColor: PlayerColor): number {
    const player = this.players[playerColor];
    if (!player) return 0;

    let catsEarned = 0;

    for (const cell of option) {
      const piece = this.board[cell.row][cell.col];
      if (piece) {
        this.board[cell.row][cell.col] = null;
        this.graduatedPieces.push(cell);

        if (piece.type === 'kitten') {
          player.kittensRetired++;
          player.catsInPool++;
          catsEarned++;
        } else {
          // Cat was part of the line, just returns to pool
          player.catsInPool++;
        }
      }
    }

    return catsEarned;
  }

  // Player selects which graduation option to use
  selectGraduation(socketId: string, optionIndex: number): GraduationResult {
    const player = this.getPlayerBySocketId(socketId);
    if (!player) {
      return { valid: false, error: 'Player not found', graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    if (this.phase !== 'selecting_graduation') {
      return { valid: false, error: 'Not in graduation selection phase', graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    if (player.color !== this.pendingGraduationPlayer) {
      return { valid: false, error: 'Not your turn to select graduation', graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    if (!this.pendingGraduationOptions || optionIndex < 0 || optionIndex >= this.pendingGraduationOptions.length) {
      return { valid: false, error: 'Invalid graduation option', graduatedPieces: [], newCatsEarned: 0, winner: null };
    }

    // Reset graduated pieces tracking
    this.graduatedPieces = [];

    // Execute the selected graduation
    const option = this.pendingGraduationOptions[optionIndex];
    const catsEarned = this.executeGraduationOption(option, player.color);

    // Clear pending state
    this.pendingGraduationOptions = null;
    this.pendingGraduationPlayer = null;

    // Check for win condition
    const winResult = this.checkWinCondition(player.color);

    if (winResult) {
      this.phase = 'finished';
      this.winner = player.color;
    } else {
      // Return to playing phase and switch turns
      this.phase = 'playing';
      this.currentTurn = this.currentTurn === 'orange' ? 'gray' : 'orange';
    }

    return {
      valid: true,
      graduatedPieces: [...this.graduatedPieces],
      newCatsEarned: catsEarned,
      winner: this.winner,
      winCondition: winResult || undefined
    };
  }

  // Find all lines of 3+ pieces for a player
  private findLinesOfThree(playerColor: PlayerColor): Cell[][] {
    const lines: Cell[][] = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dRow, dCol] of LINE_DIRECTIONS) {
          const line = this.getLineFromPosition(row, col, dRow, dCol, playerColor);
          if (line.length >= 3) {
            // Check if any are kittens (need at least one kitten to graduate)
            const hasKitten = line.some(cell => {
              const piece = this.board[cell.row][cell.col];
              return piece && piece.type === 'kitten';
            });
            if (hasKitten) {
              lines.push(line.slice(0, 3)); // Take first 3
            }
          }
        }
      }
    }

    return lines;
  }

  // Get a line of consecutive pieces from a position
  private getLineFromPosition(
    startRow: number,
    startCol: number,
    dRow: number,
    dCol: number,
    playerColor: PlayerColor
  ): Cell[] {
    const line: Cell[] = [];

    let row = startRow;
    let col = startCol;

    while (this.isValidPosition(row, col)) {
      const piece = this.board[row][col];
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

  // Check win condition
  private checkWinCondition(playerColor: PlayerColor): 'three_cats_in_row' | 'all_eight_cats' | null {
    const player = this.players[playerColor];
    if (!player) return null;

    // Check for 3 cats in a row
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dRow, dCol] of LINE_DIRECTIONS) {
          if (this.checkCatLineFromPosition(row, col, dRow, dCol, playerColor)) {
            return 'three_cats_in_row';
          }
        }
      }
    }

    // Check for all 8 cats on board
    let catsOnBoard = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (piece && piece.color === playerColor && piece.type === 'cat') {
          catsOnBoard++;
        }
      }
    }
    if (catsOnBoard >= 8) {
      return 'all_eight_cats';
    }

    return null;
  }

  // Check if there's a line of 3 cats from a position
  private checkCatLineFromPosition(
    startRow: number,
    startCol: number,
    dRow: number,
    dCol: number,
    playerColor: PlayerColor
  ): boolean {
    let count = 0;

    for (let i = 0; i < 3; i++) {
      const row = startRow + i * dRow;
      const col = startCol + i * dCol;

      if (!this.isValidPosition(row, col)) return false;

      const piece = this.board[row][col];
      if (piece && piece.color === playerColor && piece.type === 'cat') {
        count++;
      } else {
        return false;
      }
    }

    return count === 3;
  }

  // Count pieces on board for a player
  private countPiecesOnBoard(playerColor: PlayerColor): number {
    let count = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (piece && piece.color === playerColor) {
          count++;
        }
      }
    }
    return count;
  }

  // Get player by socket ID
  private getPlayerBySocketId(socketId: string): PlayerState | null {
    if (this.players.orange?.socketId === socketId) return this.players.orange;
    if (this.players.gray?.socketId === socketId) return this.players.gray;
    return null;
  }

  // Get full game state (for sending to clients)
  getState(): GameState {
    const state: GameState = {
      board: this.board.map(row => row.map(cell => cell ? { ...cell } : null)),
      players: {
        orange: this.players.orange ? { ...this.players.orange } : null,
        gray: this.players.gray ? { ...this.players.gray } : null
      },
      currentTurn: this.currentTurn,
      phase: this.phase,
      winner: this.winner,
      lastMove: this.lastMove,
      boopedPieces: [...this.boopedPieces],
      graduatedPieces: [...this.graduatedPieces]
    };

    // Include pending graduation options if in selection phase
    if (this.pendingGraduationOptions) {
      state.pendingGraduationOptions = this.pendingGraduationOptions.map(option => 
        option.map(cell => ({ ...cell }))
      );
    }
    if (this.pendingGraduationPlayer) {
      state.pendingGraduationPlayer = this.pendingGraduationPlayer;
    }

    return state;
  }

  // Check if game is ready to start
  isReady(): boolean {
    return this.players.orange !== null && this.players.gray !== null;
  }

  // Get the player's color by socket ID
  getPlayerColor(socketId: string): PlayerColor | null {
    if (this.players.orange?.socketId === socketId) return 'orange';
    if (this.players.gray?.socketId === socketId) return 'gray';
    return null;
  }
}
