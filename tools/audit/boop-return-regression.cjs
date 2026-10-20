// Regression for the boop-return path: a cat booped off the bed runs to the
// inventory box and hops in. Three things used to be wrong here and are now
// asserted directly:
//   1. the whole game unmounted ("everything went blank") when the cat reached
//      the box, because the last hop was portal-rendered from inside the
//      react-three-fiber tree ("Canvas is not part of the THREE namespace");
//   2. the return run was a single fast blur all the way to the far corner;
//   3. the cat shrank to a speck on the way (camera-distance perspective).
// Uses the real 3D board — do not stub FloatingBoard3D here.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const esbuild = require('../../client/node_modules/esbuild');
const url = process.env.BOOP_AUDIT_URL;
if (!url) throw Error('BOOP_AUDIT_URL must name a verified Boop Vite listener');

const harness = `
import '/src/index.css';
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {Game} from '/src/components/Game.tsx';
import {createInitialGameState,executeMove} from '/src/bot/LocalGame.ts';
window.__move=executeMove;
window.__fixture=()=>{
 const s=createInitialGameState();
 // A gray cat on the top edge, one orange cat in hand: placing beside it
 // pushes the gray cat off the bed and back to the gray inventory box.
 s.board[0][0]={color:'gray',type:'cat'};
 s.players.orange.catsInPool=7; s.players.gray.catsInPool=7;
 s.currentTurn='orange';
 return s;
};
function Harness(){
 const [state,setState]=React.useState(window.__fixture());
 window.__game={state,setState};
 return <Game gameState={state} playerColor="orange" roomCode="QA" onPlacePiece={async()=>true} onLeave={()=>{}} gameOver={null} opponentDisconnected={false}/>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<Harness/>);
`;
const html = `<html><head><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/__boop-return.tsx"></script></body></html>`;

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR', error.message); });
    await page.route('**/__boop-return', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/__boop-return.tsx', route => route.fulfill({
      contentType: 'application/javascript',
      body: esbuild.transformSync(harness, { loader: 'tsx', format: 'esm' }).code,
    }));
    await page.goto(url + '/__boop-return');
    await page.waitForFunction(() => window.__game && window.__catProbe);
    await page.waitForTimeout(3000);

    const resting = await page.evaluate(() => window.__catProbe().find(p => p.cat.startsWith('gray-cat'))?.pxPerUnit ?? 0);
    assert.ok(resting > 20, `board cat should be measurable, got ${resting} px/unit`);

    const moved = await page.evaluate(() => {
      const result = window.__move(window.__game.state, 0, 1, 'cat', 'orange');
      if (!result.valid) throw Error(result.error);
      window.__game.setState(result.newState);
      return result.newState.boopedPieces.map(boop => boop.to);
    });
    assert.deepEqual(moved, [null], 'the gray cat must be pushed off the bed');

    // Sample the whole trip: the cat must stay recognisably the same size.
    let smallest = Infinity;
    let sawHop = false;
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(100);
      const state = await page.evaluate(() => ({
        cat: window.__catProbe().find(p => p.cat.startsWith('gray-cat')) ?? null,
        board: document.querySelectorAll('.floating-board-shell canvas').length,
        hop: [...document.querySelectorAll('body > div')].some(el => getComputedStyle(el).position === 'fixed' && el.querySelector('.animated-piece-icon')),
      }));
      assert.equal(state.board, 1, 'the board canvas must survive the whole return trip');
      if (state.hop) sawHop = true;
      if (state.cat?.visible) smallest = Math.min(smallest, state.cat.pxPerUnit);
    }
    assert.ok(sawHop, 'the cat should hop into the inventory portrait');
    assert.ok(smallest > resting * 0.8,
      `returning cat shrank too far: ${smallest.toFixed(1)} px/unit vs ${resting.toFixed(1)} at rest`);

    // The crash used to land exactly on the handoff; give it time to settle.
    await page.waitForTimeout(1500);
    const alive = await page.evaluate(() => ({
      board: document.querySelectorAll('.floating-board-shell canvas').length,
      text: document.body.innerText.length,
    }));
    assert.equal(alive.board, 1, 'the board must still be mounted after the cat reaches the box');
    assert.ok(alive.text > 100, 'the page must not be blank');
    assert.deepEqual(errors, []);
    console.log('PASS: a booped cat returns to the inventory box without blanking the page or shrinking away');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
