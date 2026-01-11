import { motion } from 'framer-motion';
import { Piece as PieceType, PlayerColor } from '../types';

interface PieceProps {
  piece: PieceType;
  size?: 'sm' | 'md' | 'lg';
  isNew?: boolean;
  isGhost?: boolean;
  isGraduating?: boolean;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

export function Piece({ 
  piece, 
  size = 'md', 
  isNew: _isNew = false, // eslint-disable-line @typescript-eslint/no-unused-vars
  isGhost = false,
  isGraduating = false,
  onClick, 
  selected = false, 
  disabled = false 
}: PieceProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const colorClass = piece.color === 'orange' ? 'piece-orange' : 'piece-gray';
  const typeClass = piece.type === 'kitten' ? 'piece-kitten' : 'piece-cat';
  
  // Cat emoji for cats, kitten face for kittens
  const emoji = piece.type === 'cat' ? '😼' : '🐱';
  const emojiSize = size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-3xl';

  // Ghost pieces are semi-transparent with dashed border
  if (isGhost) {
    return (
      <div
        className={`
          ${sizeClasses[size]}
          ${typeClass}
          flex items-center justify-center
          opacity-30
          border-2 border-dashed
          ${piece.color === 'orange' ? 'border-boop-orange-400 bg-boop-orange-100' : 'border-boop-gray-400 bg-boop-gray-100'}
          select-none
        `}
      >
        <span className={`${emojiSize} drop-shadow-md grayscale`}>{emoji}</span>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={!disabled ? { scale: 1.1 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      onClick={disabled ? undefined : onClick}
      className={`
        ${sizeClasses[size]}
        ${colorClass}
        ${typeClass}
        flex items-center justify-center
        ${onClick && !disabled ? 'cursor-pointer hover:shadow-piece-hover' : ''}
        ${selected ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}
        ${disabled ? 'opacity-50' : ''}
        ${isGraduating ? 'graduating-glow' : ''}
        select-none
      `}
    >
      <span className={`${emojiSize} drop-shadow-md`}>{emoji}</span>
    </motion.div>
  );
}

interface PiecePreviewProps {
  color: PlayerColor;
  type: 'kitten' | 'cat';
  count: number;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

export function PiecePreview({ color, type, count, onClick, selected = false, disabled = false }: PiecePreviewProps) {
  const piece = { color, type };
  
  return (
    <div className="flex flex-col items-center gap-1">
      <Piece 
        piece={piece} 
        size="md" 
        onClick={onClick} 
        selected={selected}
        disabled={disabled || count === 0}
      />
      <span className={`text-sm font-bold ${count === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
        {count}
      </span>
    </div>
  );
}
