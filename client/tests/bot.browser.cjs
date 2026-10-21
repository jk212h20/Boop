const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.BOOP_TEST_URL;
if (!url) throw new Error('Set BOOP_TEST_URL to a devports-verified Vite server');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    await page.goto(url);
    const result = await page.evaluate(async () => {
      const { BotWorkerClient } = await import('/src/bot/BotWorkerClient.ts');
      const { createInitialGameState, executeMove } = await import('/src/bot/LocalGame.ts');
      const bot = new BotWorkerClient('gray');
      await new Promise(r => setTimeout(r, 200));
      let s = createInitialGameState();
      let ticks = 0;
      const ticker = setInterval(() => ticks++, 10);
      const timings = [];
      for (let i = 0; i < 6; i++) {
        // independent legal opening positions, real module worker / clone round trip
        s = executeMove(createInitialGameState(), i, i, 'kitten', 'orange').newState;
        const start = performance.now();
        const next = await bot.play(s);
        timings.push(performance.now() - start);
        if (!next || next.currentTurn !== 'orange' || next.board.flat().filter(Boolean).length !== 2) throw new Error('No legal reply');
      }
      clearInterval(ticker);
      const pending = bot.play(s); bot.dispose();
      const cancelled = await pending;
      // Simulate a browser refusing module workers: legal, immediate fallback.
      const Original = window.Worker;
      window.Worker = class { constructor() { throw new Error('blocked worker'); } };
      const blocked = new BotWorkerClient('gray');
      window.Worker = Original;
      const fallback = await blocked.play(s); blocked.dispose();
      return { timings, ticks, cancelled, fallbackTurn: fallback?.currentTurn };
    });
    assert.ok(result.timings.every(ms => ms < 1000), JSON.stringify(result));
    assert.ok(result.ticks > 100, 'main thread blocked');
    assert.equal(result.cancelled, null);
    assert.equal(result.fallbackTurn, 'orange');
    console.log(JSON.stringify(result));
    // Real lobby: review entire page at each responsive boundary.
    fs.mkdirSync('/tmp/boop-ai-qa', { recursive: true });
    for (const width of [1440, 1024, 896, 768, 640, 639, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url);
      await page.waitForTimeout(700); // let connection and entry animation settle
      await page.getByRole('button', { name: '🤖 Play vs Bot' }).click();
      await page.locator('select').waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/tmp/boop-ai-qa/lobby-${width}.png`, fullPage: true });
      assert.equal(await page.locator('select').inputValue(), 'grandmaster');
      assert.ok(await page.getByText('Adaptive search uses up to 0.85 seconds. The board stays responsive.', { exact: true }).isVisible());
      const box = await page.locator('select').boundingBox();
      assert.ok(box.width >= Math.min(width - 100, 300), `selector squeezed at ${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`);
    }
    // Exercise the real React hook, including stale replies after reset/leave.
    await page.route('**/bot-hook-harness', r => r.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { createRoot } = ReactDOM;
      const { useBotGame } = await import('/src/hooks/useBotGame.ts');
      function Harness() { window.botHook = useBotGame(); return React.createElement('div', null, 'hook ready'); }
      createRoot(document.getElementById('root')).render(React.createElement(Harness));
    </script>` }));
    await page.goto(url + '/bot-hook-harness');
    await page.waitForFunction(() => window.botHook);
    await page.evaluate(() => window.botHook.startBotGame('Timing test'));
    await page.waitForFunction(() => window.botHook.gameState);
    await page.waitForTimeout(200); // worker warm-up
    const hookTime = await page.evaluate(async () => {
      const start = performance.now();
      await window.botHook.placePiece(2, 2, 'kitten');
      await new Promise((resolve, reject) => {
        const poll = setInterval(() => {
          if (!window.botHook.botThinking && window.botHook.gameState.currentTurn === 'orange') {
            clearInterval(poll); resolve();
          } else if (performance.now() - start > 1500) { clearInterval(poll); reject(Error('late reply')); }
        }, 5);
      });
      return performance.now() - start;
    });
    assert.ok(hookTime < 1000, `React hook reply ${hookTime}ms`);
    await page.evaluate(() => window.botHook.placePiece(0, 0, 'kitten'));
    await page.waitForFunction(() => window.botHook.botThinking);
    await page.evaluate(() => window.botHook.resetGame());
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.botHook.gameState.board.flat().filter(Boolean).length), 0);
    await page.evaluate(() => window.botHook.placePiece(2, 2, 'kitten'));
    await page.waitForFunction(() => window.botHook.botThinking);
    await page.evaluate(() => window.botHook.endBotGame());
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.botHook.gameState), null);
    console.log(`React hook reply ${hookTime.toFixed(1)}ms; reset/leave cancel stale results`);
    console.log('Worker timing, responsiveness, cancellation, fallback and responsive lobby passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
