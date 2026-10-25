import { gunzipSync } from 'node:zlib';
import { readFileSync,writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createBot as original } from '../src/bot/compact/CompactBot';
import { createBot as adultCandidate } from '../src/bot/experimental/EightCatBot';
const candidate = process.env.BOOP_ESCAPE_MODULE ? (await import(pathToFileURL(process.env.BOOP_ESCAPE_MODULE).href)).createBot : adultCandidate;
const output = process.env.BOOP_ESCAPE_OUTPUT ?? '../docs/bot-experiments/eightcat-cycle-escapes.json';
import { encode,snapshot } from '../src/bot/compact/CompactGame';
import { executeMove,resolveGraduationChoice } from '../src/bot/LocalGame';
import type { GameState } from '../src/types';
const results=[];
for(const name of ['1402-orange','1405-orange','1406-gray','1408-gray']) {
 const data=JSON.parse(gunzipSync(readFileSync(`../docs/bot-experiments/capped-audit/${name}.json.gz`)).toString());
 const start=data.events[data.summary.firstRepeat.previous[0]].state;
 for(const side of ['orange','gray','both'] as const){
  let state:GameState=start;const seen=new Map<string,number>(),trace=[];
  const bots=Object.fromEntries((['orange','gray'] as const).map(c=>[c,(side==='both'||side===c?candidate:original)(c,{silent:true,nodeBudget:c===data.summary.newColor?60000:30000})]));
  let placements=0,firstRepeat:null|number=null;
  while(state.phase!=='finished'&&placements<80){
   const key=JSON.stringify(snapshot(encode(state)));if(seen.has(key)&&firstRepeat===null)firstRepeat=placements;seen.set(key,placements);
   const c=state.pendingGraduationPlayer??state.currentTurn;
   const action=state.phase==='playing'?bots[c].findBestMove(state):bots[c].findBestGraduation(state);
   trace.push({placements,actor:c,action});
   if(typeof action==='number')state=resolveGraduationChoice(state,action).newState;
   else {state=executeMove(state,action!.row,action!.col,action!.pieceType,c).newState;placements++;}
  }
  const r={name,side,placements,winner:state.winner,firstRepeat,unique:seen.size,trace,finalState:state};results.push(r);
  writeFileSync(output,JSON.stringify(results)+'\n');
  console.log(JSON.stringify({name,side,placements,winner:state.winner,firstRepeat,unique:seen.size}));
 }
}
