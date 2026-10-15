// Run against a devports-verified Vite preview. Uses this client's Playwright
// dependency and installed Chrome; no shared project node_modules or downloads.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const url = process.env.BOOP_TEST_URL;
  assert.ok(url, 'BOOP_TEST_URL must name the verified local preview');
  const out = process.env.BOOP_QA_DIR || '/tmp/boop-appearance-qa';
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('?preview3d', url).href);
    await page.getByLabel('Quilt color 1').waitFor();
    // Wait for the deterministic preview move and bot response, not page load.
    await page.getByText('Move 2/2', { exact: false }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2200); // Allow the actual WebGL asset upload/idle handoff.
    assert.equal(await page.getByLabel('Quilt color 1').inputValue(), '#8c9199');
    assert.equal(await page.getByLabel('Quilt color 2').inputValue(), '#849b92');
    // Passive opponent stock must remain bright; only genuinely empty pools dim.
    const pools = await page.locator('.player-pool').evaluateAll(elements => elements.map(pool => ({
      nameBackground: getComputedStyle(pool.querySelector('.player-pool-name')).backgroundColor,
      background: getComputedStyle(pool).backgroundColor,
      selectors: Array.from(pool.querySelectorAll('[data-pool-target]')).map(button => ({
        count: Number(button.querySelector('.pool-piece-count').textContent),
        countSize: parseFloat(getComputedStyle(button.querySelector('.pool-piece-count')).fontSize),
        empty: button.classList.contains('pool-piece-empty'),
        opacity: getComputedStyle(button).opacity,
        disabled: button.disabled,
      })),
    })));
    assert.equal(pools.length, 2);
    for (const pool of pools) {
      assert.equal(pool.background, 'rgba(0, 0, 0, 0)', 'No enclosing panel around a pool');
      assert.notEqual(pool.nameBackground, 'rgba(0, 0, 0, 0)');
      for (const selector of pool.selectors) {
        assert.equal(selector.empty, selector.count === 0);
        assert.equal(selector.opacity, '1', 'Waiting for a turn must not dim selector boxes');
        assert.ok(selector.countSize >= 32, 'Availability counts must be prominent');
      }
    }
    assert.ok(pools[0].selectors.some(selector => selector.count > 0 && selector.disabled));
    console.log('PASS: name-only panels, large counts, and availability independent of turn/ownership');
    await page.screenshot({ path: path.join(out, 'woven-board.png') });

    const canvas = page.locator('.floating-board-shell canvas');
    const box = await canvas.boundingBox();
    assert.ok(box);
    let previewPoint;
    for (const y of [.43, .50, .57, .64]) {
      for (const x of [.4, .5, .6, .7]) {
        const point = { x: box.x + box.width * x, y: box.y + box.height * y };
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(120);
        if (await page.locator('.kitten-preview-label').isVisible()) {
          previewPoint = point; break;
        }
      }
      if (previewPoint) break;
    }
    assert.ok(previewPoint, 'Moving over an empty quilt square should show a ghost preview');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.kitten-preview-label').count(), 1);
    await page.screenshot({ path: path.join(out, 'ghost-preview.png') });
    await page.mouse.click(previewPoint.x, previewPoint.y);
    await page.getByText('Move 4/4', { exact: false }).waitFor({ timeout: 30000 });
    console.log('PASS: ghost preview leaves quilt picking intact; placement and bot response completed');
    await page.mouse.move(10, 10);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.kitten-preview-label').count(), 0);

    await page.getByLabel('Quilt color 1').fill('#727e92');
    await page.getByLabel('Quilt color 2').fill('#ad909d');
    await page.waitForFunction(() => localStorage.getItem('boop.quilt-colors.v1') === '["#727e92","#ad909d"]');
    await page.screenshot({ path: path.join(out, 'custom-colors.png') });
    await page.reload();
    await page.getByLabel('Quilt color 1').waitFor();
    assert.equal(await page.getByLabel('Quilt color 1').inputValue(), '#727e92');
    assert.equal(await page.getByLabel('Quilt color 2').inputValue(), '#ad909d');
    await page.getByRole('button', { name: 'Reset colors' }).click();
    assert.equal(await page.getByLabel('Quilt color 1').inputValue(), '#8c9199');
    assert.equal(await page.getByLabel('Quilt color 2').inputValue(), '#849b92');
    console.log('PASS: both color controls update, persist after reload, and reset');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Quilt color 1').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    for (const label of ['Quilt color 1', 'Quilt color 2']) {
      const bounds = await page.getByLabel(label).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, `${label} should fit on mobile`);
    }
    await page.screenshot({ path: path.join(out, 'mobile-controls.png') });
    for (const pool of await page.locator('.player-pool').all()) {
      await pool.scrollIntoViewIfNeeded();
      for (const selector of await pool.locator('[data-pool-target]').all()) {
        const bounds = await selector.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Mobile pool selectors fit');
      }
    }
    await page.screenshot({ path: path.join(out, 'mobile-player-pool.png') });
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    console.log('PASS: mobile controls accessible; no uncaught browser exceptions');
    console.log(`Screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
