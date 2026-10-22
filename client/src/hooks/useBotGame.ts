// React hook for managing local bot games

import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PieceType, GameOverInfo } from '../types';
import { checkWinCondition, createInitialGameState, executeMove, resolveGraduationChoice } from '../bot/LocalGame';
import { BotWorkerClient } from '../bot/BotWorkerClient';
import { createBot } from '../bot/BotAI';
import { BotConfig } from '../bot/types';
import { BOT_PAUSE_MS, botReplyDelayMs } from '../animationTiming';

// Synchronous rules/test entry point. Live play resolves choices in the worker.
export function applyBotGraduationChoice(state: GameState, botColor: PlayerColor): GameState {
  const options = state.pendingGraduationOptions || [];
  if (!state.players[botColor] || options.length === 0) return state;

  const bestIndex = createBot(botColor).findBestGraduation(state);

  const result = resolveGraduationChoice(state, bestIndex);
  return result.valid ? result.newState : state;
}



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
  
  const botRef = useRef<BotWorkerClient | null>(null);
  const generationRef = useRef(0);

  const waitsRef = useRef(new Map<ReturnType<typeof setTimeout>, () => void>());
  const cancelWaits = useCallback(() => {
    for (const [timer, resolve] of waitsRef.current) { clearTimeout(timer); resolve(); }
    waitsRef.current.clear();
  }, []);
  const wait = useCallback((ms: number) => new Promise<void>(resolve => {
    const timer = setTimeout(() => { waitsRef.current.delete(timer); resolve(); }, Math.max(0, ms));
    waitsRef.current.set(timer, resolve);
  }), []);
  useEffect(() => () => { generationRef.current++; cancelWaits(); botRef.current?.dispose(); }, [cancelWaits]);

  // Pause before search; publish only after the prior board animation settles.
  // Off-board walks retain their independent cosmetic lifetime.
  const executeBotMove = useCallback(async (state: GameState) => {
    const bot = botRef.current;
    if (!bot || state.phase === 'finished') return;
    if (!(state.phase === 'selecting_graduation' && state.pendingGraduationPlayer === botColor) &&
        !(state.phase === 'playing' && state.currentTurn === botColor)) return;
    const generation = generationRef.current;
    const publishAfter = performance.now() + botReplyDelayMs(state);
    setBotThinking(true);
    await wait(BOT_PAUSE_MS);
    if (generation !== generationRef.current) return;
    const resultingState = await bot.play(state);
    if (generation !== generationRef.current || !resultingState) return;
    await wait(publishAfter - performance.now());
    if (generation !== generationRef.current) return;
    setGameState(resultingState);
    if (resultingState.phase === 'finished' && resultingState.winner) {
      setGameOver({ winner: resultingState.winner,
        winCondition: checkWinCondition(resultingState.board, resultingState.winner) ?? 'three_cats_in_row',
        gameState: resultingState });
    }
    setBotThinking(false);
  }, [botColor, wait]);

  // Store config for reset
  const botConfigRef = useRef<Partial<BotConfig>>({});

  // Start a new bot game
  const startBotGame = useCallback((playerName: string = 'Player', botConfig: Partial<BotConfig> = {}) => {
    generationRef.current++;
    cancelWaits();
    botRef.current?.dispose();
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
    botRef.current = new BotWorkerClient(botColor, botConfig);
    
    console.log('[BotGame] Started new game with config:', botConfig);
  }, [botColor, cancelWaits]);

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

    const newState = result.newState;

    setGameState(newState);
    
    // Check for game over
    if (newState.phase === 'finished' && newState.winner) {
      const winCondition = checkWinCondition(newState.board, newState.winner)
        ?? 'three_cats_in_row';
      setGameOver({
        winner: newState.winner,
        winCondition,
        gameState: newState,
      });
      return true;
    }

    void executeBotMove(newState);

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

    // Resolve the choice (also resolves the opponent's graduation from the
    // same boop) and keep the win/turn rules in one place: LocalGame.
    const result = resolveGraduationChoice(gameState, optionIndex);
    if (!result.valid) {
      console.error('[BotGame] Graduation rejected:', result.error);
      return false;
    }
    const newState = result.newState;

    if (newState.phase === 'finished' && newState.winner) {
      const winCondition = checkWinCondition(newState.board, newState.winner)
        ?? 'three_cats_in_row';
      setGameState(newState);
      setGameOver({
        winner: newState.winner,
        winCondition,
        gameState: newState,
      });
      return true;
    }

    setGameState(newState);

    void executeBotMove(newState);

    return true;
  }, [gameState, playerColor, botColor, executeBotMove]);

  // Reset game (preserves difficulty settings)
  const resetGame = useCallback(() => {
    const playerName = gameState?.players.orange?.name || 'Player';
    startBotGame(playerName, botConfigRef.current);
  }, [gameState, startBotGame]);

  // End bot game (return to lobby)
  const endBotGame = useCallback(() => {
    generationRef.current++;
    cancelWaits();
    botRef.current?.dispose();
    setGameState(null);
    setGameOver(null);
    setBotThinking(false);
    botRef.current = null;
  }, [cancelWaits]);

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
