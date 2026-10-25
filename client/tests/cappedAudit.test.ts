import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {executeMove,resolveGraduationChoice,createInitialGameState} from '../src/bot/LocalGame';
import {encode,snapshot} from '../src/bot/compact/CompactGame';
import {createBot} from '../src/bot/experimental/EightCatBot';
const load=(name:string)=>JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/bot-experiments/capped-audit/${name}.json.gz`,import.meta.url))).toString());
test('all retained capped-game traces reproduce exact canonical states through 240 placements',()=>{
 for(const name of ['1402-orange','1405-orange','1406-gray','1408-gray']){
  const d=load(name);let state=createInitialGameState();
  for(const e of d.events){
   assert.deepEqual(JSON.parse(JSON.stringify(state)),e.state);
   const r=typeof e.action==='number'?resolveGraduationChoice(state,e.action):executeMove(state,e.action.row,e.action.col,e.action.pieceType,state.currentTurn);
   assert.equal(r.valid,true);state=r.newState;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(state)),d.finalState);assert.equal(state.winner,null);assert.equal(d.summary.placements,240);
  const {decision,previous}=d.summary.firstRepeat;
  assert.deepEqual(snapshot(encode(d.events[decision].state)),snapshot(encode(d.events[previous[0]].state)));
  assert.equal(d.events[decision].ply-d.events[previous[0]].ply,2);
 }
});
test('adult deployment term leaves two diagnosed cycles without claiming forced wins',()=>{
 for(const [name,index] of [['1402-orange',37],['1406-gray',37]] as const){
  const d=load(name),e=d.events[index],s=e.state;
  const bot=createBot(s.currentTurn,{silent:true,nodeBudget:60000});
  const action=bot.findBestMove(s);assert.notDeepEqual(action,e.action);
  assert.equal(bot.getStats().nodes,60000);
 }
});
