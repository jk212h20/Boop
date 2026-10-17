// React hook for managing local bot games

import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PieceType, GameOverInfo, Cell } from '../types';
import { checkWinCondition, createInitialGameState, executeMove, cloneGameState } from '../bot/LocalGame';
import { createBot, BotAI } from '../bot/BotAI';
import { DEFAULT_BOT_CONFIG, BotConfig } from '../bot/types';

// Resolve a pending graduation choice for the bot: execute the option that
// graduates the most kittens (ties -> first listed). Mirrors the human path
// in selectGraduation below. Without this, a bot move that ends in
// selecting_graduation deadlocks the game: nothing else ever resolves it.
export function applyBotGraduationChoice(state: GameState, botColor: PlayerColor): GameState {
  const newState = cloneGameState(state);
  const player = newState.players[botColor];
  const options = newState.pendingGraduationOptions || [];
  if (!player || options.length === 0) return newState;

  let bestIndex = 0;
  let bestKittens = -1;
  options.forEach((option, index) => {
    const kittens = option.filter(cell => {
      const piece = newState.board[cell.row]?.[cell.col];
      return piece && piece.color === botColor && piece.type === 'kitten';
    }).length;
    if (kittens > bestKittens) {
      bestKittens = kittens;
      bestIndex = index;
    }
  });

  const option = options[bestIndex];
  const graduatedPieces: Cell[] = [];
  for (const cell of option) {
    const piece = newState.board[cell.row]?.[cell.col];
    if (piece) {
      newState.board[cell.row][cell.col] = null;
      graduatedPieces.push(cell);
      if (piece.type === 'kitten') {
        player.kittensRetired++;
        player.catsInPool++;
      } else {
        player.catsInPool++;
      }
    }
  }

  newState.graduatedPieces = graduatedPieces;
  newState.pendingGraduationOptions = undefined;
  newState.pendingGraduationPlayer = undefined;

  // Safety net: a graduation only removes pieces, so this cannot create a
  // win — but keep parity with the human selection path.
  const winCondition = checkWinCondition(newState.board, botColor);
  if (winCondition) {
    newState.phase = 'finished';
    newState.winner = botColor;
    return newState;
  }

  newState.phase = 'playing';
  newState.currentTurn = botColor === 'orange' ? 'gray' : 'orange';
  return newState;
}

import { animationDurationMs } from '../animationTiming';

interface UseBotGameReturn {
  gameState: GameState | null;
  playerColor: PlayerColor;
  botColor: PlayerColor;
  gameOver: GameOverInfo | null;
  botThinking: boolean;
  
  startBotGame: (playerName?: string, botConfig?: Partial<BotConfig>) => void;
  placePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  selectGraduation: (optionIndex: number) => Promise<boolean>;
  resetGame: () => void;
  endBotGame: () => void;
  /** Increments on every new bot game; use as a React key so Game remounts fresh. */
  gameId: number;
}

export function useBotGame(): UseBotGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [gameId, setGameId] = useState(0);
  
  // Player is always orange, bot is always gray
  const playerColor: PlayerColor = 'orange';
  const botColor: PlayerColor = 'gray';
  
  const botRef = useRef<BotAI | null>(null);
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
      }
    };
  }, []);

  // Make bot move
  const executeBotMove = useCallback((state: GameState) => {
    if (!botRef.current) return;
    if (state.phase !== 'playing') return;
    if (state.currentTurn !== botColor) return;

    setBotThinking(true);

    // Add a slight delay to make it feel more natural
    thinkingTimeoutRef.current = setTimeout(() => {
      const bot = botRef.current;
      if (!bot) {
        setBotThinking(false);
        return;
      }

      const move = bot.findBestMove(state);
      
      if (move) {
        const result = executeMove(state, move.row, move.col, move.pieceType, botColor);
        
        if (result.valid) {
          let resultingState = result.newState;

          // If the bot's move left a pending graduation choice for the bot,
          // resolve it here. Nothing else will — the human selector rejects
          // bot selections — so this previously deadlocked the game.
          if (resultingState.phase === 'selecting_graduation' &&
              resultingState.pendingGraduationPlayer === botColor) {
            resultingState = applyBotGraduationChoice(resultingState, botColor);
          }

          setGameState(resultingState);
          
          // Check for game over
          if (resultingState.phase === 'finished' && resultingState.winner) {
            const winCondition = checkWinCondition(resultingState.board, resultingState.winner)
              ?? 'three_cats_in_row';
            setGameOver({
              winner: resultingState.winner,
              winCondition,
              gameState: resultingState,
            });
          }
        }
      }
      
      setBotThinking(false);
    }, DEFAULT_BOT_CONFIG.thinkingDelayMs);
  }, [botColor]);

  // Store config for reset
  const botConfigRef = useRef<Partial<BotConfig>>({});

  // Start a new bot game
  const startBotGame = useCallback((playerName: string = 'Player', botConfig: Partial<BotConfig> = {}) => {
    const newState = createInitialGameState(playerName, '🤖 Bot');
    setGameState(newState);
    setGameOver(null);
    setBotThinking(false);
    // New game identity: App uses this as the Game component's key so the
    // whole subtree (history, review index, animation overlays) remounts
    // empty instead of carrying over the previous game's review state.
    setGameId(id => id + 1);
    
    // Store config for reset
    botConfigRef.current = botConfig;
    
    // Create bot instance with config
    botRef.current = createBot(botColor, botConfig);
    
    console.log('[BotGame] Started new game with config:', botConfig);
  }, [botColor]);

  // Place a piece (human player move)
  const placePiece = useCallback(async (row: number, col: number, pieceType: PieceType): Promise<boolean> => {
    if (!gameState) {
      console.error('[BotGame] No game state');
      return false;
    }
    
    if (gameState.currentTurn !== playerColor) {
      console.error('[BotGame] Not player turn');
      return false;
    }
    
    if (gameState.phase !== 'playing') {
      console.error('[BotGame] Game not in playing phase');
      return false;
    }

    const result = executeMove(gameState, row, col, pieceType, playerColor);
    
    if (!result.valid) {
      console.error('[BotGame] Invalid move:', result.error);
      return false;
    }

    setGameState(result.newState);
    
    // Check for game over
    if (result.newState.phase === 'finished' && result.newState.winner) {
      const winCondition = checkWinCondition(result.newState.board, result.newState.winner)
        ?? 'three_cats_in_row';
      setGameOver({
        winner: result.newState.winner,
        winCondition,
        gameState: result.newState,
      });
      return true;
    }

    // Trigger bot move if it's bot's turn - wait for animations to complete first
    if (result.newState.currentTurn === botColor) {
      // Delay bot move to allow animations to finish
      setTimeout(() => {
        executeBotMove(result.newState);
      }, animationDurationMs(result.newState));
    }

    return true;
  }, [gameState, playerColor, botColor, executeBotMove]);

  // Select graduation option (when player needs to choose which 3 in a row to graduate)
  const selectGraduation = useCallback(async (optionIndex: number): Promise<boolean> => {
    if (!gameState) {
      console.error('[BotGame] No game state');
      return false;
    }

    if (gameState.phase !== 'selecting_graduation') {
      console.error('[BotGame] Not in graduation selection phase');
      return false;
    }

    if (gameState.pendingGraduationPlayer !== playerColor) {
      console.error('[BotGame] Not player turn to select graduation');
      return false;
    }

    const options = gameState.pendingGraduationOptions;
    if (!options || optionIndex < 0 || optionIndex >= options.length) {
      console.error('[BotGame] Invalid graduation option');
      return false;
    }

    // Execute the selected graduation
    const newState = cloneGameState(gameState);
    const player = newState.players[playerColor];
    if (!player) return false;

    const option = options[optionIndex];
    const graduatedPieces: Cell[] = [];

    for (const cell of option) {
      const piece = newState.board[cell.row][cell.col];
      if (piece) {
        newState.board[cell.row][cell.col] = null;
        graduatedPieces.push(cell);

        if (piece.type === 'kitten') {
          player.kittensRetired++;
          player.catsInPool++;
        } else {
          player.catsInPool++;
        }
      }
    }

    newState.graduatedPieces = graduatedPieces;
    newState.pendingGraduationOptions = undefined;
    newState.pendingGraduationPlayer = undefined;

    // Check for win AFTER graduation. A graduation can win the game by
    // either promoting kittens into a 3-cats-in-a-row line OR by reaching
    // all 8 cats on the board. Mirrors server logic in
    // server/src/game/GameState.ts:selectGraduation (checkWinCondition
    // then phase/winner set). The prior implementation skipped this
    // check and silently continued the game — a human could graduate
    // into a winning position and have the UI not notice.
    const winCondition = checkWinCondition(newState.board, playerColor);
    if (winCondition) {
      newState.phase = 'finished';
      newState.winner = playerColor;
      setGameState(newState);
      setGameOver({
        winner: playerColor,
        winCondition,
        gameState: newState,
      });
      return true;
    }

    newState.phase = 'playing';
    newState.currentTurn = botColor;

    setGameState(newState);

    // Let the chosen graduation finish before the bot's reply appears.
    setTimeout(() => executeBotMove(newState), animationDurationMs(newState));

    return true;
  }, [gameState, playerColor, botColor, executeBotMove]);

  // Reset game (preserves difficulty settings)
  const resetGame = useCallback(() => {
    const playerName = gameState?.players.orange?.name || 'Player';
    startBotGame(playerName, botConfigRef.current);
  }, [gameState, startBotGame]);

  // End bot game (return to lobby)
  const endBotGame = useCallback(() => {
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
    }
    setGameState(null);
    setGameOver(null);
    setBotThinking(false);
    botRef.current = null;
  }, []);

  return {
    gameState,
    playerColor,
    botColor,
    gameOver,
    botThinking,
    startBotGame,
    placePiece,
    selectGraduation,
    resetGame,
    endBotGame,
    gameId,
  };
}
