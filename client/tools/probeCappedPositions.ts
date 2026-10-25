import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createBot as original } from '../src/bot/compact/CompactBot';
import { createBot as candidate } from '../src/bot/experimental/EightCatBot';
import { executeMove, getAllValidMoves } from '../src/bot/LocalGame';
import { encode, snapshot } from '../src/bot/compact/CompactGame';
for(const name of ['1402-orange','1405-orange','1406-gray','1408-gray']) {
 let data;try{data=JSON.parse(gunzipSync(readFileSync(`../docs/bot-experiments/capped-audit/${name}.json.gz`)).toString());}catch{continue;}
 const first=data.summary.firstRepeat;if(!first)continue;
 for(let index=first.previous[0];index<first.decision;index++) {
  const e=data.events[index],s=e.state,c=s.currentTurn;
  if(s.phase!=='playing')continue;
  const immediateWins=getAllValidMoves(s,c).filter(m=>executeMove(s,m.row,m.col,m.pieceType,c).newState.winner===c);
  const probes=[];
  for(const [label,factory,budget] of [['old30',original,30000],['old60',original,60000],['old240',original,240000],['eight60',candidate,60000]] as const){
   const bot=factory(c,{silent:true,nodeBudget:budget}),action=bot.findBestMove(s)!;
   const next=executeMove(s,action.row,action.col,action.pieceType,c).newState;
   const replies=getAllValidMoves(next,next.currentTurn);
   const repeats=replies.filter(m=>JSON.stringify(snapshot(encode(executeMove(next,m.row,m.col,m.pieceType,next.currentTurn).newState)))===JSON.stringify(snapshot(encode(s))));
   probes.push({label,action,stats:bot.getStats(),returnsToSameState:repeats});
  }
  console.log(JSON.stringify({name,decision:index,ply:e.ply,actor:c,immediateWins,probes}));
 }
}
