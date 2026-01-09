import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, PlayerColor, PieceType, GameOverInfo, Cell } from '../types';
import { Board, PlayerPool } from './Board';

interface GameProps {
  gameState: GameState;
  playerColor: PlayerColor;
  roomCode: string;
  onPlacePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  onSelectGraduation?: (optionIndex: number) => Promise<boolean>;
  onLeave: () => void;
  gameOver: GameOverInfo | null;
  opponentDisconnected: boolean;
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
  isBotGame = false,
  botThinking = false,
  onRematch,
}: GameProps) {
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType>('kitten');
  const [error, setError] = useState<string | null>(null);
  const [highlightedOption, setHighlightedOption] = useState<number | null>(null);

  const isMyTurn = gameState.currentTurn === playerColor;
  const myPlayer = gameState.players[playerColor];
  const opponentColor: PlayerColor = playerColor === 'orange' ? 'gray' : 'orange';
  const opponent = gameState.players[opponentColor];
  
  // Check if we're in graduation selection phase
  const isSelectingGraduation = gameState.phase === 'selecting_graduation' && 
    gameState.pendingGraduationPlayer === playerColor;
  const graduationOptions = gameState.pendingGraduationOptions || [];

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
              className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-xl mb-4 text-center"
            >
              ⚠️ Your opponent has disconnected
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
                kittensInPool={opponent.kittensInPool}
                catsInPool={opponent.catsInPool}
                isMyTurn={!isMyTurn}
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
              board={gameState.board}
              onCellClick={handleCellClick}
              isMyTurn={isMyTurn}
              lastMove={gameState.lastMove}
              selectedPieceType={isMyTurn ? selectedPieceType : null}
            />
          </div>

          {/* My pool (bottom/right) */}
          {myPlayer && (
            <div className="w-full lg:w-48">
              <PlayerPool
                color={playerColor}
                kittensInPool={myPlayer.kittensInPool}
                catsInPool={myPlayer.catsInPool}
                isMyTurn={isMyTurn}
                selectedPieceType={isMyTurn ? selectedPieceType : null}
                onSelectPiece={handleSelectPiece}
                playerName={myPlayer.name}
                isCurrentPlayer={true}
              />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-sm text-gray-600">
          {isMyTurn ? (
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

      {/* Game Over Modal */}
      <AnimatePresence>
        {gameOver && (
          <GameOverModal 
            gameOver={gameOver} 
            playerColor={playerColor} 
            onLeave={onLeave}
            isBotGame={isBotGame}
            onRematch={onRematch}
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

interface GameOverModalProps {
  gameOver: GameOverInfo;
  playerColor: PlayerColor;
  onLeave: () => void;
  isBotGame?: boolean;
  onRematch?: () => void;
}

function GameOverModal({ gameOver, playerColor, onLeave, isBotGame = false, onRematch }: GameOverModalProps) {
  const isWinner = gameOver.winner === playerColor;
  
  const winMessage = gameOver.winCondition === 'three_cats_in_row' 
    ? '3 Cats in a Row!'
    : 'All 8 Cats on the Board!';

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
        className="card max-w-md w-full text-center"
      >
        <motion.div
          animate={isWinner ? { rotate: [0, -10, 10, -10, 10, 0] } : undefined}
          transition={{ duration: 0.5 }}
        >
          <span className="text-6xl block mb-4">
            {isWinner ? '🎉' : '😿'}
          </span>
        </motion.div>

        <h2 className={`font-display text-3xl font-bold mb-2 ${
          isWinner ? 'text-boop-orange-600' : 'text-boop-gray-600'
        }`}>
          {isWinner ? 'You Win!' : 'You Lose!'}
        </h2>

        <p className="text-gray-600 mb-4">
          {isWinner ? 'Congratulations! ' : 'Better luck next time! '}
          {winMessage}
        </p>

        <div className={`inline-block px-4 py-2 rounded-full text-white font-bold mb-6 ${
          gameOver.winner === 'orange' ? 'bg-boop-orange-500' : 'bg-boop-gray-500'
        }`}>
          {gameOver.winner === 'orange' ? '🧡 Orange' : '🩶 Gray'} Wins!
        </div>

        <div className="space-y-2">
          {isBotGame && onRematch && (
            <button
              onClick={onRematch}
              className="btn-primary w-full"
            >
              🔄 Rematch
            </button>
          )}
          <button
            onClick={onLeave}
            className={isBotGame ? "btn-secondary w-full" : "btn-primary w-full"}
          >
            {isBotGame ? '← Back to Menu' : 'Play Again'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
