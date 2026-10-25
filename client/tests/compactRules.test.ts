import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, executeMove, resolveGraduationChoice, getAllValidMoves, findGraduationOptions } from '../src/bot/LocalGame';
import { encode, snapshot, place, select, legalMoves, graduationOptions, colorName } from '../src/bot/compact/CompactGame';
import { pairValue as canonicalPairs } from '../src/bot/evaluation';
import { pairValue as compactPairs } from '../src/bot/compact/evaluation';
import { DEFAULT_BOT_CONFIG } from '../src/bot/types';
import { corpus } from '../tools/botRepro';

let seed=0x854623;
const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
function compare(state:ReturnType<typeof createInitialGameState>) {
  const compact=encode(state),before=structuredClone(snapshot(compact)),original=JSON.stringify(state);
  assert.deepEqual(legalMoves(compact),getAllValidMoves(state,state.currentTurn));
  for(let c=0;c<2;c++) {
    assert.deepEqual(graduationOptions(compact,c).filter(o=>o.length===3),findGraduationOptions(state.board,colorName(c)).map(o=>o.map(p=>p.row*6+p.col)));
    assert.deepEqual(compactPairs(compact,c,DEFAULT_BOT_CONFIG),canonicalPairs(state,colorName(c),DEFAULT_BOT_CONFIG));
  }
  let attempts=0;
  if(state.phase==='selecting_graduation') {
    for(let i=-1;i<=compact.options.length;i++) {
      const a=select(compact,i),b=resolveGraduationChoice(state,i);assert.equal(!!a,b.valid);
      if(a)assert.deepEqual(snapshot(a),snapshot(encode(b.newState)));attempts++;
    }
  } else if(state.phase==='playing') {
    for(const m of getAllValidMoves(state,state.currentTurn)) {
      const a=place(compact,m.row,m.col,m.pieceType==='cat'),b=executeMove(state,m.row,m.col,m.pieceType,state.currentTurn);
      assert.equal(!!a,b.valid);if(a)assert.deepEqual(snapshot(a),snapshot(encode(b.newState)));attempts++;
    }
  }
  assert.deepEqual(snapshot(compact),before);assert.equal(JSON.stringify(state),original);
  return attempts;
}
test('compact rules/evaluation match every child of seeded reachable states',()=>{
  let attempts=0,states=0,choices=0,terminals=0;
  for(let game=0;game<120;game++) {
    let s=createInitialGameState();
    for(let ply=0;ply<100&&s.phase!=='finished';ply++) {
      attempts+=compare(s);states++;
      if(s.phase==='selecting_graduation'){choices++;s=resolveGraduationChoice(s,random(s.pendingGraduationOptions!.length)).newState;}
      else {const moves=getAllValidMoves(s,s.currentTurn);if(!moves.length)break;const m=moves[random(moves.length)];s=executeMove(s,m.row,m.col,m.pieceType,s.currentTurn).newState;}
    }
    if(s.phase==='finished'){terminals++;compare(s);}
  }
  assert.ok(attempts>100000);assert.ok(choices>100);assert.ok(terminals>0);
  console.log(JSON.stringify({states,attempts,choices,terminals}));
});
test('synthetic dense boards preserve overlapping graduation order and all children',()=>{
  let attempts=0;
  for(let j=0;j<700;j++) {
    const s=createInitialGameState();
    for(let i=0;i<36;i++) {const p=random(5);s.board[Math.floor(i/6)][i%6]=p?{color:p<3?'orange':'gray',type:p%2?'kitten':'cat'}:null;}
    for(const c of ['orange','gray'] as const){s.players[c]!.kittensInPool=random(5);s.players[c]!.catsInPool=random(5);s.players[c]!.kittensRetired=random(8);}
    s.currentTurn=random(2)?'orange':'gray';attempts+=compare(s);
  }
  console.log(JSON.stringify({syntheticAttempts:attempts}));
});
test('invalid inputs and compact sibling isolation',()=>{
  const s=encode(createInitialGameState());
  for(const [r,c] of [[-1,0],[6,0],[.5,0],[0,NaN]])assert.equal(place(s,r,c,false),null);
  assert.equal(place(s,0,0,true),null);assert.equal(select(s,0),null);
  const a=place(s,0,0,false)!,b=place(s,0,1,false)!;a.board[1]=4;a.stock[0]=0;
  assert.equal(b.board[1],1);assert.equal(s.board[0],0);assert.equal(s.stock[0],8);
  for(const {state} of corpus())compare(state);
});

test('exhaustive local boop geometry, piece strengths, colors and blockers',()=>{
  let attempts=0;
  for(let row=0;row<6;row++)for(let col=0;col<6;col++)
    for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const ar=row+dr,ac=col+dc,tr=row+2*dr,tc=col+2*dc;
      if(ar<0||ar>=6||ac<0||ac>=6)continue;
      for(let adjacent=1;adjacent<=4;adjacent++)for(let blocker=0;blocker<=4;blocker++)for(const cat of [false,true]) {
        const s=createInitialGameState();
        s.players.orange!.catsInPool=4;s.players.gray!.catsInPool=4;
        const piece=(p:number)=>({color:p<=2?'orange' as const:'gray' as const,type:p%2?'kitten' as const:'cat' as const});
        s.board[ar][ac]=piece(adjacent);
        if(blocker&&tr>=0&&tr<6&&tc>=0&&tc<6)s.board[tr][tc]=piece(blocker);
        const compact=place(encode(s),row,col,cat)!;
        const canonical=executeMove(s,row,col,cat?'cat':'kitten','orange');
        assert.equal(canonical.valid,true);assert.deepEqual(snapshot(compact),snapshot(encode(canonical.newState)));attempts++;
      }
    }
  console.log(JSON.stringify({boopGeometryAttempts:attempts}));
});

test('sequential choices for both owners keep option order and mover turn',()=>{
  const s=createInitialGameState();s.phase='selecting_graduation';s.pendingGraduationPlayer='orange';
  for(const row of [0,5])for(let col=0;col<5;col++)s.board[row][col]={color:row===0?'orange':'gray',type:col%2?'cat':'kitten'};
  s.pendingGraduationOptions=findGraduationOptions(s.board,'orange');
  assert.ok(s.pendingGraduationOptions.length>1);
  compare(s);
  for(let i=0;i<s.pendingGraduationOptions.length;i++) {
    const t=resolveGraduationChoice(s,i).newState;
    assert.equal(t.pendingGraduationPlayer,'gray');assert.equal(t.currentTurn,'orange');compare(t);
    for(let j=0;j<t.pendingGraduationOptions!.length;j++) {
      const u=resolveGraduationChoice(t,j).newState;
      assert.equal(u.phase,'playing');assert.equal(u.currentTurn,'gray');compare(u);
    }
  }
});
