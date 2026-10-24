import test from 'node:test';
import assert from 'node:assert/strict';
import { pairValue } from '../src/bot/evaluation';
import { createInitialGameState } from '../src/bot/LocalGame';
import { DEFAULT_BOT_CONFIG } from '../src/bot/types';
import { GameState, PieceType } from '../src/types';
function pair(cells: number[][], types: PieceType[] = ['cat','cat']): GameState {
  const s=createInitialGameState();
  cells.forEach(([r,c],i)=>{s.board[r][c]={color:'orange',type:types[i]};});
  s.players.orange!.catsInPool=6;
  return s;
}
const value=(s:GameState)=>pairValue(s,'orange',DEFAULT_BOT_CONFIG);
test('a two-cell diagonal cut off at both ends has no line value',()=>{
 const s=pair([[0,4],[1,5]]);
 assert.equal(value(s).score,0);
});
test('adjacent cats protected by their neighbour give two playable ends',()=>{
 const s=pair([[2,2],[2,3]]);
 assert.equal(value(s).winningSquares,2);
 assert.equal(value(s).adjacent,2);
});
test('board edge limits adjacent pairs to one completion, not two',()=>{
 assert.equal(value(pair([[0,0],[0,1]])).winningSquares,1);
});
test('an unsupported gapped pair is not an immediate threat',()=>{
 const s=pair([[2,1],[2,3]]);s.players.orange!.kittensInPool=0;
 assert.equal(value(s).winningSquares,0);
 assert.equal(value(s).gapped,1);
 assert.equal(value(s).unplayable,1);
});
test('gapped pair becomes playable when BOTH push destinations are occupied',()=>{
 const s=pair([[2,1],[2,3]]);
 s.board[2][0]={color:'gray',type:'kitten'};
 assert.equal(value(s).winningSquares,0);
 s.board[2][4]={color:'gray',type:'cat'};
 assert.equal(value(s).winningSquares,1);
});
test('off-board destinations do not protect a gapped edge cat',()=>{
 const s=pair([[2,0],[2,2]]);
 s.board[2][3]={color:'gray',type:'cat'};
 assert.equal(value(s).winningSquares,0);
});
test('no reserve cat means a two-cat pair cannot immediately win',()=>{
 const s=pair([[2,2],[2,3]]);s.players.orange!.catsInPool=0;
 assert.equal(value(s).winningSquares,0);
 assert.equal(value(s).promotionSquares,2);
});
test('kitten and mixed pairs are promotions, not cat wins',()=>{
 const kitten=value(pair([[2,2],[2,3]],['kitten','kitten']));
 const mixed=value(pair([[2,2],[2,3]],['kitten','cat']));
 assert.equal(kitten.winningSquares,0);assert.equal(mixed.winningSquares,0);
 assert.equal(kitten.promotionSquares,2);assert.equal(mixed.promotionSquares,2);
 assert.ok(kitten.score>mixed.score,'three new cats are worth more than recycling an adult');
});
test('a kitten cannot push cats but a cat placed in a gap can',()=>{
 const s=pair([[2,1],[2,3]]);
 assert.equal(value(s).winningSquares,0);
 assert.equal(value(s).promotionSquares,1,'kitten can safely complete the mixed line');
});
test('opponent occupying the missing square blocks completion',()=>{
 const s=pair([[0,0],[0,1]]);s.board[0][2]={color:'gray',type:'kitten'};
 assert.equal(value(s).score,0);
});
test('tempo matters without treating a pair as a terminal win',()=>{
 const s=pair([[2,2],[2,3]]);const ours=value(s).score;
 s.currentTurn='gray';assert.ok(value(s).score<ours);assert.ok(ours<100000);
});
