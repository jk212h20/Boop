import type { Cell } from './types';
export function optionsAt(options: Cell[][], row: number, col: number): number[] {
  return options.flatMap((cells, index) => cells.some(c => c.row === row && c.col === col) ? [index] : []);
}
export function promotionLabel(cells: Cell[]): string {
  const first = cells[0];
  if (cells.length === 1) return `Kitten ${String.fromCharCode(65 + first.col)}${first.row + 1}`;
  const direction = cells.every(c => c.row === first.row) ? 'Horizontal' : cells.every(c => c.col === first.col) ? 'Vertical' : 'Diagonal';
  return `${direction} three ${cells.map(c => `${String.fromCharCode(65 + c.col)}${c.row + 1}`).join(', ')}`;
}
