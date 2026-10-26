const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const url = process.env.BOOP_TEST_URL;
  assert.ok(url);
  const out = process.env.BOOP_QA_DIR || '/tmp/boop-graphics-qa';
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const demo = process.env.BOOP_BENCH_SCENE === 'demo';
    await page.goto(url + (demo ? '?preview3d&demo' : '?preview3d&win'));
    if (demo) await page.getByText('Move 2/2', { exact: false }).waitFor();
    await page.waitForFunction(() => window.__renderProbe && window.__catProbe().length > 0);
    await page.waitForTimeout(2500);
    const results = [];
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      for (const hover of [false, true]) {
        const point = await page.evaluate(() => window.__cellScreen(4, 4));
        await page.mouse.move(hover ? point.x : 10, hover ? point.y : 10);
        await page.waitForTimeout(1500);
        if (demo) assert.equal(await page.locator('.kitten-preview-label').count(), hover ? 1 : 0);
        const before = await cdp.send('Performance.getMetrics');
        const frames = await page.evaluate(() => new Promise(resolve => {
          const intervals = []; let last; const start = performance.now();
          function tick(t) { if (last !== undefined) intervals.push(t - last); last = t;
            if (t - start < 5000) requestAnimationFrame(tick); else resolve(intervals); }
          requestAnimationFrame(tick);
        }));
        const after = await cdp.send('Performance.getMetrics');
        const delta = name => after.metrics.find(m => m.name === name).value - before.metrics.find(m => m.name === name).value;
        frames.sort((a, b) => a - b);
        results.push({ rate, hover, frameP95ms: +frames[Math.floor(frames.length * .95)].toFixed(2), frames: frames.length,
          mainThreadMs: +(delta('TaskDuration') * 1000).toFixed(1), scriptMs: +(delta('ScriptDuration') * 1000).toFixed(1),
          render: await page.evaluate(() => window.__renderProbe()) });
      }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    if (!process.env.BOOP_BENCH_ONLY) {
      for (const width of [1440, 1280, 1279, 1024, 768, 600, 599, 390, 320]) {
        await page.setViewportSize({ width, height: 1100 });
        await page.waitForTimeout(500);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
        await page.screenshot({ path: `${out}/page-${width}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(`${out}/metrics.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
