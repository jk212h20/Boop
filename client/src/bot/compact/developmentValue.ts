// Experimental durable-progress features. Pure geometry, not extra search work.
import { CompactState, owner } from './CompactGame';
import { LINE_WINDOWS } from './evaluation';
import { eightCatValue } from './eightCatValue';
const attacks: readonly (readonly number[])[] = Array.from({length:36},(_,i)=>{
 const r=Math.floor(i/6),c=i%6,entries:number[]=[];
 for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
  if(!dr&&!dc)continue;
  const ar=r-dr,ac=c-dc,tr=r+dr,tc=c+dc;
  if(ar>=0&&ar<6&&ac>=0&&ac<6&&(tr<0||tr>=6||tc<0||tc>=6))entries.push(ar*6+ac);
 }
 return entries;
});
export interface DevelopmentFeatures {
 ownedAdults:number; deployedKittens:number; openKittenWindows:number;
 exposedCats:number; exposedKittens:number; adultProgress:number;
 development:number; exposure:number;
}
export function developmentFeatures(s:CompactState,color:number):DevelopmentFeatures {
 let ownedAdults=s.stock[color*3+1],deployedKittens=0,openKittenWindows=0,exposedCats=0,exposedKittens=0;
 const opp=1-color,canCat=s.stock[opp*3+1]>0,canKitten=s.stock[opp*3]>0;
 for(let i=0;i<36;i++){
  const p=s.board[i];if(!p||owner(p)!==color)continue;
  const kitten=!!(p&1);if(kitten)deployedKittens++;else ownedAdults++;
  if((canCat||(kitten&&canKitten))&&attacks[i].some(square=>s.board[square]===0)){
   if(kitten)exposedKittens++;else exposedCats++;
  }
 }
 for(const line of LINE_WINDOWS){
  let kittens=0,occupied=0,blocked=false;
  for(const i of line){const p=s.board[i];if(!p)continue;if(owner(p)!==color){blocked=true;break;}occupied++;if(p&1)kittens++;}
  if(!blocked&&occupied===1&&kittens===1)openKittenWindows++;
 }
 const development=(10*deployedKittens+2*Math.min(12,openKittenWindows))*Math.max(0,8-ownedAdults)/8;
 return {ownedAdults,deployedKittens,openKittenWindows,exposedCats,exposedKittens,
  adultProgress:eightCatValue(s,color),development,exposure:24*exposedCats+8*exposedKittens};
}
export function developmentValue(s:CompactState,color:number):number {
 const f=developmentFeatures(s,color);return f.adultProgress+f.development;
}
export function retentionValue(s:CompactState,color:number):number {
 const f=developmentFeatures(s,color);return f.adultProgress+f.development-f.exposure;
}
