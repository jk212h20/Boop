import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot as promotion } from '../src/bot/experimental/PromotionBot';
import { createBot as growth } from '../src/bot/experimental/GrowthBot';
import { corpus } from '../tools/botRepro';
import { createBot as threat } from '../src/bot/experimental/ThreatBot';
for(const [label,factory] of [['promotion',promotion],['growth',growth],['threat',threat]] as const){
 test(label+' deterministically repeats saved decisions within fixed work',()=>{
  for(const {name,state} of corpus()){
   const bot=factory(state.pendingGraduationPlayer??state.currentTurn,{silent:true});
   const before=JSON.stringify(state);
   const act=()=>state.phase==='selecting_graduation'?bot.findBestGraduation(state):bot.findBestMove(state);
   const first=act(),stats=bot.getStats();assert.deepEqual(act(),first,name);
   assert.equal(bot.getStats().nodes,stats.nodes,name);assert.ok(stats.nodes<=30000);
   assert.equal(JSON.stringify(state),before,name);
  }
 });
}
