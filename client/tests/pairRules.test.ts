import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, executeMove } from '../src/bot/LocalGame';
import { pairValue } from '../src/bot/evaluation';
import { DEFAULT_BOT_CONFIG } from '../src/bot/types';

test('predicted direct wins match canonical rules across every pair and blocker orientation',()=>{
 let checked=0;
 for(let a=0;a<36;a++)for(let b=a+1;b<36;b++)for(const blockers of [false,true]){
  const s=createInitialGameState();s.players.orange!.catsInPool=6;s.players.orange!.kittensInPool=0;
  s.board[Math.floor(a/6)][a%6]={color:'orange',type:'cat'};
  s.board[Math.floor(b/6)][b%6]={color:'orange',type:'cat'};
  if(blockers){
   // Deterministic sparse other-colour blockers; no friendly third adult.
   for(let i=0;i<36;i++)if(i!==a&&i!==b&&(i+a+b)%5===0)s.board[Math.floor(i/6)][i%6]={color:'gray',type:'kitten'};
  }
  // Compare only direct completions of the existing pair. Wins produced by
  // booping a pair into a different line are intentionally search territory.
  let actual=0;
  for(let cell=0;cell<36;cell++){
   if(s.board[Math.floor(cell/6)][cell%6])continue;
   const dr=Math.floor(b/6)-Math.floor(a/6),dc=b%6-a%6;
   const r=Math.floor(cell/6),c=cell%6;
   const aligned=(dr===0&&r===Math.floor(a/6))||(dc===0&&c===a%6)||(Math.abs(dr)===Math.abs(dc)&&dr*(c-a%6)===dc*(r-Math.floor(a/6)));
   const rows=[Math.floor(a/6),Math.floor(b/6),r],cols=[a%6,b%6,c];
   if(!aligned||Math.max(...rows)-Math.min(...rows)>2||Math.max(...cols)-Math.min(...cols)>2)continue;
   const next=executeMove(s,r,c,'cat','orange').newState;
   if(next.winner==='orange'&&next.board[Math.floor(a/6)][a%6]?.color==='orange'&&next.board[Math.floor(b/6)][b%6]?.color==='orange')actual++;
  }
  assert.equal(pairValue(s,'orange',DEFAULT_BOT_CONFIG).winningSquares,actual,`pair ${a},${b} blockers ${blockers}`);checked++;
 }
 assert.equal(checked,1260);
});
