// Paired warmed measurements; correctness asserted, timing never affects decisions.
import assert from 'node:assert/strict';
import { corpus } from './botRepro';
import { createBot as canonicalBot } from '../src/bot/BotAI';
import { createBot } from '../src/bot/compact/CompactBot';
import { executeMove, getAllValidMoves, resolveGraduationChoice } from '../src/bot/LocalGame';
import { encode, place, select } from '../src/bot/compact/CompactGame';
const positions=corpus(), rounds=Number(process.env.BOOP_ROUNDS??3);
let checksum=0;
const tasks=positions.map(({state})=>({state,compact:encode(state),moves:getAllValidMoves(state,state.currentTurn)}));
function transitions(compact:boolean,repeats:number) {
  const start=performance.now();let count=0;
  for(let n=0;n<repeats;n++)for(const t of tasks) {
    if(t.state.phase==='selecting_graduation')for(let i=0;i<t.compact.options.length;i++) {
      if(compact){const s=select(t.compact,i)!;checksum+=s.turn;}else{const s=resolveGraduationChoice(t.state,i);checksum+=Number(s.newState.currentTurn==='gray');} count++;
    }else for(const m of t.moves) {
      if(compact){const s=place(t.compact,m.row,m.col,m.pieceType==='cat')!;checksum+=s.turn;}
      else {const s=executeMove(t.state,m.row,m.col,m.pieceType,t.state.currentTurn);checksum+=Number(s.newState.currentTurn==='gray');}count++;
    }
  }
  return {ms:performance.now()-start,count};
}
transitions(false,20);transitions(true,20);
const transitionResults=[];
for(let i=0;i<6;i++) {
  let canonical,compact;
  if(i%2){compact=transitions(true,150);canonical=transitions(false,150);}else{canonical=transitions(false,150);compact=transitions(true,150);}
  transitionResults.push({canonical,compact,speedup:canonical.ms/compact.ms});
}
console.log(JSON.stringify({kind:'transitions',transitionResults,checksum}));
// Warm both implementations, then alternate order within each paired position.
for(const factory of [canonicalBot,createBot]){const b=factory('orange',{silent:true});b.findBestMove(positions[0].state);}
const measurements=[];
for(let round=0;round<rounds;round++)for(const {name,state} of positions) {
  const color=state.pendingGraduationPlayer??state.currentTurn;
  function run(factory:typeof createBot,nodeBudget=30000) {
    const bot=factory(color,{silent:true,nodeBudget});const start=performance.now();
    const action=state.phase==='playing'?bot.findBestMove(state):bot.findBestGraduation(state);
    const ms=performance.now()-start;const {elapsedMs:_,...stats}=bot.getStats();return {action,ms,stats};
  }
  let canonical,compact;
  if(round%2){compact=run(createBot);canonical=run(canonicalBot);}else{canonical=run(canonicalBot);compact=run(createBot);}
  assert.deepEqual(compact.action,canonical.action);assert.deepEqual(compact.stats,canonical.stats);
  const larger=run(createBot,60000);
  measurements.push({round,name,canonicalMs:canonical.ms,compactMs:compact.ms,largerMs:larger.ms,depth:compact.stats.completedDepth,largerDepth:larger.stats.completedDepth,speedup:canonical.ms/compact.ms});
}
const percentile=(a:number[],p:number)=>a.sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
console.log(JSON.stringify({kind:'search',rounds,positions:positions.length,measurements,summary:{
 canonicalP50:percentile(measurements.map(m=>m.canonicalMs),.5),canonicalP95:percentile(measurements.map(m=>m.canonicalMs),.95),
 compactP50:percentile(measurements.map(m=>m.compactMs),.5),compactP95:percentile(measurements.map(m=>m.compactMs),.95),
 largerP50:percentile(measurements.map(m=>m.largerMs),.5),largerP95:percentile(measurements.map(m=>m.largerMs),.95),
 medianPairedSpeedup:percentile(measurements.map(m=>m.speedup),.5)}}));
