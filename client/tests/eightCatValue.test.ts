import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState,executeMove } from '../src/bot/LocalGame';
import { encode } from '../src/bot/compact/CompactGame';
import { eightCatValue } from '../src/bot/compact/eightCatValue';
import { createBot } from '../src/bot/experimental/ProgressBot';
import { corpus } from '../tools/botRepro';
test('adult deployment increases value even at the edge; near-eight acceleration is bounded',()=>{
 const s=encode(createInitialGameState());s.stock[0]=0;s.stock[1]=8;
 let previous=0;
 for(let n=0;n<8;n++){
  s.board[n]=2;s.stock[1]--;const value=eightCatValue(s,0);
  assert.ok(value>previous);if(n>=4)assert.ok(value-previous>22);previous=value;
 }
 assert.ok(previous<1000);assert.equal(eightCatValue(s,1),0);
 const swapped={...s,board:Uint8Array.from(s.board,p=>p?4:0),stock:Int8Array.from([8,0,0,0,0,0])};
 assert.equal(eightCatValue(swapped,1),previous);
});
test('progress candidate takes an eight-cat win over heuristic rewards',()=>{
 const s=createInitialGameState();s.players.orange!.kittensInPool=0;s.players.orange!.catsInPool=1;
 for(const [r,c] of [[0,0],[0,2],[0,4],[2,0],[2,4],[4,0],[4,2]])s.board[r][c]={color:'orange',type:'cat'};
 const m=createBot('orange',{silent:true,nodeBudget:30000}).findBestMove(s)!;
 assert.equal(executeMove(s,m.row,m.col,m.pieceType,'orange').newState.winner,'orange');
});
test('progress candidate deterministic, immutable, and within fixed work after reuse',()=>{
 for(const {state} of corpus().slice(0,10)){
  const c=state.pendingGraduationPlayer??state.currentTurn,bot=createBot(c,{silent:true,nodeBudget:1000}),before=JSON.stringify(state);
  const decide=()=>state.phase==='playing'?bot.findBestMove(state):bot.findBestGraduation(state);
  const action=decide(),{elapsedMs:_,...stats}=bot.getStats();
  assert.deepEqual(decide(),action);const {elapsedMs:__,...again}=bot.getStats();assert.deepEqual(again,stats);assert.ok(stats.nodes<=1000);assert.equal(JSON.stringify(state),before);
 }
});

test('history candidate replays the same explicit decision sequence and reset clears context',async()=>{
 const {createBot:historyBot}=await import('../src/bot/experimental/HistoryProgressBot');
 const state=createInitialGameState(),before=JSON.stringify(state);
 const a=historyBot('orange',{silent:true,nodeBudget:1000}),b=historyBot('orange',{silent:true,nodeBudget:1000});
 const first=a.findBestMove(state);assert.deepEqual(b.findBestMove(state),first);
 for(let i=0;i<5;i++)assert.deepEqual(a.findBestMove(state),b.findBestMove(state));
 a.clearCache();assert.deepEqual(a.findBestMove(state),first);assert.equal(JSON.stringify(state),before);
});
