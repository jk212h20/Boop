import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createBot as compact } from '../src/bot/compact/CompactBot';
import { createBot as canonical } from '../src/bot/BotAI';
import { children,evaluate,minimax } from '../tools/loopSearchOracle';
import { corpus } from '../tools/botRepro';
import type { GameState } from '../src/types';
const trace=JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL('../../docs/bot-experiments/capped-audit/1408-gray.json.gz',import.meta.url)))).toString());
test('both engines choose exact oracle-optimal early-loop actions at depths one through four',()=>{
 for(const i of [4,5]){
  const s:GameState=trace.events[i].state,c=s.currentTurn;
  assert.equal(evaluate(s,'orange'),-evaluate(s,'gray'));
  for(let depth=1;depth<=4;depth++){
   const ranked=children(s).map(child=>({action:child.action,value:minimax(child.state,depth-1,c)}));
   const best=Math.max(...ranked.map(r=>r.value));
   for(const factory of [compact,canonical]){
    const b=factory(c,{silent:true,searchDepth:depth,nodeBudget:2000000}),m=b.findBestMove(s);
    assert.equal(b.getStats().completedDepth,depth);
    assert.equal(ranked.find(r=>JSON.stringify(r.action)===JSON.stringify(m))!.value,best);
    if(depth===4)assert.deepEqual(m,trace.events[i].action);
   }
  }
 }
});
test('pruned oracle matches exhaustive no-pruning minimax on both early-loop states',()=>{
 function exhaustive(s:GameState,depth:number,c:GameState['currentTurn']):number {
  if(s.phase==='finished'||(depth<=0&&s.phase!=='selecting_graduation'))return evaluate(s,c);
  const values=children(s).map(child=>exhaustive(child.state,depth-(s.phase==='playing'?1:0),c));
  if(!values.length)return evaluate(s,c);
  return (s.pendingGraduationPlayer??s.currentTurn)===c?Math.max(...values):Math.min(...values);
 }
 for(const i of [4,5]){
  const s:GameState=trace.events[i].state;
  for(const c of ['orange','gray'] as const)assert.equal(minimax(s,3,c),exhaustive(s,3,c));
 }
});

test('canonical oracle checks actor handling and forced graduation settlement at shallow horizon',()=>{
 const states=corpus().map(r=>r.state).filter(s=>s.phase==='selecting_graduation').slice(0,4);
 assert.ok(states.length>0);
 for(const s of states){
  const c=s.pendingGraduationPlayer!,ranked=children(s).map(child=>({action:child.action,value:minimax(child.state,1,c)}));
  const best=Math.max(...ranked.map(r=>r.value));
  for(const factory of [compact,canonical]){
   const b=factory(c,{silent:true,searchDepth:1,nodeBudget:2000000});
   const m=b.findBestGraduation(s);assert.equal(b.getStats().completedDepth,1);
   assert.equal(ranked.find(r=>r.action===m)!.value,best);
  }
 }
});
