import { motion } from 'framer-motion';
import { Board as BoardType, PlayerColor, PieceType, Cell, Piece as PieceData, BoopEffect } from '../types';
import { Piece } from './Piece';

// Ghost piece data to show where pieces were before being booped
interface GhostPiece {
  row: number;
  col: number;
  piece: PieceData;
}

// Fallen piece with calculated position in gutter
interface FallenPiece {
  gutterRow: number;  // -1 for top, 6 for bottom (in board coords)
  gutterCol: number;  // -1 for left, 6 for right (in board coords)
  piece: PieceData;
}

interface BoardProps {
  board: BoardType;
  onCellClick: (row: number, col: number) => void;
  isMyTurn: boolean;
  lastMove: Cell | null;
  selectedPieceType: PieceType | null;
  boopedPieces?: BoopEffect[];
  graduatedPieces?: Cell[];
  ghostPieces?: GhostPiece[];
  highlightedCell?: Cell | null;  // For highlighting placed piece in history view
  isViewingHistory?: boolean;  // When true, clicking returns to current game
  fallenPieces?: FallenPiece[];  // Pieces that fell off this turn
  animationKey?: number;  // Changes when animation should restart
}

// Calculate where a piece would land in the gutter based on boop direction
export function calculateFallenPosition(from: Cell, piece: PieceData): FallenPiece | null {
  const { row, col } = from;
  
  let gutterRow = row;
  let gutterCol = col;
  
  // Check which edge the piece was closest to
  if (row === 0) gutterRow = -1;
  else if (row === 5) gutterRow = 6;
  else if (col === 0) gutterCol = -1;
  else if (col === 5) gutterCol = 6;
  else {
    const distToTop = row;
    const distToBottom = 5 - row;
    const distToLeft = col;
    const distToRight = 5 - col;
    
    const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);
    
    if (minDist === distToTop) gutterRow = -1;
    else if (minDist === distToBottom) gutterRow = 6;
    else if (minDist === distToLeft) gutterCol = -1;
    else gutterCol = 6;
  }
  
  return { gutterRow, gutterCol, piece };
}

export function Board({ 
  board, 
  onCellClick, 
  isMyTurn, 
  lastMove, 
  selectedPieceType,
  boopedPieces = [],
  graduatedPieces = [],
  ghostPieces = [],
  highlightedCell = null,
  isViewingHistory = false,
  fallenPieces = [],
  animationKey = 0
}: BoardProps) {
  const BOARD_SIZE = 6;
  const CELL_SIZE = 64;

  // Check if a piece at this position was just booped (moved from somewhere)
  const getBoopAnimation = (row: number, col: number): { fromRow: number; fromCol: number } | null => {
    const booped = boopedPieces.find(bp => bp.to?.row === row && bp.to?.col === col);
    if (booped) {
      return { fromRow: booped.from.row, fromCol: booped.from.col };
    }
    return null;
  };

  // Check if a piece at this position is graduating
  const isGraduating = (row: number, col: number): boolean => {
    return graduatedPieces.some(gp => gp.row === row && gp.col === col);
  };

  // Check if there's a ghost at this position
  const getGhost = (row: number, col: number): PieceData | null => {
    const ghost = ghostPieces.find(gp => gp.row === row && gp.col === col);
    return ghost?.piece || null;
  };

  // Check if this cell is highlighted (placed piece in history)
  const isHighlighted = (row: number, col: number): boolean => {
    return highlightedCell?.row === row && highlightedCell?.col === col;
  };

  // Get fallen piece for a gutter position
  const getFallenPiece = (gutterRow: number, gutterCol: number): PieceData | null => {
    const fallen = fallenPieces.find(fp => fp.gutterRow === gutterRow && fp.gutterCol === gutterCol);
    return fallen?.piece || null;
  };

  // Handle cell click
  const handleCellClick = (row: number, col: number) => {
    onCellClick(row, col);
  };

  // Render a gutter cell (outside the playable area) - same size as board cells
  const renderGutterCell = (gutterRow: number, gutterCol: number) => {
    const fallenPiece = getFallenPiece(gutterRow, gutterCol);
    const isCorner = (gutterRow < 0 || gutterRow >= BOARD_SIZE) && 
                     (gutterCol < 0 || gutterCol >= BOARD_SIZE);
    
    return (
      <div
        key={`gutter-${gutterRow}-${gutterCol}`}
        className={`
          w-14 h-14 sm:w-16 sm:h-16
          flex items-center justify-center
          ${isCorner ? '' : 'gutter-cell'}
        `}
      >
        {fallenPiece && (
          <motion.div
            key={`fallen-${gutterRow}-${gutterCol}`}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 0.7 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fallen-piece"
          >
            <Piece 
              piece={fallenPiece} 
              size="lg"
              isGhost={false}
            />
          </motion.div>
        )}
      </div>
    );
  };

  // Animation timing constants
  const DROP_DURATION = 0.4;
  const BOOP_DELAY = DROP_DURATION + 0.1; // Wait for drop to complete
  const BOOP_DURATION = 0.5;

  // Drop animation for newly placed pieces (from above)
  const dropAnimation = {
    initial: { y: -60, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { 
      duration: DROP_DURATION,
      ease: [0.34, 1.56, 0.64, 1], // Custom bounce ease
    }
  };

  // Hop animation for booped pieces - delayed until after drop completes
  const getHopAnimation = (fromRow: number, fromCol: number, toRow: number, toCol: number, hasNewPlacement: boolean) => {
    const deltaX = (fromCol - toCol) * CELL_SIZE;
    const deltaY = (fromRow - toRow) * CELL_SIZE;
    const delay = hasNewPlacement ? BOOP_DELAY : 0;
    
    return {
      initial: { x: deltaX, y: deltaY, opacity: 0.7 },
      animate: { x: 0, y: 0, opacity: 1 },
      transition: {
        duration: BOOP_DURATION,
        delay: delay,
        ease: "easeOut"
      }
    };
  };

  // Check if there's a new placement in this render
  const hasNewPlacement = lastMove && !isViewingHistory;

  return (
    <div className="relative">
      {/* Bed frame with extended gutter */}
      <div className="bg-amber-800 rounded-2xl p-2 shadow-2xl">
        {/* Outer container with subtle gutter indication */}
        <div className="bg-amber-900/30 rounded-xl p-1">
          {/* 8x8 grid: gutter + 6x6 board + gutter */}
          <div className="grid grid-cols-8 gap-0">
            {/* Top gutter row */}
            {Array.from({ length: 8 }).map((_, col) => 
              renderGutterCell(-1, col - 1)
            )}
            
            {/* Main board rows with side gutters */}
            {Array.from({ length: BOARD_SIZE }).map((_, row) => (
              <>
                {/* Left gutter */}
                {renderGutterCell(row, -1)}
                
                {/* Board cells */}
                {Array.from({ length: BOARD_SIZE }).map((_, col) => {
                  const piece = board[row][col];
                  const isLastMove = lastMove?.row === row && lastMove?.col === col;
                  const canPlace = !piece && isMyTurn && selectedPieceType && !isViewingHistory;
                  const boopAnim = getBoopAnimation(row, col);
                  const graduating = isGraduating(row, col);
                  const ghostPiece = getGhost(row, col);
                  const highlighted = isHighlighted(row, col);
                  
                  // Determine if this is a new placement (drop animation)
                  const isNewPlacement = highlighted || (isLastMove && !boopAnim && !isViewingHistory);
                  
                  // Only animated pieces get the animationKey in their key
                  const shouldAnimate = boopAnim || isNewPlacement;
                  const pieceKey = shouldAnimate 
                    ? `piece-${row}-${col}-${animationKey}` 
                    : `piece-${row}-${col}-${piece?.color}-${piece?.type}`;

                  return (
                    <motion.div
                      key={`cell-${row}-${col}`}
                      whileHover={canPlace ? { scale: 1.05 } : undefined}
                      whileTap={canPlace ? { scale: 0.95 } : undefined}
                      onClick={() => handleCellClick(row, col)}
                      className={`
                        relative
                        w-14 h-14 sm:w-16 sm:h-16
                        bg-amber-50 rounded-lg
                        border-2 border-amber-200
                        stitched
                        flex items-center justify-center
                        transition-colors duration-200
                        ${canPlace ? 'cursor-pointer hover:bg-amber-100 cell-empty' : ''}
                        ${isLastMove && !isViewingHistory ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}
                        ${highlighted ? 'ring-3 ring-blue-400 ring-offset-1 bg-blue-50' : ''}
                        ${isViewingHistory ? 'cursor-pointer' : ''}
                      `}
                    >
                      {/* Ghost piece (where a piece was before booping) */}
                      {ghostPiece && !piece && (
                        <div className="absolute inset-0 flex items-center justify-center ghost-piece opacity-30">
                          <Piece 
                            piece={ghostPiece} 
                            size="lg"
                            isGhost={true}
                          />
                        </div>
                      )}

                      {/* Actual piece */}
                      {piece && (
                        <motion.div
                          key={pieceKey}
                          {...(boopAnim 
                            ? getHopAnimation(boopAnim.fromRow, boopAnim.fromCol, row, col, !!hasNewPlacement)
                            : isNewPlacement
                              ? dropAnimation
                              : { initial: false }
                          )}
                          className={`relative ${graduating ? 'graduating-piece' : ''}`}
                        >
                          {/* Hop arc effect - extra vertical bounce for booped pieces */}
                          {boopAnim ? (
                            <motion.div
                              initial={{ y: 0 }}
                              animate={{ y: [0, -20, 0] }}
                              transition={{ 
                                duration: BOOP_DURATION, 
                                times: [0, 0.4, 1], 
                                ease: "easeInOut",
                                delay: hasNewPlacement ? BOOP_DELAY : 0
                              }}
                            >
                              <Piece 
                                piece={piece} 
                                size="lg"
                                isNew={false}
                                isGraduating={graduating}
                              />
                            </motion.div>
                          ) : (
                            <Piece 
                              piece={piece} 
                              size="lg"
                              isNew={isNewPlacement}
                              isGraduating={graduating}
                            />
                          )}
                          
                          {/* Graduation sparkles */}
                          {graduating && (
                            <div className="graduation-sparkles">
                              <span className="sparkle sparkle-1">✨</span>
                              <span className="sparkle sparkle-2">⭐</span>
                              <span className="sparkle sparkle-3">✨</span>
                              <span className="sparkle sparkle-4">⭐</span>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
                
                {/* Right gutter */}
                {renderGutterCell(row, 6)}
              </>
            ))}
            
            {/* Bottom gutter row */}
            {Array.from({ length: 8 }).map((_, col) => 
              renderGutterCell(6, col - 1)
            )}
          </div>
        </div>
      </div>

      {/* Turn indicator overlay - only when not viewing history */}
      {!isMyTurn && !isViewingHistory && (
        <div className="absolute inset-0 bg-black/10 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg">
            <span className="text-gray-600 font-medium">Opponent's turn...</span>
          </div>
        </div>
      )}

      {/* History viewing indicator */}
      {isViewingHistory && (
        <div className="absolute inset-0 rounded-2xl flex items-end justify-center pointer-events-none pb-2">
          <div className="bg-blue-500/90 px-3 py-1 rounded-full shadow-lg">
            <span className="text-white text-sm font-medium">📜 Click board to return</span>
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
