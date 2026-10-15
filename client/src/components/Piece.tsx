import { motion } from 'framer-motion';
import { Piece as PieceType, PlayerColor } from '../types';

type PieceSize = 'sm' | 'md' | 'lg';
interface PieceProps {
  piece: PieceType;
  size?: PieceSize;
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
  isNew = false,
  isGhost = false,
  isGraduating = false,
  onClick,
  selected = false,
  disabled = false,
}: PieceProps) {
  const sizeClasses: Record<PieceSize, string> = {
    sm: 'w-9 h-9',
    md: 'w-14 h-14',
    lg: 'w-[4.35rem] h-[4.35rem]',
  };
  const title = `${piece.color} ${piece.type}`;

  return (
    <motion.div
      whileHover={!disabled && !isGhost ? { scale: 1.08, y: -2 } : undefined}
      whileTap={!disabled && !isGhost ? { scale: 0.96 } : undefined}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? title : undefined}
      className={`
        kitten-piece ${sizeClasses[size]}
        ${piece.type === 'cat' ? 'kitten-piece-grown' : ''}
        ${piece.color === 'orange' ? 'kitten-piece-orange' : 'kitten-piece-gray'}
        ${isGhost ? 'kitten-piece-ghost' : ''}
        ${onClick && !disabled ? 'cursor-pointer' : ''}
        ${selected ? 'kitten-piece-selected' : ''}
        ${disabled ? 'opacity-45' : ''}
        ${isGraduating ? 'graduating-glow' : ''}
        ${isNew ? 'kitten-piece-new' : ''}
        select-none
      `}
    >
      <span className="kitten-shadow" />
      <span className="pool-cat-icon" aria-hidden="true">
        <span className="pool-cat-ears" />
        <span className="pool-cat-face">
          <i /><i /><b />
        </span>
      </span>
      {selected && <span className="kitten-selected-pip" aria-hidden="true">♥</span>}
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
  return (
    <div className="flex flex-col items-center gap-1">
      <Piece
        piece={{ color, type }}
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
