// Positive regression for visible-but-already-graduated kittens. Uses actual
// LocalGame/Game React source, intercepting only the 3D presentation boundary.
// PLAYWRIGHT_MODULE and BOOP_AUDIT_URL follow the browser audit contract.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const esbuild = require('../../client/node_modules/esbuild');
const url = process.env.BOOP_AUDIT_URL;
if (!url) throw Error('BOOP_AUDIT_URL must name a verified Boop Vite listener');
const harness = `
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {Game} from '/src/components/Game.tsx';
import {createInitialGameState,executeMove} from '/src/bot/LocalGame.ts';
import {animationDurationMs} from '/src/animationTiming.ts';
window.__animationDuration=animationDurationMs;
window.__fixture=()=>{
 const s=createInitialGameState();s.board[0][0]={color:'orange',type:'kitten'};s.board[0][1]={color:'orange',type:'kitten'};s.players.orange.kittensInPool=6;
 return s;
};
window.__move=executeMove;
function Harness(){
 const [state,setState]=React.useState(window.__fixture());
 window.__game={state,setState};
 return <Game gameState={state} playerColor="orange" roomCode="QA" onPlacePiece={async()=>true} onLeave={()=>{}} gameOver={null} opponentDisconnected={false}/>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<Harness/>);
`;
const boardStub = `import React from '/node_modules/.vite/deps/react.js';
export function FloatingBoard3D(props){window.__board=props;return React.createElement('div',{'data-testid':'board'},props.board.flat().filter(Boolean).length+' pieces')}
export function AnimatedPieceIcon(){return null}`;
const html = `<html><head><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/__graduation-test.tsx"></script></body></html>`;
async function main(){
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
  const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
  await page.route('**/graduation-test',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.route('**/__graduation-test.tsx',r=>r.fulfill({contentType:'application/javascript',body:esbuild.transformSync(harness,{loader:'tsx',format:'esm'}).code}));
  await page.route('**/src/components/FloatingBoard3D.tsx*',r=>r.fulfill({contentType:'application/javascript',body:boardStub}));
  await page.goto(url+'/graduation-test');await page.waitForFunction(()=>window.__game&&window.__board);
  const timings=await page.evaluate(()=>[
   window.__animationDuration({}),
   window.__animationDuration({boopedPieces:[{to:{row:1,col:1}}]}),
   window.__animationDuration({boopedPieces:[{to:null}]}),
   window.__animationDuration({graduatedPieces:[{}]}),
  ]);
  // A returned-to-box trip is cosmetic and must NOT add to the move budget:
  // the game may advance while the cat is still walking home.
  assert.deepEqual(timings,[800,3600,3600,6500]);
  console.log('PASS: shared handoff timing covers the complete graduation and fly-to-pool sequence');
  async function graduate(){
   await page.evaluate(()=>window.__game.setState(window.__fixture()));await page.waitForTimeout(30);
   const result=await page.evaluate(()=>{const r=window.__move(window.__game.state,0,2,'kitten','orange');window.__game.setState(r.newState);return {valid:r.valid,boardCount:r.newState.board.flat().filter(Boolean).length,cats:r.newState.players.orange.catsInPool}});
   assert.deepEqual(result,{valid:true,boardCount:0,cats:3});
   await page.waitForTimeout(200);
   const shown=await page.evaluate(()=>({count:window.__board.board[0].slice(0,3).filter(Boolean).length,graduating:window.__board.graduatingPieces.length,phase:window.__board.graduationPhase,history:window.__board.isViewingHistory,logical:window.__game.state.graduatedPieces}));
   assert.equal(shown.count,3,'graduating kittens remain visible during their own animation');
  }
  await graduate();
  // Existing local bot response reaches the UI at ~2000ms, before the
  // old 2500ms cleanup; use an immediate legal no-boop reply to isolate it.
  await page.waitForTimeout(1900);
  await page.evaluate(()=>{const r=window.__move(window.__game.state,5,5,'kitten','gray');if(!r.valid)throw Error(r.error);window.__game.setState(r.newState)});
  await page.waitForTimeout(900);
  const interrupted=await page.evaluate(()=>({logical:window.__game.state.board[0].slice(0,3),display:window.__board.board[0].slice(0,3),graduating:window.__board.graduatingPieces.length,phase:window.__board.graduationPhase}));
  assert.deepEqual(interrupted.display,interrupted.logical,'next move must not leave graduated kittens restored as phantom pieces');
  assert.equal(interrupted.graduating,0);assert.equal(interrupted.phase,null);
  console.log('PASS: next placement interrupts graduation without leaving phantom kittens');
  // Wait the shared animation budget rather than a hard-coded guess, so a
  // pacing change cannot silently make this check race the overlay cleanup.
  const graduationMs=await page.evaluate(()=>window.__animationDuration({graduatedPieces:[{}]}));
  await graduate();await page.waitForTimeout(graduationMs+300);
  assert.equal(await page.evaluate(()=>window.__board.board.flat().filter(Boolean).length),0);
  console.log('PASS: uninterrupted graduation removes all three kittens and awards three cats');
  await graduate();
  await page.evaluate(()=>window.__game.setState(window.__fixture()));await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>window.__board.board.flat().filter(Boolean).length),2);
  assert.equal(await page.evaluate(()=>window.__board.graduatingPieces.length),0);
  console.log('PASS: reset/new board cannot inherit a prior graduation overlay');
  await graduate();
  await page.evaluate(()=>{const r=window.__move(window.__game.state,5,5,'kitten','gray');const state=r.newState;
   state.boopedPieces=[{from:{row:4,col:4},to:{row:3,col:3},piece:{color:'gray',type:'kitten'}}];
   state.board[3][3]={color:'gray',type:'kitten'};window.__game.setState(state)});
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.__board.graduatingPieces.length),0);
  assert.deepEqual(await page.evaluate(()=>window.__board.board[0].slice(0,3)),[null,null,null]);
  console.log('PASS: interruption by a boop-only update also clears old graduation overlays');
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
