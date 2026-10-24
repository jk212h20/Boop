import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decision, advance } from '../tools/botRepro';
import { createBot } from '../src/bot/BotAI';
import { createInitialGameState } from '../src/bot/LocalGame';
import { versionConfig } from '../src/bot/version';
import { GameState } from '../src/types';
const golden=JSON.parse(readFileSync(new URL('./baselines/v4-golden.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('./baselines/v4-manifest.json',import.meta.url),'utf8'));
test('v4 source specification is frozen; decision changes require a new version',()=>{
 assert.deepEqual(versionConfig(),manifest.config);
 for(const [file,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hash,file);
});
test('saved decisions reproduce exact action, depth and work after cache reuse',()=>{
 const shared=createBot('orange',versionConfig());
 for(const fixture of golden.positions){
  const actual=decision(fixture.state);const {elapsedMs,...stable}=actual;
  assert.deepEqual(stable,fixture.expected,fixture.name);
  assert.ok(actual.nodes<=30000);
  if((fixture.state.pendingGraduationPlayer??fixture.state.currentTurn)==='orange'){
   const action=fixture.state.phase==='selecting_graduation'?shared.findBestGraduation(fixture.state):shared.findBestMove(fixture.state);
   assert.deepEqual(action,fixture.expected.action,'warm engine '+fixture.name);
  }
 }
});
test('complete v4 self-play replay reproduces all decisions and final state',()=>{
 let state:GameState=createInitialGameState();
 for(const [i,expected]of golden.replay.actions.entries()){
  const {elapsedMs,...stable}=decision(state);assert.deepEqual(stable,expected,`decision ${i}`);state=advance(state,stable.action);
 }
 assert.deepEqual(state,golden.replay.finalState);
});
test('changing wall-clock speed cannot change fixed-work decisions',()=>{
 const state=golden.positions[3].state;
 const slow=createBot(state.currentTurn,{...versionConfig(),timeBudgetMs:1});
 assert.deepEqual(slow.findBestMove(state),golden.positions[3].expected.action);
});
