import test from 'node:test';
import assert from 'node:assert/strict';
import { animationDurationMs, botReplyDelayMs, BOT_PAUSE_MS } from '../src/animationTiming';

test('bot reply gate leaves 400ms after placements, boops and graduations', () => {
  assert.equal(BOT_PAUSE_MS, 400);
  for (const effects of [
    { lastMove: { row: 2, col: 2 } },
    { boopedPieces: [{ to: { row: 2, col: 3 } }] },
    { graduatedPieces: [{ row: 2, col: 2 }], lastMove: { row: 2, col: 2 } },
    { graduatedPieces: [{ row: 2, col: 3 }], boopedPieces: [{ to: { row: 2, col: 3 } }] },
  ]) {
    assert.equal(botReplyDelayMs(effects), animationDurationMs(effects) + 400);
  }
});
