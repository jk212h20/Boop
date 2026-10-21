import test from 'node:test';
import assert from 'node:assert/strict';
import { filmActors, filmPoolCount } from '../src/components/RulesFilmStage';
test('film boops eight neighbors exactly one square away',()=>{
 const before=filmActors('boop',.2),after=filmActors('boop',.6);
 assert.equal(before.length,8);assert.equal(after.length,9);
 before.forEach((p,i)=>{assert.equal(after[i].r,p.r+(p.r-2));assert.equal(after[i].c,p.c+(p.c-2));});
});
test('blocked pieces stay, booped pieces do not create chain pushes',()=>{
 const a=filmActors('limits',.4);assert.deepEqual(a.map(p=>[p.r,p.c]),[[2,2],[2,3],[2,1]]);
 const b=filmActors('limits',.9);assert.deepEqual(b.map(p=>[p.r,p.c]),[[2,3],[2,4],[2,1]]);
});
test('graduation clears the bed rather than replacing kittens in place',()=>{
 assert.equal(filmActors('graduate',.5).length,3);assert.equal(filmActors('graduate',.9).length,0);
});
test('kitten cannot move adult; adult can move adult',()=>{
 assert.equal(filmActors('strength',.4)[0].c,2);assert.equal(filmActors('strength',.9)[0].c,3);
});
test('eight-piece option removes one; victory fixtures are all adult',()=>{
 assert.equal(filmActors('eight',.4).length,8);assert.equal(filmActors('eight',.9).length,7);
 for(const t of [.4,.9])assert.ok(filmActors('win',t).every(p=>p.type==='cat'&&p.color==='orange'));
});

test('setup and eight-piece option conserve active pieces across bed and pool',()=>{
 for(const t of [.4,.9])assert.equal(filmActors('setup',t).length+filmPoolCount('setup',t,'orange'),8);
 for(const t of [.4,.9])assert.equal(filmActors('eight',t).length+filmPoolCount('eight',t,'orange'),8);
 assert.equal(filmPoolCount('graduate',.9,'orange'),3);
});
