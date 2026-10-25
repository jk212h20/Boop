// Independent canonical-rules minimax oracle: no TT, history, compact transitions,
// iterative ordering or work cutoff. Full-window root values are exact at depth.
import { gunzipSync,gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { createBot as compactBot } from '../src/bot/compact/CompactBot';
import { createBot as canonicalBot } from '../src/bot/BotAI';
import type { GameState } from '../src/types';
import {breakdown,evaluate,children,minimax,resetVisits,getVisits} from './loopSearchOracle';
const output=process.env.BOOP_ORACLE_OUTPUT??'../docs/bot-experiments/loop-search-diagnosis.json.gz';
const maxDepth=Number(process.env.BOOP_ORACLE_DEPTH??5);
const results:any[]=[];
// The earliest loop has no adults: isolates development from eight-cat valuation.
const data=JSON.parse(gunzipSync(readFileSync('../docs/bot-experiments/capped-audit/1408-gray.json.gz')).toString());
for(const index of [4,5]){
 const s:GameState=data.events[index].state,c=s.currentTurn;
 const row:any={decision:index,actor:c,state:s,breakdown:{orange:breakdown(s,'orange'),gray:breakdown(s,'gray')},depths:[]};
 for(let depth=1;depth<=maxDepth;depth++){
  resetVisits();const start=performance.now();
  const ranked=children(s).map(child=>({action:child.action,staticValue:evaluate(child.state,c),value:minimax(child.state,depth-1,c),breakdown:{orange:breakdown(child.state,'orange'),gray:breakdown(child.state,'gray')}})).sort((a,b)=>b.value-a.value);
  const probes=[];
  for(const [name,factory] of [['compact',compactBot],['canonical',canonicalBot]] as const){
   const bot=factory(c,{silent:true,searchDepth:depth,nodeBudget:2000000}),action=bot.findBestMove(s),stats=bot.getStats();
   const chosen=ranked.find(r=>JSON.stringify(r.action)===JSON.stringify(action))!;
   probes.push({name,action,stats,oracleValue:chosen.value,optimal:chosen.value===ranked[0].value});
   if(stats.completedDepth===depth&&chosen.value!==ranked[0].value)throw new Error(`Search disagrees with oracle at ${index}/${depth}/${name}`);
  }
  const pv=[];let cursor=s,remaining=depth;
  while(cursor.phase!=='finished'&&(remaining>0||cursor.phase==='selecting_graduation')){
   const maximize=(cursor.pendingGraduationPlayer??cursor.currentTurn)===c;
   const options=children(cursor).map(child=>({...child,value:minimax(child.state,remaining-(cursor.phase==='playing'?1:0),c)}));
   options.sort((a,b)=>(maximize?-1:1)*(a.value-b.value));const chosen=options[0];if(!chosen)break;
   pv.push({actor:cursor.pendingGraduationPlayer??cursor.currentTurn,action:chosen.action,value:chosen.value,breakdown:{orange:breakdown(chosen.state,'orange'),gray:breakdown(chosen.state,'gray')}});
   if(cursor.phase==='playing')remaining--;cursor=chosen.state;
  }
  const r={depth,visits:getVisits(),elapsedMs:performance.now()-start,best:ranked[0].value,ranked,probes,pv};row.depths.push(r);
  console.log(JSON.stringify({decision:index,depth,visits:getVisits(),best:r.best,probes}));
  writeFileSync(output,gzipSync(JSON.stringify([...results,row])+'\n'));
 }
 results.push(row);
}
