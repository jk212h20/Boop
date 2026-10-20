// The player's viewing angle is theirs. A re-render, an opponent move, a
// scrollbar appearing, or a model finishing loading must never pull the camera
// back to the framed angle. This drives the real bot game and checks the orbit
// survives all three.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.BOOP_AUDIT_URL;
if (!url) throw Error('BOOP_AUDIT_URL must name a verified Boop Vite listener');

const sameAngle = (a, b) => Math.abs(a.azimuth - b.azimuth) < .02 && Math.abs(a.polar - b.polar) < .02;

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR', error.message); });
    // ?preview3d runs a real local bot game, no server needed.
    await page.goto(url + '/?preview3d');
    await page.waitForFunction(() => window.__boardView && window.__cellScreen);
    await page.waitForTimeout(2500);

    const framed = await page.evaluate(() => window.__boardView());
    const canvasBox = await page.evaluate(() => {
      const rect = document.querySelector('.floating-board-shell canvas').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(canvasBox.x, canvasBox.y);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 170, canvasBox.y - 50, { steps: 12 });
    await page.mouse.up();
    // Let OrbitControls damping settle before measuring.
    await page.waitForTimeout(1500);
    const rotated = await page.evaluate(() => window.__boardView());
    assert.ok(!sameAngle(rotated, framed), 'the drag should actually change the orbit');

    // 1. A scrollbar appearing (the page grows by a move) must not re-frame it.
    await page.setViewportSize({ width: 1425, height: 900 });
    await page.waitForTimeout(600);
    assert.ok(sameAngle(await page.evaluate(() => window.__boardView()), rotated), 'a layout shift must not reset the view');

    // 2. A placement plus the computer's reply must not re-frame it.
    const cell = await page.evaluate(() => window.__cellScreen(2, 2));
    await page.mouse.click(cell.x, cell.y);
    await page.waitForTimeout(6500);
    const afterBot = await page.evaluate(() => window.__boardView());
    assert.ok(sameAngle(afterBot, rotated), `the computer's move must not reset the view (${JSON.stringify(afterBot)} vs ${JSON.stringify(rotated)})`);

    // 3. A real breakpoint change may adjust the distance, never the direction.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(800);
    assert.ok(sameAngle(await page.evaluate(() => window.__boardView()), rotated), 'a breakpoint change must keep the orbit direction');

    assert.deepEqual(errors, []);
    console.log('PASS: the camera keeps the player\'s angle through layout shifts, the computer move, and resizes');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
