// React hook for managing local bot games

import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PieceType, GameOverInfo, Cell } from '../types';
import { createInitialGameState, executeMove, cloneGameState } from '../bot/LocalGame';
import { createBot, BotAI } from '../bot/BotAI';
import { DEFAULT_BOT_CONFIG, BotConfig } from '../bot/types';

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
}

export function useBotGame(): UseBotGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  
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
          setGameState(result.newState);
          
          // Check for game over
          if (result.newState.phase === 'finished' && result.newState.winner) {
            setGameOver({
              winner: result.newState.winner,
              winCondition: 'three_cats_in_row', // We'd need more info to know exact condition
              gameState: result.newState,
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
      setGameOver({
        winner: result.newState.winner,
        winCondition: 'three_cats_in_row',
        gameState: result.newState,
      });
      return true;
    }

    // Trigger bot move if it's bot's turn
    if (result.newState.currentTurn === botColor) {
      executeBotMove(result.newState);
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

    // Check for win (3 cats in a row)
    // For simplicity, just check if we need to return to playing
    newState.phase = 'playing';
    newState.currentTurn = botColor;

    setGameState(newState);

    // Trigger bot move
    executeBotMove(newState);

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
  };
}
