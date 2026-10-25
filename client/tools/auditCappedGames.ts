// Reconstruct capped matches using the proven equivalent numeric backend for both sides.
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createBot } from '../src/bot/compact/CompactBot';
import { encode, snapshot } from '../src/bot/compact/CompactGame';
import { createInitialGameState, executeMove, getAllValidMoves, resolveGraduationChoice } from '../src/bot/LocalGame';
import type { GameState } from '../src/types';
const cases=[{seed:1402,newColor:'orange'},{seed:1405,newColor:'orange'},{seed:1406,newColor:'gray'},{seed:1408,newColor:'gray'}] as const;
const dir=process.env.BOOP_AUDIT_DIR??'../docs/bot-experiments/capped-audit';mkdirSync(dir,{recursive:true});
const maxPly=Number(process.env.BOOP_AUDIT_CAP??240);
function inventory(s:GameState){return (['orange','gray'] as const).map(c=>{
 const p=s.players[c]!;let cats=0,kittens=0;for(const row of s.board)for(const piece of row)if(piece?.color===c){if(piece.type==='cat')cats++;else kittens++;}
 return {color:c,cats,kittens,catPool:p.catsInPool,kittenPool:p.kittensInPool,retired:p.kittensRetired};
});}
for(const setup of cases){
 let state=createInitialGameState(),rng=setup.seed+123,ply=0;const events:any[]=[],seen=new Map<string,number[]>();
 const bots=Object.fromEntries((['orange','gray'] as const).map(c=>[c,createBot(c,{silent:true,searchDepth:12,nodeBudget:c===setup.newColor?60000:30000})]));
 while(state.phase!=='finished'&&ply<maxPly){
  const actor=state.pendingGraduationPlayer??state.currentTurn;
  const key=JSON.stringify(snapshot(encode(state))),visits=seen.get(key)??[];
  const event:any={decision:events.length,ply,actor,state,inventory:inventory(state),previousVisits:[...visits]};
  visits.push(events.length);seen.set(key,visits);
  if(state.phase==='selecting_graduation'){
   event.action=bots[actor].findBestGraduation(state);const r=resolveGraduationChoice(state,event.action);if(!r.valid)throw Error(r.error);state=r.newState;
  }else{
   const moves=getAllValidMoves(state,actor);rng=ply<4?(Math.imul(rng,1664525)+1013904223)>>>0:rng;
   event.action=ply<4?moves[Math.floor(rng/4294967296*moves.length)]:bots[actor].findBestMove(state);
   if(!event.action)throw Error('No move');const m=event.action,r=executeMove(state,m.row,m.col,m.pieceType,actor);if(!r.valid)throw Error(r.error);state=r.newState;ply++;
  }
  event.stats=bots[actor].getStats();events.push(event);
  if(ply%30===0&&state.phase==='playing')console.log(JSON.stringify({progress:setup,ply,bytes:JSON.stringify(events).length}));
 }
 const atCap=events.find(e=>e.ply===180)?.state??state;
 const repeated=events.filter(e=>e.previousVisits.length).map(e=>({decision:e.decision,ply:e.ply,previous:e.previousVisits}));
 const summary={...setup,placements:ply,winner:state.winner,inventoryAt180:inventory(atCap),finalInventory:inventory(state),firstRepeat:repeated[0]??null,repeatedDecisions:repeated.length,uniqueStates:seen.size,
  lateSamples:events.filter(e=>e.ply>=120&&e.ply%10===0&&e.state.phase==='playing').map(e=>({ply:e.ply,inventory:e.inventory,action:e.action})),repeated};
 writeFileSync(`${dir}/${setup.seed}-${setup.newColor}.json.gz`,gzipSync(JSON.stringify({summary,events,finalState:state})+'\n'));
 const {repeated:allRepeats,...boundedSummary}=summary;
 writeFileSync(`${dir}/${setup.seed}-${setup.newColor}-summary.json`,JSON.stringify({...boundedSummary,repeatedSample:allRepeats.slice(0,6)},null,2)+'\n');
 console.log(JSON.stringify({completed:summary}));
}
