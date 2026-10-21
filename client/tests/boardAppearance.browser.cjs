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
    await page.goto(new URL('?preview3d&demo', url).href);
    // Wait for the deterministic preview move and bot response, not page load.
    await page.getByText('Move 2/2', { exact: false }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2200); // Allow the actual WebGL asset upload/idle handoff.
    // There is no colour picker or palette control any more: the room's quilt
    // is fixed, so nothing in the page can restyle it.
    assert.equal(await page.locator('.bedroom-palette').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Bedroom' }).count(), 0);
    // The look-around hint was clutter on a board you rotate by dragging.
    assert.equal(await page.locator('.board-hint').count(), 0);
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
    // The count and its name share one line ("7 Kittens"), so the portrait gets
    // the rest of the box rather than losing a third of it to two rows.
    const head = await page.evaluate(() => {
      const button = document.querySelector('[data-pool-target="orange-kitten"]');
      const row = button.querySelector('.pool-piece-head');
      const count = row.querySelector('.pool-piece-count').getBoundingClientRect();
      const label = row.querySelector('.pool-piece-label').getBoundingClientRect();
      const icon = button.querySelector('.animated-piece-icon').getBoundingClientRect();
      return {
        // Baseline-aligned, so compare vertical overlap rather than tops: the
        // count is three times the size of its name.
        sameRow: count.top < label.bottom && label.top < count.bottom
          && row.getBoundingClientRect().height < count.height * 1.8,
        countLeads: count.left < label.left,
        iconBelow: icon.top >= count.bottom - 2,
        iconShare: icon.height / button.getBoundingClientRect().height,
      };
    });
    assert.ok(head.sameRow && head.countLeads, 'The count leads its name on one line');
    assert.ok(head.iconBelow, 'The portrait sits under the count line');
    assert.ok(head.iconShare > .6, `The portrait owns most of the card (${head.iconShare.toFixed(2)})`);
    console.log('PASS: count and name share a line above a full-height portrait');
    // The portraits are rendered from the models, so this measures the actual
    // artwork: no animal may be cropped at the frame edge, and the kitten must
    // read as the smaller animal instead of being scaled up to fill the box.
    const portraits = await page.evaluate(async () => {
      const measure = async (target) => {
        const img = document.querySelector(`[data-pool-target="${target}"] img`);
        if (img.decode) await img.decode().catch(() => {});
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let top = canvas.height, bottom = -1;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (data[(y * canvas.width + x) * 4 + 3] < 8) continue;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
        return { top, bottom, share: (bottom - top + 1) / canvas.height, height: canvas.height };
      };
      return { kitten: await measure('orange-kitten'), cat: await measure('orange-cat') };
    });
    for (const [name, portrait] of Object.entries(portraits)) {
      assert.ok(portrait.top > 1, `${name} portrait is not cut off at the top (top=${portrait.top})`);
      assert.ok(portrait.bottom < portrait.height - 1, `${name} portrait is not cut off at the bottom`);
    }
    assert.ok(portraits.kitten.share < portraits.cat.share * .85,
      `The kitten reads smaller than the cat (${portraits.kitten.share.toFixed(2)} vs ${portraits.cat.share.toFixed(2)})`);
    assert.ok(portraits.cat.share > .75, 'The cat still fills its portrait');
    console.log('PASS: portraits are uncropped and the kitten is smaller than the cat');
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

    // The rules live in the book on the bedside table; "?" is the keyboard way
    // in, and Escape closes it.
    assert.equal(await page.locator('.rules-book').count(), 0, 'Rules start closed');
    await page.keyboard.press('?');
    await page.locator('.rules-book').waitFor();
    assert.equal(await page.locator('#rules-title').textContent(), 'How to Boop');
    await page.screenshot({ path: path.join(out, 'rules.png') });
    await page.keyboard.press('Escape');
    await page.locator('.rules-book').waitFor({ state: 'detached' });
    console.log('PASS: the book opens the rules and Escape closes them');

    // The television across the bed is the second way into the rules: clicking
    // its screen opens the explainer in a popup, not on the little set itself.
    const room = await page.evaluate(() => window.__roomProbe());
    const tv = room.find(prop => prop.prop === 'tv');
    assert.ok(tv && tv.visible, 'The television must be in the room and rendered');
    const boardBox = await page.locator('.floating-board-shell canvas').boundingBox();
    assert.ok(tv.x > boardBox.x + 6 && tv.x < boardBox.x + boardBox.width - 6
      && tv.y > boardBox.y + 6 && tv.y < boardBox.y + boardBox.height - 6,
      'The television screen must be clickable inside the canvas');
    assert.equal(await page.locator('.rules-video').count(), 0, 'The video starts closed');
    await page.mouse.click(tv.x, tv.y);
    await page.locator('.rules-video').waitFor();
    assert.equal(await page.locator('#rules-video-title').textContent(), 'How to Boop, on film');
    assert.equal(await page.locator('.rules-video').getAttribute('role'), 'dialog');
    // The click hands focus to the canvas, so the dialog takes it back on the
    // next frame rather than during the click.
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Close the video',
      null, { timeout: 2000 });
    await page.screenshot({ path: path.join(out, 'rules-video.png') });
    await page.keyboard.press('Escape');
    await page.locator('.rules-video').waitFor({ state: 'detached' });
    // And the backdrop closes it, like the book.
    await page.mouse.click(tv.x, tv.y);
    await page.locator('.rules-video').waitFor();
    await page.mouse.click(24, 24);
    await page.locator('.rules-video').waitFor({ state: 'detached' });
    console.log('PASS: the television opens the explainer video popup, and Escape or the backdrop closes it');

    // The room itself: a royal blue rug, and a cable that leaves the set and
    // heads for the bed instead of stopping at the table edge.
    const points = await page.evaluate(() => window.__project([
      [0, -1.026, 3.95], [1.5, -1.026, 3.7], [-1.5, -1.026, 3.7],
      [-4.5, .17, -.5], [-4.85, .19, -.28],
    ]));
    const shot = (await page.screenshot()).toString('base64');
    const samples = await page.evaluate(async ({ shot, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${shot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return points.map(({ x, y }) => {
        const patch = [];
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const [r, g, b] = context.getImageData(Math.round(x) + dx, Math.round(y) + dy, 1, 1).data;
            patch.push({ r, g, b });
          }
        }
        return patch;
      });
    }, { shot, points });
    const rug = samples.slice(0, 3);
    const blue = rug.filter(patch => patch.some(({ r, g, b }) => b - r > 60 && b > 120)).length;
    assert.ok(blue >= 2, 'The circular rug is royal blue, not graphite');
    const cables = samples.slice(3).filter(patch => patch.filter(({ r, g, b }) =>
      Math.abs(r - g) < 16 && Math.abs(g - b) < 16 && r > 70).length >= 6).length;
    assert.ok(cables >= 1, 'The power cord is visible on the table, heading for the bed');
    console.log('PASS: royal blue rug and a visible power cord running to the bed');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    // The carpet keeps its wooden capping strip on every layout.
    const carpet = await page.evaluate(() => {
      const strip = getComputedStyle(document.body, '::after');
      const pile = getComputedStyle(document.body, '::before');
      return { stripZIndex: strip.zIndex, stripHeight: parseFloat(strip.height), stripImage: strip.backgroundImage,
        stripTop: strip.top, pileColour: pile.backgroundColor, pileImage: pile.backgroundImage };
    });
    assert.ok(carpet.stripHeight >= 8, 'The carpet needs a raised moulding strip');
    // The moulding is part of the room, so it must paint behind the board:
    // an unpositioned strip laid itself across the mattress.
    assert.equal(carpet.stripZIndex, '-1', 'The moulding must sit behind the board');
    assert.match(carpet.stripImage, /linear-gradient/, 'The moulding needs its profile');
    // Silver and graphite, not the old light green.
    assert.doesNotMatch(carpet.pileColour, /154, 170, 145/, 'The carpet must not be the old green');
    assert.match(carpet.pileColour, /^rgb\(1[0-9]{2}, 1[0-9]{2}, 1[0-9]{2}\)$/, 'The carpet is a mid grey');
    await page.screenshot({ path: path.join(out, 'mobile-controls.png') });
    for (const pool of await page.locator('.player-pool').all()) {
      await pool.scrollIntoViewIfNeeded();
      for (const selector of await pool.locator('[data-pool-target]').all()) {
        const bounds = await selector.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Mobile pool selectors fit');
      }
    }
    await page.screenshot({ path: path.join(out, 'mobile-player-pool.png') });
    // Audit the full composition, not just whether individual controls exist.
    for (const width of [1440, 1280, 1279, 1200, 1024, 768, 600, 601, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(350);
      const layout = await page.evaluate(() => {
        const bounds = element => {
          const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
          return { x, y, width, height, right, bottom };
        };
        return {
          scrollWidth: document.documentElement.scrollWidth,
          board: bounds(document.querySelector('.game-board')),
          pools: Array.from(document.querySelectorAll('.player-pool')).map(pool => ({
            bounds: bounds(pool),
            name: bounds(pool.querySelector('h3')),
            nameLine: parseFloat(getComputedStyle(pool.querySelector('h3')).lineHeight),
            selectors: Array.from(pool.querySelectorAll('[data-pool-target]')).map(button => ({
              bounds: bounds(button),
              // Only real text labels: the piece icon is a decorative span and
              // its 1px scroll overflow is not clipped text.
              labelsFit: Array.from(button.querySelectorAll('span'))
                .filter(label => label.textContent.trim().length > 0)
                .every(label => label.scrollWidth <= label.clientWidth),
            })),
          })),
        };
      });
      assert.ok(layout.scrollWidth <= width, `No horizontal overflow at ${width}px`);
      for (const pool of layout.pools) {
        assert.ok(pool.bounds.x >= 0 && pool.bounds.right <= width, `Pool fits at ${width}px`);
        assert.ok(pool.name.height <= pool.nameLine + 1, `Name must not wrap at ${width}px`);
        for (const selector of pool.selectors) {
          assert.ok(selector.bounds.width >= 94, `Selectors need real room at ${width}px`);
          assert.ok(selector.labelsFit, `Selector text must fit at ${width}px`);
        }
        const b = layout.board, p = pool.bounds;
        assert.ok(p.right <= b.x || p.x >= b.right || p.bottom <= b.y || p.y >= b.bottom,
          `Pools cannot overlap the board at ${width}px`);
      }
      await page.screenshot({ path: path.join(out, `layout-${width}.png`), fullPage: true });
      console.log(`PASS: full layout at ${width}px; selectors ${layout.pools[0].selectors[0].bounds.width}px wide`);
    }
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    console.log('PASS: mobile controls accessible; no uncaught browser exceptions');
    console.log(`Screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
