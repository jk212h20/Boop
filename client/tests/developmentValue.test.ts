import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createInitialGameState,executeMove } from '../src/bot/LocalGame';
import { encode,copy,legalMoves,place } from '../src/bot/compact/CompactGame';
import { developmentFeatures as features,developmentValue,retentionValue } from '../src/bot/compact/developmentValue';
import { createBot as development } from '../src/bot/experimental/DevelopmentBot';
import { createBot as retention } from '../src/bot/experimental/RetentionBot';
import { corpus } from '../tools/botRepro';

test('confirmation candidate matches the pre-confirmation source manifest',()=>{
 const root=new URL('../../',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('docs/bot-experiments/durable-manifest.json',root),'utf8'));
 for(const [path,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex'),hash);
});

test('kitten deployment and open runway have explicit value, tapered by owned adults',()=>{
 const s=encode(createInitialGameState());s.board[14]=1;s.stock[0]--;
 const f=features(s,0);assert.equal(f.deployedKittens,1);assert.ok(f.openKittenWindows>0);assert.ok(f.development>10);
 const crowded=copy(s);crowded.stock[1]=7;assert.equal(features(crowded,0).development,f.development/8);
 const blocked=copy(s);blocked.board[15]=3;assert.ok(features(blocked,0).openKittenWindows<f.openKittenWindows);
});
test('exposure requires an available attacker, counts targets once and respects cat strength',()=>{
 const s=encode(createInitialGameState());s.board[0]=2;s.stock[1]=1;
 assert.equal(features(s,0).exposedCats,0);s.stock[4]=1;
 assert.equal(features(s,0).exposedCats,1);assert.equal(features(s,0).exposure,24);
 s.board[7]=3;s.board[1]=3;s.board[6]=3;assert.equal(features(s,0).exposedCats,0);
 s.board[0]=1;s.stock[4]=0;s.board[7]=0;assert.equal(features(s,0).exposedKittens,1);
 assert.equal(developmentValue(s,0)-retentionValue(s,0),8);
});
test('single-target exposure matches real placement transitions for every square, strength and color',()=>{
 for(let color=0;color<2;color++)for(const kitten of [false,true])for(const attackerCat of [false,true])for(let i=0;i<36;i++){
  const s=encode(createInitialGameState());s.board[i]=1+2*color+Number(!kitten);
  s.stock.fill(0);s.turn=1-color;s.stock[s.turn*3+Number(attackerCat)]=1;
  const target=s.board[i];
  const ejectable=legalMoves(s).some(m=>{const t=place(s,m.row,m.col,m.pieceType==='cat')!;return !t.board.includes(target);});
  const f=features(s,color);assert.equal(kitten?f.exposedKittens:f.exposedCats,Number(ejectable));
 }
});

test('feature values are color and D4 symmetric and never mutate input',()=>{
 for(const {state} of corpus()){
  const s=encode(state),before=JSON.stringify(s);
  for(let color=0;color<2;color++){
   const f=features(s,color);
   for(let transform=0;transform<8;transform++){
    const t=copy(s);t.board.fill(0);
    for(let i=0;i<36;i++){
     let r=Math.floor(i/6),c=i%6;if(transform>=4)c=5-c;
     for(let k=0;k<transform%4;k++)[r,c]=[c,5-r];t.board[r*6+c]=s.board[i];
    }
    assert.deepEqual(features(t,color),f);
   }
   const swapped=copy(s);swapped.board=Uint8Array.from(s.board,p=>p?(p<=2?p+2:p-2):0);
   swapped.stock.set(s.stock.slice(3),0);swapped.stock.set(s.stock.slice(0,3),3);
   assert.deepEqual(features(swapped,1-color),f);
  }
  assert.equal(JSON.stringify(s),before);
 }
});
test('development candidate leaves the original early loop from either color without history',()=>{
 const data=JSON.parse(gunzipSync(readFileSync(new URL('../../docs/bot-experiments/capped-audit/1408-gray.json.gz',import.meta.url))).toString());
 for(const i of [4,5]){
  const {state,action}=data.events[i],color=state.currentTurn;
  const m=development(color,{silent:true,nodeBudget:color==='gray'?60000:30000}).findBestMove(state);
  assert.notDeepEqual(m,action);
 }
});

test('both candidates retain fixed-work replay, nonmutation and terminal priority',()=>{
 for(const factory of [development,retention]){
  for(const {state} of corpus().slice(0,8)){
   const c=state.pendingGraduationPlayer??state.currentTurn,b=factory(c,{silent:true,nodeBudget:1000}),before=JSON.stringify(state);
   const decide=()=>state.phase==='playing'?b.findBestMove(state):b.findBestGraduation(state);
   const action=decide();assert.deepEqual(decide(),action);assert.ok(b.getStats().nodes<=1000);assert.equal(JSON.stringify(state),before);
  }
  const s=createInitialGameState();s.players.orange!.kittensInPool=0;s.players.orange!.catsInPool=1;
  for(const [r,c] of [[0,0],[0,2],[0,4],[2,0],[2,4],[4,0],[4,2]])s.board[r][c]={color:'orange',type:'cat'};
  const m=factory('orange',{silent:true,nodeBudget:30000}).findBestMove(s)!;
  assert.equal(executeMove(s,m.row,m.col,m.pieceType,'orange').newState.winner,'orange');
 }
});
