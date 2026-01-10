import { motion } from 'framer-motion';
import { MoveRecord, PlayerColor } from '../types';
import { formatMove } from '../hooks/useGameHistory';

interface HistorySliderProps {
  history: MoveRecord[];
  currentMoveIndex: number;
  onGoToMove: (index: number) => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  isViewingHistory: boolean;
}

export function HistorySlider({
  history,
  currentMoveIndex,
  onGoToMove,
  onGoToStart,
  onGoToEnd,
  onGoBack,
  onGoForward,
  isViewingHistory,
}: HistorySliderProps) {
  const totalMoves = history.length;
  const canGoBack = currentMoveIndex >= 0;
  const canGoForward = currentMoveIndex < totalMoves - 1;
  
  if (totalMoves === 0) {
    return null; // Don't show until there's at least one move
  }
  
  return (
    <div className="history-slider mt-4">
      {/* Main controls */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {/* Navigation buttons */}
        <button
          onClick={onGoToStart}
          disabled={!canGoBack}
          className="history-btn"
          title="Go to start"
        >
          ⏮
        </button>
        <button
          onClick={onGoBack}
          disabled={!canGoBack}
          className="history-btn"
          title="Previous move"
        >
          ◀
        </button>
        
        {/* Move counter */}
        <div className="px-3 py-1 bg-white/80 rounded-lg text-sm font-medium min-w-[80px] text-center">
          {currentMoveIndex === -1 ? (
            <span className="text-gray-500">Start</span>
          ) : (
            <span>Move {currentMoveIndex + 1}/{totalMoves}</span>
          )}
        </div>
        
        <button
          onClick={onGoForward}
          disabled={!canGoForward}
          className="history-btn"
          title="Next move"
        >
          ▶
        </button>
        <button
          onClick={onGoToEnd}
          disabled={!canGoForward}
          className="history-btn"
          title="Go to latest"
        >
          ⏭
        </button>
      </div>
      
      {/* Slider */}
      <div className="px-4">
        <input
          type="range"
          min={-1}
          max={totalMoves - 1}
          value={currentMoveIndex}
          onChange={(e) => onGoToMove(parseInt(e.target.value))}
          className="history-range w-full"
        />
      </div>
      
      {/* Viewing history indicator */}
      {isViewingHistory && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mt-2"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
            <span className="animate-pulse">📜</span>
            Viewing history
            <button
              onClick={onGoToEnd}
              className="ml-1 underline hover:text-blue-900"
            >
              Return to game
            </button>
          </span>
        </motion.div>
      )}
      
      {/* Current move details */}
      {currentMoveIndex >= 0 && history[currentMoveIndex] && (
        <MoveDetails move={history[currentMoveIndex]} />
      )}
    </div>
  );
}

// Detailed view of a single move
function MoveDetails({ move }: { move: MoveRecord }) {
  const playerColor = move.player;
  const bgColor = playerColor === 'orange' ? 'bg-boop-orange-100' : 'bg-boop-gray-100';
  const borderColor = playerColor === 'orange' ? 'border-boop-orange-300' : 'border-boop-gray-300';
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`mt-3 p-3 rounded-lg border ${bgColor} ${borderColor}`}
    >
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className={`font-bold ${playerColor === 'orange' ? 'text-boop-orange-600' : 'text-boop-gray-600'}`}>
            {playerColor === 'orange' ? '🧡' : '🩶'} {move.player}
          </span>
          <span className="font-medium">
            {formatMove(move)}
          </span>
        </div>
        
        {/* Move effects summary */}
        <div className="flex items-center gap-2 text-gray-600">
          {move.boops.length > 0 && (
            <span title="Pieces booped">
              💨 {move.boops.length}
            </span>
          )}
          {move.boops.filter(b => b.to === null).length > 0 && (
            <span title="Pieces booped off board" className="text-red-500">
              ❌ {move.boops.filter(b => b.to === null).length}
            </span>
          )}
          {move.graduations.length > 0 && (
            <span title="Pieces graduated" className="text-yellow-600">
              🎓 {move.graduations.reduce((sum, g) => sum + g.cells.length, 0)}
            </span>
          )}
        </div>
      </div>
      
      {/* Boops detail */}
      {move.boops.length > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          <span className="font-medium">Boops: </span>
          {move.boops.map((boop, i) => (
            <span key={i} className="inline-flex items-center mr-2">
              <span className={boop.piece.color === 'orange' ? 'text-boop-orange-500' : 'text-boop-gray-500'}>
                {boop.piece.type === 'kitten' ? '🐱' : '😼'}
              </span>
              {boop.to ? (
                <span className="text-gray-500">
                  {` ${getCellName(boop.from)}→${getCellName(boop.to)}`}
                </span>
              ) : (
                <span className="text-red-500">
                  {` ${getCellName(boop.from)}→off`}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Helper to get cell name
function getCellName(cell: { row: number; col: number }): string {
  const cols = 'ABCDEF';
  return `${cols[cell.col]}${cell.row + 1}`;
}

// Compact move list for sidebar
interface MoveListProps {
  history: MoveRecord[];
  currentMoveIndex: number;
  onGoToMove: (index: number) => void;
}

export function MoveList({ history, currentMoveIndex, onGoToMove }: MoveListProps) {
  if (history.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-4">
        No moves yet
      </div>
    );
  }
  
  return (
    <div className="move-list max-h-64 overflow-y-auto">
      {/* Start position */}
      <button
        onClick={() => onGoToMove(-1)}
        className={`move-list-item ${currentMoveIndex === -1 ? 'active' : ''}`}
      >
        <span className="text-gray-400">—</span>
        <span className="text-gray-500">Start</span>
      </button>
      
      {history.map((move, index) => (
        <button
          key={index}
          onClick={() => onGoToMove(index)}
          className={`move-list-item ${currentMoveIndex === index ? 'active' : ''}`}
        >
          <span className={`move-number ${move.player === 'orange' ? 'text-boop-orange-500' : 'text-boop-gray-500'}`}>
            {move.moveNumber}.
          </span>
          <span className="move-notation">
            {formatMove(move)}
          </span>
        </button>
      ))}
    </div>
  );
}
