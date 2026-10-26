import test from 'node:test';
import assert from 'node:assert/strict';
import { ResolutionBudget } from '../src/rendering/performance';

function run(budget: ResolutionBudget, fps: number, seconds: number) {
  for (let i = 0; i < fps * seconds; i++) budget.sample(1 / fps);
}
test('resolution starts conservatively and improves only after sustained headroom', () => {
  const budget = new ResolutionBudget(2);
  assert.equal(budget.ratio, 1.25);
  run(budget, 60, 8);
  assert.equal(budget.ratio, 1.25);
  run(budget, 60, 8);
  assert.equal(budget.ratio, 1.5);
  run(budget, 120, 20);
  assert.equal(budget.ratio, 1.5);
});
test('sustained slow frames lower resolution to a bounded floor', () => {
  const budget = new ResolutionBudget(2);
  run(budget, 40, 5);
  assert.equal(budget.ratio, 1);
  run(budget, 30, 20);
  assert.equal(budget.ratio, .75);
});
test('a stall or hidden-tab resume resets evidence, not quality', () => {
  const budget = new ResolutionBudget(1);
  run(budget, 60, 5);
  budget.sample(8);
  assert.equal(budget.ratio, 1);
  run(budget, 40, 2);
  assert.equal(budget.ratio, 1);
  run(budget, 60, 20);
  assert.equal(budget.ratio, 1);
});
test('near-target frame rates do not oscillate quality', () => {
  const budget = new ResolutionBudget(2);
  run(budget, 55, 30);
  assert.equal(budget.ratio, 1.25);
  budget.reset();
  assert.equal(budget.ratio, 1.25);
});
