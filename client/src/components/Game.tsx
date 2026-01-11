import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, PlayerColor, PieceType, GameOverInfo, Cell, Piece, BoopEffect } from '../types';
import { Board, PlayerPool, calculateFallenPosition } from './Board';
import { useSound } from '../hooks/useSound';
import { useGameHistory } from '../hooks/useGameHistory';
import { HistorySlider } from './HistorySlider';

// Ghost piece data to show where pieces were before being booped
interface GhostPiece {
  row: number;
  col: number;
  piece: Piece;
}

// Fallen piece with calculated position in gutter
interface FallenPiece {
  gutterRow: number;
  gutterCol: number;
  piece: Piece;
}

interface GameProps {
  gameState: GameState;
  playerColor: PlayerColor;
  roomCode: string;
  onPlacePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  onSelectGraduation?: (optionIndex: number) => Promise<boolean>;
  onLeave: () => void;
  gameOver: GameOverInfo | null;
  opponentDisconnected: boolean;
  opponentMayReconnect?: boolean;
  // Bot game specific props
  isBotGame?: boolean;
  botThinking?: boolean;
  onRematch?: () => void;
}

export function Game({ 
  gameState, 
  playerColor, 
  roomCode, 
  onPlacePiece, 
  onSelectGraduation,
  onLeave,
  gameOver,
  opponentDisconnected,
  opponentMayReconnect = false,
  isBotGame = false,
  botThinking = false,
  onRematch,
}: GameProps) {
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType>('kitten');
  const [error, setError] = useState<string | null>(null);
  const [highlightedOption, setHighlightedOption] = useState<number | null>(null);
  
  // Animation state - tracks the current move's effects for animation
  const [animatingBoops, setAnimatingBoops] = useState<BoopEffect[]>([]);
  const [animatingGraduations, setAnimatingGraduations] = useState<Cell[]>([]);
  const [ghostPieces, setGhostPieces] = useState<GhostPiece[]>([]);
  const [fallenPieces, setFallenPieces] = useState<FallenPiece[]>([]);
  const [animationKey, setAnimationKey] = useState(0);
  
  // Track previous board state to get piece data for ghosts
  const prevBoardRef = useRef(gameState.board);
  
  // Track previous player states for history recording
  const prevPlayersRef = useRef({
    orange: { kittensInPool: gameState.players.orange?.kittensInPool ?? 8, catsInPool: gameState.players.orange?.catsInPool ?? 0 },
    gray: { kittensInPool: gameState.players.gray?.kittensInPool ?? 8, catsInPool: gameState.players.gray?.catsInPool ?? 0 }
  });
  
  // Sound system
  const { playSound } = useSound();
  
  // Game history for reviewing past moves
  const gameHistory = useGameHistory(gameState.board);

  const isMyTurn = gameState.currentTurn === playerColor;
  const myPlayer = gameState.players[playerColor];
  const opponentColor: PlayerColor = playerColor === 'orange' ? 'gray' : 'orange';
  const opponent = gameState.players[opponentColor];
  
  // Check if we're in graduation selection phase
  const isSelectingGraduation = gameState.phase === 'selecting_graduation' && 
    gameState.pendingGraduationPlayer === playerColor;
  const graduationOptions = gameState.pendingGraduationOptions || [];

  // Determine what to display based on history viewing
  const displayBoard = gameHistory.isViewingHistory 
    ? gameHistory.viewingBoard 
    : gameState.board;
  
  // Get historical player pools if viewing history
  const displayPools = useMemo(() => {
    if (gameHistory.isViewingHistory && gameHistory.viewingMove) {
      return gameHistory.viewingMove.playersAfter;
    }
    return {
      orange: { kittensInPool: gameState.players.orange?.kittensInPool ?? 0, catsInPool: gameState.players.orange?.catsInPool ?? 0 },
      gray: { kittensInPool: gameState.players.gray?.kittensInPool ?? 0, catsInPool: gameState.players.gray?.catsInPool ?? 0 }
    };
  }, [gameHistory.isViewingHistory, gameHistory.viewingMove, gameState.players]);

  // Get highlighted cell (the placed piece) when viewing history
  const historyHighlightedCell = useMemo(() => {
    if (gameHistory.isViewingHistory && gameHistory.viewingMove) {
      return {
        row: gameHistory.viewingMove.placement.row,
        col: gameHistory.viewingMove.placement.col
      };
    }
    return null;
  }, [gameHistory.isViewingHistory, gameHistory.viewingMove]);

  // Animation data for history view - show boops and fallen pieces with animations
  const historyAnimationData = useMemo(() => {
    if (gameHistory.isViewingHistory && gameHistory.viewingMove) {
      const boops = gameHistory.viewingMove.boops;
      const fallen: FallenPiece[] = [];
      const ghosts: GhostPiece[] = [];
      
      for (const boop of boops) {
        // Create ghost at original position
        ghosts.push({
          row: boop.from.row,
          col: boop.from.col,
          piece: boop.piece
        });
        
        // Calculate fallen position for pieces booped off
        if (boop.to === null) {
          const fp = calculateFallenPosition(boop.from, boop.piece);
          if (fp) fallen.push(fp);
        }
      }
      
      return { boops, fallen, ghosts };
    }
    return { boops: animatingBoops, fallen: fallenPieces, ghosts: ghostPieces };
  }, [gameHistory.isViewingHistory, gameHistory.viewingMove, animatingBoops, fallenPieces, ghostPieces]);

  // Trigger animation when history move changes
  useEffect(() => {
    if (gameHistory.isViewingHistory) {
      // Increment animation key to trigger new animations instantly (abort any current)
      setAnimationKey(prev => prev + 1);
    }
  }, [gameHistory.currentMoveIndex, gameHistory.isViewingHistory]);

  // Record moves to history when game state changes
  useEffect(() => {
    if (gameState.lastMove) {
      const lastPlayer: PlayerColor = gameState.currentTurn === 'orange' ? 'gray' : 'orange';
      const boopEffects: BoopEffect[] = (gameState.boopedPieces || []).map(bp => ({
        from: bp.from,
        to: bp.to,
        piece: bp.piece || prevBoardRef.current[bp.from.row]?.[bp.from.col] || { color: lastPlayer, type: 'kitten' as PieceType }
      }));
      
      // Get piece type from the placed piece on the board
      const placedPiece = gameState.board[gameState.lastMove.row][gameState.lastMove.col];
      const pieceType: PieceType = placedPiece?.type || 'kitten';
      
      const orangePlayer = gameState.players.orange;
      const grayPlayer = gameState.players.gray;
      
      gameHistory.recordMove(
        prevBoardRef.current,
        gameState.board,
        lastPlayer,
        { 
          row: gameState.lastMove.row, 
          col: gameState.lastMove.col, 
          pieceType
        },
        boopEffects,
        gameState.graduatedPieces || [],
        prevPlayersRef.current,
        { 
          orange: { kittensInPool: orangePlayer?.kittensInPool ?? 0, catsInPool: orangePlayer?.catsInPool ?? 0 }, 
          gray: { kittensInPool: grayPlayer?.kittensInPool ?? 0, catsInPool: grayPlayer?.catsInPool ?? 0 }
        }
      );
      
      // Update previous players ref
      prevPlayersRef.current = {
        orange: { kittensInPool: orangePlayer?.kittensInPool ?? 0, catsInPool: orangePlayer?.catsInPool ?? 0 },
        gray: { kittensInPool: grayPlayer?.kittensInPool ?? 0, catsInPool: grayPlayer?.catsInPool ?? 0 }
      };
    }
  }, [gameState.lastMove]);

  // Animation timing constants (must match Board.tsx)
  const DROP_DURATION = 400; // ms
  const BOOP_DELAY = DROP_DURATION + 100; // ms, wait for drop to complete
  const BOOP_DURATION = 500; // ms
  const GRADUATION_DELAY = BOOP_DELAY + BOOP_DURATION + 100; // ms, wait for boops to complete

  // Handle game state updates - trigger animations and sounds (live game only)
  useEffect(() => {
    // Don't animate during history viewing - that's handled separately
    if (gameHistory.isViewingHistory) return;
    
    const booped = gameState.boopedPieces || [];
    const graduated = gameState.graduatedPieces || [];
    
    // Increment animation key for new animations
    setAnimationKey(prev => prev + 1);
    
    // Only animate if there are new boops or graduations
    if (booped.length > 0 || graduated.length > 0) {
      // Create ghost pieces from the previous board state
      const newGhosts: GhostPiece[] = [];
      const newFallen: FallenPiece[] = [];
      
      for (const bp of booped) {
        // Use embedded piece data if available (from server/bot), fallback to board lookup
        const piece = bp.piece || prevBoardRef.current[bp.from.row]?.[bp.from.col];
        if (piece) {
          newGhosts.push({
            row: bp.from.row,
            col: bp.from.col,
            piece: { ...piece }
          });
          
          // Calculate fallen position for pieces booped off
          if (bp.to === null) {
            const fp = calculateFallenPosition(bp.from, piece);
            if (fp) newFallen.push(fp);
          }
        }
      }
      
      // Set animation state - boops and ghosts immediately, but graduations delayed
      setAnimatingBoops(booped);
      setGhostPieces(newGhosts);
      
      // Delay fallen pieces until after boops complete
      if (newFallen.length > 0) {
        setTimeout(() => setFallenPieces(newFallen), BOOP_DELAY);
      }
      
      // Delay graduation animation until after boops complete
      if (graduated.length > 0) {
        setTimeout(() => setAnimatingGraduations(graduated), GRADUATION_DELAY);
      }
      
      // Play sounds with proper timing
      if (gameState.lastMove) {
        playSound('place');
      }
      
      if (booped.length > 0) {
        setTimeout(() => playSound('boop'), BOOP_DELAY);
      }
      
      if (graduated.length > 0) {
        setTimeout(() => playSound('graduate'), GRADUATION_DELAY);
      }
      
      // Clear animation state after all animations complete
      const totalAnimationTime = graduated.length > 0 
        ? GRADUATION_DELAY + 800 // Extra time for graduation animation
        : BOOP_DELAY + BOOP_DURATION + 200;
        
      const timer = setTimeout(() => {
        setAnimatingBoops([]);
        setAnimatingGraduations([]);
        setFallenPieces([]);
      }, totalAnimationTime);
      
      return () => clearTimeout(timer);
    } else if (gameState.lastMove) {
      // Just a placement with no boops
      playSound('place');
      setGhostPieces([]);
      setFallenPieces([]);
    }
    
    // Update previous board reference
    prevBoardRef.current = gameState.board;
  }, [gameState.board, gameState.lastMove, gameState.boopedPieces, gameState.graduatedPieces, playSound, gameHistory.isViewingHistory]);

  // Handle game over sound
  useEffect(() => {
    if (gameOver) {
      const isWinner = gameOver.winner === playerColor;
      const timer = setTimeout(() => {
        playSound(isWinner ? 'win' : 'lose');
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [gameOver, playerColor, playSound]);

  // Auto-select available piece type
  useEffect(() => {
    if (!myPlayer) return;
    
    if (selectedPieceType === 'kitten' && myPlayer.kittensInPool === 0 && myPlayer.catsInPool > 0) {
      setSelectedPieceType('cat');
    } else if (selectedPieceType === 'cat' && myPlayer.catsInPool === 0 && myPlayer.kittensInPool > 0) {
      setSelectedPieceType('kitten');
    }
  }, [myPlayer, selectedPieceType]);

  const handleCellClick = async (row: number, col: number) => {
    // If viewing history, return to current game
    if (gameHistory.isViewingHistory) {
      gameHistory.goToEnd();
      return;
    }
    
    if (!isMyTurn) return;
    
    setError(null);
    try {
      await onPlacePiece(row, col, selectedPieceType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place piece');
    }
  };

  const handleSelectPiece = (type: PieceType) => {
    setSelectedPieceType(type);
    setError(null);
  };

  return (
    <div className="min-h-screen py-4 px-2">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold text-boop-orange-600">
              🐱 Boop!
            </span>
            <span className="text-sm text-gray-500 room-code bg-white/50 px-2 py-1 rounded">
              {roomCode}
            </span>
          </div>
          <button
            onClick={onLeave}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Leave Game
          </button>
        </div>

        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-xl mb-4 text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Opponent disconnected warning */}
        <AnimatePresence>
          {opponentDisconnected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`px-4 py-2 rounded-xl mb-4 text-center ${
                opponentMayReconnect 
                  ? 'bg-blue-100 border border-blue-300 text-blue-800'
                  : 'bg-yellow-100 border border-yellow-300 text-yellow-800'
              }`}
            >
              {opponentMayReconnect ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                  <span>Opponent disconnected - waiting for them to reconnect...</span>
                </div>
              ) : (
                <span>⚠️ Your opponent has left the game</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Turn indicator - above board */}
        {!gameHistory.isViewingHistory && !gameOver && (
          <div className="text-center mb-3">
            {!isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-full shadow"
              >
                {botThinking ? (
                  <>
                    <div className="spinner w-4 h-4"></div>
                    <span className="text-gray-700 font-medium">🤖 Bot is thinking...</span>
                  </>
                ) : (
                  <span className="text-gray-600 font-medium">Opponent's turn...</span>
                )}
              </motion.div>
            )}
          </div>
        )}

        {/* Game Over Banner - inline above board */}
        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`mb-4 p-4 rounded-xl shadow-lg text-center ${
                gameOver.winner === playerColor 
                  ? 'bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-yellow-400' 
                  : 'bg-gradient-to-r from-gray-100 to-slate-100 border-2 border-gray-400'
              }`}
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <span className="text-3xl">{gameOver.winner === playerColor ? '🎉' : '😿'}</span>
                <h2 className={`font-display text-2xl font-bold ${
                  gameOver.winner === playerColor ? 'text-boop-orange-600' : 'text-boop-gray-600'
                }`}>
                  {gameOver.winner === playerColor ? 'You Win!' : 'You Lose!'}
                </h2>
                <span className="text-3xl">{gameOver.winner === playerColor ? '🎉' : '😿'}</span>
              </div>
              <p className="text-gray-600 mb-3">
                {gameOver.winCondition === 'three_cats_in_row' ? '3 Cats in a Row!' : 'All 8 Cats on the Board!'}
              </p>
              <div className="flex gap-2 justify-center">
                {isBotGame && onRematch && (
                  <button onClick={onRematch} className="btn-primary text-sm px-4 py-2">
                    🔄 Rematch
                  </button>
                )}
                <button onClick={onLeave} className={`${isBotGame ? 'btn-secondary' : 'btn-primary'} text-sm px-4 py-2`}>
                  {isBotGame ? '← Back to Menu' : 'Play Again'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game layout */}
        <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start justify-center">
          {/* Opponent's pool (top/left) */}
          {opponent && (
            <div className="w-full lg:w-48">
              <PlayerPool
                color={opponentColor}
                kittensInPool={displayPools[opponentColor].kittensInPool}
                catsInPool={displayPools[opponentColor].catsInPool}
                isMyTurn={!isMyTurn && !gameHistory.isViewingHistory}
                selectedPieceType={null}
                onSelectPiece={() => {}}
                playerName={opponent.name}
                isCurrentPlayer={false}
              />
            </div>
          )}

          {/* Board */}
          <div className="flex-shrink-0">
            <Board
              board={displayBoard}
              onCellClick={handleCellClick}
              isMyTurn={isMyTurn && !gameHistory.isViewingHistory}
              lastMove={gameHistory.isViewingHistory ? null : gameState.lastMove}
              selectedPieceType={isMyTurn && !gameHistory.isViewingHistory ? selectedPieceType : null}
              boopedPieces={historyAnimationData.boops}
              graduatedPieces={gameHistory.isViewingHistory ? [] : animatingGraduations}
              ghostPieces={historyAnimationData.ghosts}
              highlightedCell={historyHighlightedCell}
              isViewingHistory={gameHistory.isViewingHistory}
              fallenPieces={historyAnimationData.fallen}
              animationKey={animationKey}
            />
          </div>

          {/* My pool (bottom/right) */}
          {myPlayer && (
            <div className="w-full lg:w-48">
              <PlayerPool
                color={playerColor}
                kittensInPool={displayPools[playerColor].kittensInPool}
                catsInPool={displayPools[playerColor].catsInPool}
                isMyTurn={isMyTurn && !gameHistory.isViewingHistory}
                selectedPieceType={isMyTurn && !gameHistory.isViewingHistory ? selectedPieceType : null}
                onSelectPiece={handleSelectPiece}
                playerName={myPlayer.name}
                isCurrentPlayer={true}
              />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-sm text-gray-600">
          {gameHistory.isViewingHistory ? (
            <p className="text-blue-600">📜 Viewing move history - click board or "Return to game" to continue playing</p>
          ) : isMyTurn ? (
            <p>
              Select a piece from your pool, then click an empty cell to place it.
              <br />
              <span className="text-boop-orange-600 font-medium">
                {selectedPieceType === 'kitten' ? '🐱 Placing Kitten' : '😼 Placing Cat'}
              </span>
            </p>
          ) : botThinking ? (
            <div className="flex items-center justify-center gap-2">
              <div className="spinner w-4 h-4"></div>
              <span>🤖 Bot is thinking...</span>
            </div>
          ) : (
            <p>Waiting for opponent's move...</p>
          )}
        </div>

        {/* History Slider */}
        <HistorySlider
          history={gameHistory.history}
          currentMoveIndex={gameHistory.currentMoveIndex}
          onGoToMove={gameHistory.goToMove}
          onGoToStart={gameHistory.goToStart}
          onGoToEnd={gameHistory.goToEnd}
          onGoBack={gameHistory.goBack}
          onGoForward={gameHistory.goForward}
          isViewingHistory={gameHistory.isViewingHistory}
        />
      </div>

      {/* Graduation Selection Modal */}
      <AnimatePresence>
        {isSelectingGraduation && graduationOptions.length > 1 && onSelectGraduation && (
          <GraduationSelectionModal
            options={graduationOptions}
            board={gameState.board}
            playerColor={playerColor}
            highlightedOption={highlightedOption}
            onHighlight={setHighlightedOption}
            onSelect={async (index) => {
              try {
                await onSelectGraduation(index);
                setHighlightedOption(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to select graduation');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface GraduationSelectionModalProps {
  options: Cell[][];
  board: (import('../types').Piece | null)[][];
  playerColor: PlayerColor;
  highlightedOption: number | null;
  onHighlight: (index: number | null) => void;
  onSelect: (index: number) => void;
}

function GraduationSelectionModal({ 
  options, 
  board, 
  playerColor,
  highlightedOption, 
  onHighlight, 
  onSelect 
}: GraduationSelectionModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="card max-w-lg w-full"
      >
        <h2 className="font-display text-2xl font-bold text-center mb-4 text-boop-orange-600">
          🎓 Choose Which 3 to Graduate!
        </h2>
        
        <p className="text-gray-600 text-center mb-4">
          You have multiple 3-in-a-row options. Select which kittens to graduate into cats.
        </p>

        <div className="space-y-3">
          {options.map((option, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onMouseEnter={() => onHighlight(index)}
              onMouseLeave={() => onHighlight(null)}
              onClick={() => onSelect(index)}
              className={`
                w-full p-3 rounded-xl border-2 transition-all
                ${highlightedOption === index 
                  ? 'border-yellow-400 bg-yellow-50 shadow-lg' 
                  : 'border-gray-200 bg-white hover:border-yellow-300 hover:bg-yellow-50/50'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">
                  Option {index + 1}
                </span>
                <div className="flex gap-2">
                  {option.map((cell, cellIndex) => {
                    const piece = board[cell.row][cell.col];
                    return (
                      <div 
                        key={cellIndex}
                        className={`
                          w-10 h-10 rounded-lg flex items-center justify-center text-xl
                          ${playerColor === 'orange' ? 'bg-boop-orange-200' : 'bg-boop-gray-200'}
                        `}
                      >
                        {piece?.type === 'kitten' ? '🐱' : '😼'}
                      </div>
                    );
                  })}
                </div>
                <span className="text-sm text-gray-500">
                  ({option.map(c => `${c.row+1},${c.col+1}`).join(' → ')})
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
