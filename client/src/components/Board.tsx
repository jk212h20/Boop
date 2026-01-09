import { motion, AnimatePresence } from 'framer-motion';
import { Board as BoardType, PlayerColor, PieceType, Cell } from '../types';
import { Piece } from './Piece';

interface BoardProps {
  board: BoardType;
  onCellClick: (row: number, col: number) => void;
  isMyTurn: boolean;
  lastMove: Cell | null;
  selectedPieceType: PieceType | null;
}

export function Board({ board, onCellClick, isMyTurn, lastMove, selectedPieceType }: BoardProps) {
  const BOARD_SIZE = 6;

  return (
    <div className="relative">
      {/* Bed frame */}
      <div className="bg-amber-800 rounded-2xl p-4 shadow-2xl">
        {/* Quilt/Board */}
        <div className="bg-amber-100 rounded-xl p-2 quilt-pattern">
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: BOARD_SIZE }).map((_, row) =>
              Array.from({ length: BOARD_SIZE }).map((_, col) => {
                const piece = board[row][col];
                const isLastMove = lastMove?.row === row && lastMove?.col === col;
                const canPlace = !piece && isMyTurn && selectedPieceType;

                return (
                  <motion.div
                    key={`${row}-${col}`}
                    whileHover={canPlace ? { scale: 1.05 } : undefined}
                    whileTap={canPlace ? { scale: 0.95 } : undefined}
                    onClick={() => canPlace && onCellClick(row, col)}
                    className={`
                      w-14 h-14 sm:w-16 sm:h-16
                      bg-amber-50 rounded-lg
                      border-2 border-amber-200
                      stitched
                      flex items-center justify-center
                      transition-all duration-200
                      ${canPlace ? 'cursor-pointer hover:bg-amber-100 cell-empty' : ''}
                      ${isLastMove ? 'ring-2 ring-yellow-400' : ''}
                    `}
                  >
                    <AnimatePresence mode="wait">
                      {piece && (
                        <Piece 
                          key={`piece-${row}-${col}`}
                          piece={piece} 
                          size="lg"
                          isNew={isLastMove}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Turn indicator overlay */}
      {!isMyTurn && (
        <div className="absolute inset-0 bg-black/10 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg">
            <span className="text-gray-600 font-medium">Opponent's turn...</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlayerPoolProps {
  color: PlayerColor;
  kittensInPool: number;
  catsInPool: number;
  isMyTurn: boolean;
  selectedPieceType: PieceType | null;
  onSelectPiece: (type: PieceType) => void;
  playerName: string;
  isCurrentPlayer: boolean;
}

export function PlayerPool({ 
  color, 
  kittensInPool, 
  catsInPool, 
  isMyTurn, 
  selectedPieceType, 
  onSelectPiece,
  playerName,
  isCurrentPlayer 
}: PlayerPoolProps) {
  const borderColor = color === 'orange' ? 'border-boop-orange-400' : 'border-boop-gray-400';
  const bgColor = color === 'orange' ? 'bg-boop-orange-50' : 'bg-boop-gray-50';
  
  return (
    <div className={`
      card border-2 ${borderColor} ${bgColor}
      ${isMyTurn && isCurrentPlayer ? 'turn-active' : ''}
    `}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-lg capitalize">
          {isCurrentPlayer ? '👤 You' : `🎮 ${playerName}`}
        </h3>
        {isMyTurn && isCurrentPlayer && (
          <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
            Your Turn!
          </span>
        )}
      </div>
      
      <div className="flex gap-4 justify-center">
        <div className="flex flex-col items-center">
          <motion.button
            whileHover={isCurrentPlayer && isMyTurn && kittensInPool > 0 ? { scale: 1.1 } : undefined}
            whileTap={isCurrentPlayer && isMyTurn && kittensInPool > 0 ? { scale: 0.95 } : undefined}
            onClick={() => isCurrentPlayer && isMyTurn && kittensInPool > 0 && onSelectPiece('kitten')}
            disabled={!isCurrentPlayer || !isMyTurn || kittensInPool === 0}
            className={`
              w-14 h-14 rounded-full flex items-center justify-center text-3xl
              ${color === 'orange' ? 'bg-boop-orange-400' : 'bg-boop-gray-400'}
              ${selectedPieceType === 'kitten' ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}
              ${!isCurrentPlayer || !isMyTurn || kittensInPool === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer shadow-piece hover:shadow-piece-hover'}
              transition-all
            `}
          >
            🐱
          </motion.button>
          <span className={`text-sm font-bold mt-1 ${kittensInPool === 0 ? 'text-gray-400' : ''}`}>
            {kittensInPool} 🐱
          </span>
        </div>

        <div className="flex flex-col items-center">
          <motion.button
            whileHover={isCurrentPlayer && isMyTurn && catsInPool > 0 ? { scale: 1.1 } : undefined}
            whileTap={isCurrentPlayer && isMyTurn && catsInPool > 0 ? { scale: 0.95 } : undefined}
            onClick={() => isCurrentPlayer && isMyTurn && catsInPool > 0 && onSelectPiece('cat')}
            disabled={!isCurrentPlayer || !isMyTurn || catsInPool === 0}
            className={`
              w-14 h-14 rounded-lg flex items-center justify-center text-3xl
              ${color === 'orange' ? 'bg-boop-orange-500' : 'bg-boop-gray-500'}
              ${selectedPieceType === 'cat' ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}
              ${!isCurrentPlayer || !isMyTurn || catsInPool === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer shadow-piece hover:shadow-piece-hover'}
              transition-all
            `}
          >
            😼
          </motion.button>
          <span className={`text-sm font-bold mt-1 ${catsInPool === 0 ? 'text-gray-400' : ''}`}>
            {catsInPool} 😼
          </span>
        </div>
      </div>
    </div>
  );
}
