import test from 'node:test';
import assert from 'node:assert/strict';
import { animationDurationMs, botReplyDelayMs, BOT_MIN_REPLY_MS, BOOP_LAND_MS, PLACEMENT_DROP_MS } from '../src/animationTiming';

test('placement unlock follows visible landing, never legacy boop or reserve-return lifetime',()=>{
 assert.equal(animationDurationMs({lastMove:{row:2,col:2}}),PLACEMENT_DROP_MS);
 assert.equal(animationDurationMs({boopedPieces:[{to:{row:1,col:2}}]}),BOOP_LAND_MS);
 assert.equal(animationDurationMs({lastMove:{row:1,col:2},boopedPieces:[{to:null}]}),PLACEMENT_DROP_MS);
 assert.equal(animationDurationMs({boopedPieces:[{to:null},{to:{row:1,col:2}}]}),BOOP_LAND_MS);
});

test('bot reply gate is max(400ms, animation), never their sum', () => {
  assert.equal(BOT_MIN_REPLY_MS, 400);
  for (const effects of [
    { lastMove: { row: 2, col: 2 } },
    { boopedPieces: [{ to: { row: 2, col: 3 } }] },
    { graduatedPieces: [{ row: 2, col: 2 }], lastMove: { row: 2, col: 2 } },
    { graduatedPieces: [{ row: 2, col: 3 }], boopedPieces: [{ to: { row: 2, col: 3 } }] },
  ]) {
    assert.equal(botReplyDelayMs(effects), Math.max(400, animationDurationMs(effects)));
  }
});
