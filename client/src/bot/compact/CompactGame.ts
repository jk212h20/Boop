// Search-only rules. No UI metadata/animation allocations and no canonical calls.
import type { GameState, PlayerColor } from '../../types';
import type { Move } from '../types';

export interface CompactState {
  board: Uint8Array; // 0 empty, 1 orange kitten, 2 orange cat, 3 gray kitten, 4 gray cat
  stock: Int8Array; // kittens, cats, retired, for orange then gray
  turn: number;
  phase: number; // 0 playing, 1 selecting graduation, 2 finished
  pending: number; // -1 or owner
  winner: number; // -1 or owner
  options: number[][];
}
export const owner = (p: number) => (p - 1) >> 1;
export const colorIndex = (c: PlayerColor) => c === 'orange' ? 0 : 1;
export const colorName = (c: number): PlayerColor => c === 0 ? 'orange' : 'gray';
const valid = (r: number, c: number) => r >= 0 && r < 6 && c >= 0 && c < 6;
const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const rays: number[][] = [];
const windows: number[][] = [];
const pushes: number[][][] = [];
for (let i=0;i<36;i++) {
  const r=Math.floor(i/6),c=i%6;
  pushes[i]=[];
  for(const [dr,dc] of directions) if(valid(r+dr,c+dc))
    pushes[i].push([(r+dr)*6+c+dc, valid(r+2*dr,c+2*dc)?(r+2*dr)*6+c+2*dc:-1]);
  for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    const ray:number[]=[];
    for(let rr=r,cc=c;valid(rr,cc);rr+=dr,cc+=dc) ray.push(rr*6+cc);
    if(ray.length>=3) { rays.push(ray); windows.push(ray.slice(0,3)); }
  }
}
export function encode(state: GameState): CompactState {
  const board=new Uint8Array(36),stock=new Int8Array(6);
  for(let i=0;i<36;i++) {const p=state.board[Math.floor(i/6)][i%6];if(p)board[i]=1+colorIndex(p.color)*2+Number(p.type==='cat');}
  for(let c=0;c<2;c++) {const p=state.players[colorName(c)];if(!p)throw new Error('Compact search requires two players'); stock.set([p.kittensInPool,p.catsInPool,p.kittensRetired],c*3);}
  if(!['playing','selecting_graduation','finished'].includes(state.phase))throw new Error('Unsupported compact search phase');
  return {board,stock,turn:colorIndex(state.currentTurn),phase:state.phase==='finished'?2:state.phase==='selecting_graduation'?1:0,
    pending:state.pendingGraduationPlayer?colorIndex(state.pendingGraduationPlayer):-1,winner:state.winner?colorIndex(state.winner):-1,
    options:state.pendingGraduationOptions?.map(o=>o.map(c=>c.row*6+c.col))??[]};
}
export function copy(s:CompactState):CompactState {return {...s,board:s.board.slice(),stock:s.stock.slice()};}
export function legalMoves(s:CompactState):Move[] {
  const moves:Move[]=[];const k=s.stock[s.turn*3]>0,c=s.stock[s.turn*3+1]>0;
  for(let i=0;i<36;i++)if(!s.board[i]){if(k)moves.push({row:Math.floor(i/6),col:i%6,pieceType:'kitten'});if(c)moves.push({row:Math.floor(i/6),col:i%6,pieceType:'cat'});}
  return moves;
}
export function wins(s:CompactState,c:number):boolean {
  const cat=2+c*2;let n=0;
  for(let i=0;i<36;i++)if(s.board[i]===cat)n++;
  if(n>=8)return true;
  if(n<3)return false;
  for(const line of windows)if(s.board[line[0]]===cat&&s.board[line[1]]===cat&&s.board[line[2]]===cat)return true;
  return false;
}
export function graduationOptions(s:CompactState,c:number):number[][] {
  const options:number[][]=[],seen=new Set<number>(),b=s.board;
  // Follow canonical start/direction/ray order, including overlapping windows.
  for(const ray of rays) {
    let length=0;while(length<ray.length&&b[ray[length]]&&owner(b[ray[length]])===c)length++;
    for(let j=0;j<=length-3;j++) {
      const a=ray[j],d=ray[j+1],e=ray[j+2];
      if(!(b[a]&1)&&!(b[d]&1)&&!(b[e]&1))continue;
      const key=a*1296+d*36+e;
      if(!seen.has(key)){seen.add(key);options.push([a,d,e]);}
    }
  }
  let count=0;for(let i=0;i<36;i++)if(b[i]&&owner(b[i])===c)count++;
  if(count>=8&&s.stock[c*3+2]+s.stock[c*3+1]<8)
    for(let i=0;i<36;i++)if(b[i]===1+c*2)options.push([i]);
  return options;
}
function graduate(s:CompactState,c:number,option:number[]) {
  for(const i of option) {const p=s.board[i];if(!p)continue;s.board[i]=0;s.stock[c*3+1]++;if(p&1)s.stock[c*3+2]++;}
}
function checkGraduation(s:CompactState,c:number):boolean {
  const options=graduationOptions(s,c);
  if(options.length===1)graduate(s,c,options[0]);
  if(options.length>1){s.phase=1;s.pending=c;s.options=options;return true;}
  return false;
}
export function place(s:CompactState,row:number,col:number,cat:boolean):CompactState|null {
  if(s.phase!==0||!Number.isInteger(row)||!Number.isInteger(col)||!valid(row,col))return null;
  const i=row*6+col,c=s.turn,slot=c*3+Number(cat);
  if(s.board[i]||s.stock[slot]<=0)return null;
  const t=copy(s);t.board[i]=1+c*2+Number(cat);t.stock[slot]--;
  for(const [adj,dest] of pushes[i]) {
    const p=t.board[adj];if(!p||(!cat&&!(p&1))||(dest>=0&&t.board[dest]))continue;
    t.board[adj]=0;if(dest>=0)t.board[dest]=p;else t.stock[owner(p)*3+Number(!(p&1))]++;
  }
  const winner=wins(t,c)?c:wins(t,1-c)?1-c:-1;
  if(winner>=0){t.phase=2;t.winner=winner;return t;}
  if(checkGraduation(t,c)||checkGraduation(t,1-c))return t;
  t.turn=1-c;return t;
}
export function select(s:CompactState,index:number):CompactState|null {
  if(s.phase!==1||s.pending<0||!Number.isInteger(index)||index<0||index>=s.options.length)return null;
  const t=copy(s),c=s.pending;
  graduate(t,c,s.options[index]);t.options=[];t.pending=-1;
  if(c===s.turn&&checkGraduation(t,1-c))return t;
  if(wins(t,c)){t.phase=2;t.winner=c;return t;}
  t.phase=0;t.turn=1-s.turn;return t;
}
/** Compare search-relevant state only: UI events/lastMove are intentionally absent. */
export function snapshot(s:CompactState) {
  return {board:Array.from(s.board),stock:Array.from(s.stock),turn:s.turn,phase:s.phase,pending:s.pending,winner:s.winner,options:s.options};
}
