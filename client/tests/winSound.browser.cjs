const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.BOOP_TEST_URL);
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { createRoot } = ReactDOM;
      const { useWinSound } = await import('/src/hooks/useWinSound.ts');
      const { useSound } = await import('/src/hooks/useSound.ts');
      window.sounds = [];
      window.starts = [];
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.starts.push({ duration: this.buffer.duration, rate: this.playbackRate.value, state: this.context.state });
        return original.apply(this, args);
      };
      function Harness() {
        const [winner, setWinner] = React.useState(undefined);
        const [tick, setTick] = React.useState(0);
        window.win = setWinner;
        window.rerender = () => setTick(t => t + 1);
        const { playSound, setEnabled } = useSound();
        window.enableSound = setEnabled;
        const announce = React.useCallback(name => { window.sounds.push(name); playSound(name); }, [playSound]);
        useWinSound(winner, announce);
        return React.createElement('button', { onClick: () => setWinner('orange') }, 'Win ' + tick);
      }
      createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
    });
    await page.getByRole('button', { name: 'Win 0' }).click();
    await page.waitForFunction(() => window.starts.length === 1);
    await page.evaluate(() => window.rerender());
    await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => window.sounds), ['winVoice']);
    const decoded = await page.evaluate(() => window.starts[0]);
    assert.ok(decoded.duration > 1 && decoded.duration < 4);
    assert.equal(decoded.state, 'running');
    assert.equal(decoded.rate, 1); // Pitch is baked in, independent of browser voices.
    await page.evaluate(() => window.win(undefined));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.win('gray'));
    await page.waitForFunction(() => window.starts.length === 2);
    // A reset before the celebration deadline cancels that win's pending sound.
    await page.evaluate(() => window.win(undefined));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.win('orange'));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.win(undefined));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.starts.length), 2);
    await page.evaluate(() => { window.enableSound(false); window.win('gray'); });
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.starts.length), 2);
    assert.deepEqual(errors, []);
    console.log('PASS: decoded win voice plays once for either winner, survives rerenders/StrictMode, re-arms on rematch, cancels on reset and respects mute', decoded);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
