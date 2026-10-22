const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const b = await chromium.launch({channel:'chrome',headless:true});
 try {
  const p = await b.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.BOOP_TEST_URL);
  await p.evaluate(async()=>{
   const {default:R}=await import('/node_modules/.vite/deps/react.js');
   const {default:DOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {Game}=await import('/src/components/Game.tsx');
   const {createInitialGameState,executeMove}=await import('/src/bot/LocalGame.ts');
   window.hide = value=>{Object.defineProperty(document,'hidden',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'));};
   function Harness(){
    const [s,set]=R.useState(createInitialGameState());
    window.move=(r,c)=>set(prev=>executeMove(prev,r,c,'kitten',prev.currentTurn).newState);
    return R.createElement(Game,{gameState:s,playerColor:'orange',roomCode:'TEST',onPlacePiece:async()=>true,onLeave:()=>{},gameOver:null,opponentDisconnected:false,isBotGame:true});
   }
   DOM.createRoot(document.getElementById('root')).render(R.createElement(Harness));
  });
  await p.waitForTimeout(2000);
  await p.evaluate(()=>window.move(2,2)); await p.waitForTimeout(900);
  await p.evaluate(()=>window.move(2,3)); await p.waitForTimeout(150);
  // A completed placement must not re-drop when the other player's move
  // boops a different actor. Sample actual transforms through the handoff.
  await p.waitForTimeout(3700);
  await p.evaluate(()=>window.move(2,4));
  for (let i=0;i<12;i++) {
   await p.waitForTimeout(80);
   const old=await p.evaluate(()=>window.__catProbe().find(a=>a.cat==='orange-kitten-2-1'));
   assert.ok(old&&Math.abs(old.y-.49)<.01,'old actor replayed on new move');
  }
  await p.waitForTimeout(2800);
  await p.evaluate(()=>window.move(4,4));
  for (let i=0;i<10;i++) {
   await p.waitForTimeout(80);
   const old=await p.evaluate(()=>window.__catProbe().find(a=>a.cat==='orange-kitten-2-4'));
   assert.ok(old&&Math.abs(old.y-.49)<.01,'previous placement dropped again');
  }
  await p.evaluate(()=>window.hide(true)); await p.waitForTimeout(100);
  const hidden=await p.evaluate(()=>{const r=window.__catProbe?.();return r;});
  // Spend longer than an entire boop while backgrounded, then return.
  await p.waitForTimeout(4000);
  await p.evaluate(()=>window.hide(false)); await p.waitForTimeout(100);
  assert.equal(await p.locator('.board-cell-anchors span').count(),36);
  // Use the scene's actual actor probe rather than merely checking DOM presence.
  const settled=await p.evaluate(()=>window.__catProbe?.());
  assert.equal(settled.length,4);
  const orange=settled.find(a=>a.cat==='orange-kitten-2-1');
  const gray=settled.find(a=>a.cat==='gray-kitten-2-2');
  assert.ok(orange&&gray);
  assert.ok(Math.abs(orange.x + 1.755)<.01 && Math.abs(gray.x+.585)<.01);
  assert.ok(settled.every(a=>a.visible&&Math.abs(a.y-.49)<.01));
  await p.waitForTimeout(400);
  const later=await p.evaluate(()=>window.__catProbe());
  assert.deepEqual(later.map(a=>[a.cat,a.x,a.y,a.z]),settled.map(a=>[a.cat,a.x,a.y,a.z]),'no replay after resume');
  console.log('Hidden/resumed actor probes',JSON.stringify({hidden,settled}));
  assert.deepEqual(errors,[]);
  await p.evaluate(()=>window.hide(true)); await p.waitForTimeout(50);
  await p.evaluate(()=>window.move(5,0)); await p.waitForTimeout(50);
  await p.evaluate(()=>window.hide(false)); await p.waitForTimeout(100);
  const hiddenMove=await p.evaluate(()=>window.__catProbe().find(a=>a.cat==='orange-kitten-5-0'));
  assert.ok(hiddenMove?.visible && Math.abs(hiddenMove.y-.49)<.01,'hidden move is already settled');
  await p.evaluate(()=>window.move(0,0)); await p.waitForTimeout(700);
  assert.deepEqual(errors,[]);
  console.log('PASS: hide mid-boop, wait past deadlines, resume and play another move without errors');
 } finally {await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
