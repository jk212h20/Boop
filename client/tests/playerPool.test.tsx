import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerPool } from '../src/components/Board';

// Availability controls brightness, while turn/ownership independently control clicks.
for (const color of ['orange', 'gray'] as const) {
  for (const isCurrentPlayer of [true, false]) {
    for (const isMyTurn of [true, false]) {
      for (const count of [0, 3]) {
        test(`${color} pool: own=${isCurrentPlayer}, turn=${isMyTurn}, count=${count}`, () => {
          const html = renderToStaticMarkup(<PlayerPool color={color}
            kittensInPool={count} catsInPool={count} isMyTurn={isMyTurn}
            isCurrentPlayer={isCurrentPlayer} selectedPieceType="kitten"
            onSelectPiece={() => {}} playerName="Test Player" />);
          assert.ok(!html.includes('class="card'));
          assert.match(html, /player-pool-name[^]*?<\/div><div class="player-pool-selectors">/);
          const buttons = [...html.matchAll(/<button\b[^]*?<\/button>/g)].map(match => match[0]);
          assert.equal(buttons.length, 2);
          for (const [i, button] of buttons.entries()) {
            assert.ok(button.includes(`data-pool-target="${color}-${i === 0 ? 'kitten' : 'cat'}"`));
            assert.ok(button.includes(count === 0 ? 'pool-piece-empty' : 'pool-piece-available'));
            assert.ok(!button.includes(count === 0 ? 'pool-piece-available' : 'pool-piece-empty'));
            assert.equal(button.includes('disabled=""'), !(isCurrentPlayer && isMyTurn && count > 0));
            assert.ok(button.includes(`<span class="pool-piece-count">${count}</span>`));
            assert.ok(!button.includes('opacity-45'), 'Passive avatars must not inherit disabled dimming');
          }
          assert.equal(buttons[0].includes('aria-pressed="true"'), isCurrentPlayer && count > 0);
          assert.equal(buttons[1].includes('aria-pressed="true"'), false);
        });
      }
    }
  }
}
