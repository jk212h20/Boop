import type { CompactState } from './CompactGame';

/** Experimental long-horizon progress term, never a substitute terminal score.
 * Total adults already receive v4's permanent 65 points. This term values getting
 * those adults onto the bed, not merely owning them in reserve. Every square
 * gets a base reward (including corners); an increasing bonus values nearing
 * eight, scaled by adult availability. No bonus for hypothetical reserve cats
 * being safely deployed, and no claim that seven cats is a forced win.
 */
export function eightCatValue(s:CompactState,color:number):number {
  let onBoard=0;
  for(let i=0;i<36;i++)if(s.board[i]===2+color*2)onBoard++;
  const owned=onBoard+s.stock[color*3+1];
  return 22*onBoard+4*Math.max(0,onBoard-3)**2*Math.min(8,owned)/8;
}
