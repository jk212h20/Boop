import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBot as canonicalBot } from '../src/bot/BotAI';
import { createBot } from '../src/bot/compact/CompactBot';
import { createInitialGameState } from '../src/bot/LocalGame';
import { corpus, advance } from '../tools/botRepro';

test('numeric search reproduces exact v4 actions, work, depths and TT stats',()=>{
  for(const {name,state} of corpus())for(const nodeBudget of [1,40,1000,30000,60000]) {
    const color=state.pendingGraduationPlayer??state.currentTurn;
    const a=canonicalBot(color,{silent:true,nodeBudget}),b=createBot(color,{silent:true,nodeBudget});
    const before=JSON.stringify(state);
    const action=state.phase==='playing'?a.findBestMove(state):a.findBestGraduation(state);
    for(let repeat=0;repeat<2;repeat++) {
      const actual=state.phase==='playing'?b.findBestMove(state):b.findBestGraduation(state);
      assert.deepEqual(actual,action,`${name} budget ${nodeBudget}`);
      const {elapsedMs:_,...stats}=a.getStats(),{elapsedMs:__,...compact}=b.getStats();
      assert.deepEqual(compact,stats,`${name} search stats`);
    }
    assert.equal(JSON.stringify(state),before);
  }
});
test('numeric search independently reproduces frozen complete v4 replay',()=>{
  const golden=JSON.parse(readFileSync(new URL('./baselines/v4-golden.json',import.meta.url),'utf8'));
  let state=createInitialGameState();
  for(const expected of golden.replay.actions) {
    const bot=createBot(state.pendingGraduationPlayer??state.currentTurn,{silent:true});
    const action=state.phase==='playing'?bot.findBestMove(state):bot.findBestGraduation(state);
    const {nodes,completedDepth}=bot.getStats();assert.deepEqual({action,nodes,depth:completedDepth},expected);
    state=advance(state,action);
  }
  assert.deepEqual(state,golden.replay.finalState);
});
