// Canonical-rules oracle. No compact transitions, TT, history or work cutoff.
import { pairValue } from '../src/bot/evaluation';
import { DEFAULT_BOT_CONFIG as cfg, type Move } from '../src/bot/types';
import { executeMove, getAllValidMoves, resolveGraduationChoice } from '../src/bot/LocalGame';
import type { GameState, PlayerColor } from '../src/types';
const opponent=(c:PlayerColor):PlayerColor=>c==='orange'?'gray':'orange';
export function breakdown(s:GameState,c:PlayerColor){
 let position=0,owned=s.players[c]!.catsInPool,boardCats=0,boardKittens=0;
 for(let r=0;r<6;r++)for(let col=0;col<6;col++){
  const p=s.board[r][col];if(!p||p.color!==c)continue;
  if(p.type==='cat'){owned++;boardCats++;}else boardKittens++;
  const pos=(r===0||r===5)&&(col===0||col===5)?cfg.pieceInCorner:
   r===0||r===5||col===0||col===5?cfg.pieceOnEdge:
   r>=2&&r<=3&&col>=2&&col<=3?cfg.pieceInCenter:cfg.pieceInInnerRing;
  position+=pos*(p.type==='cat'?cfg.catMultiplier:1);
 }
 const pairs=pairValue(s,c,cfg);
 return {position,inventory:owned*65,pairs,boardCats,boardKittens,total:position+owned*65+pairs.score};
}
export function evaluate(s:GameState,c:PlayerColor):number {
 if(s.phase==='finished')return s.winner===c?100000:-100000;
 return breakdown(s,c).total-breakdown(s,opponent(c)).total;
}
type Action=Move|number;
export function children(s:GameState):{action:Action;state:GameState}[]{
 if(s.phase==='selecting_graduation')return s.pendingGraduationOptions!.map((_,i)=>({action:i,state:resolveGraduationChoice(s,i).newState}));
 return getAllValidMoves(s,s.currentTurn).map(m=>({action:m,state:executeMove(s,m.row,m.col,m.pieceType,s.currentTurn).newState}));
}
let visits=0;
export function resetVisits(){visits=0;}
export function getVisits(){return visits;}
export function minimax(s:GameState,depth:number,c:PlayerColor,alpha=-Infinity,beta=Infinity):number {
 visits++;
 if(s.phase==='finished'||(depth<=0&&s.phase!=='selecting_graduation'))return evaluate(s,c);
 const maximize=(s.pendingGraduationPlayer??s.currentTurn)===c;
 let best=maximize?-Infinity:Infinity;
 const kids=children(s);if(!kids.length)return evaluate(s,c);
 // Oracle static ordering affects cost only, not exact full-window root values.
 kids.sort((a,b)=>(maximize?1:-1)*(evaluate(b.state,c)-evaluate(a.state,c)));
 for(const child of kids){
  const value=minimax(child.state,depth-(s.phase==='playing'?1:0),c,alpha,beta);
  best=maximize?Math.max(best,value):Math.min(best,value);
  if(maximize)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
  if(alpha>=beta)break;
 }
 return best;
}
