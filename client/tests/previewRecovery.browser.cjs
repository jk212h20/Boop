// Regression: the handoff raycast is lost/stale, then no physical pointer event.
// A one-shot refresh must not be the only path back to the placement ghost.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-webgl']});
 try{
  for(const viewport of [{width:1440,height:1100},{width:896,height:1100},{width:390,height:844}]){
   const page=await browser.newPage({viewport});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/components/FloatingBoard3D.tsx*',async route=>{
    const response=await route.fetch();let body=await response.text();
    // Lose exactly the first raycast on handoff. Models transforms/events not
    // yet caught up, without changing game/animation/input gating or timers.
    body=body.replaceAll('events.update?.()', '(window.__loseHandoffRaycast ? (window.__loseHandoffRaycast=false) : events.update?.())');
    if(process.env.BOOP_UNGUARDED){
     assert.ok(body.includes('hoverRefresh.current < 0.1'),'negative control must disable the recovery');
     body=body.replace('hoverRefresh.current < 0.1','hoverRefresh.current < Infinity');
    }
    await route.fulfill({response,body});
   });
   await page.goto(process.env.BOOP_TEST_URL);
   await page.evaluate(async()=>{
    const {default:R}=await import('/node_modules/.vite/deps/react.js');
    const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {Game}=await import('/src/components/Game.tsx');
    const {createInitialGameState}=await import('/src/bot/LocalGame.ts');
    const state=createInitialGameState();state.currentTurn='gray';
    function Harness(){const [s,set]=R.useState(state);window.publish=set;return R.createElement(Game,{gameState:s,playerColor:'orange',roomCode:'TEST',onPlacePiece:()=>{},onLeave:()=>{},gameOver:null,botThinking:s.currentTurn==='gray',isBotGame:true});}
    D.createRoot(document.getElementById('root')).render(R.createElement(Harness));
   });
   await page.waitForFunction(()=>window.__cellScreen);
   await page.waitForTimeout(1200);
   const point=await page.evaluate(()=>window.__cellScreen(3,3));
   await page.mouse.move(point.x,point.y);
   await page.evaluate(async()=>{
    // Clear cached hover while mouse remains in place, as can happen when an
    // animated actor/interaction owns the pointer during the locked turn.
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}));
    const {createInitialGameState,executeMove}=await import('/src/bot/LocalGame.ts');
    const s=createInitialGameState();s.currentTurn='gray';
    window.__loseHandoffRaycast=true;
    window.publish(executeMove(s,0,0,'kitten','gray').newState);
   });
   const status=page.getByText('Finishing the move animation…',{exact:true});await status.waitFor();
   await status.waitFor({state:'hidden'});const unlocked=Date.now();
   await page.locator('.kitten-preview-label').waitFor({timeout:700});
   const recoveryMs=Date.now()-unlocked;
   assert.ok(recoveryMs<700,`ghost delayed ${recoveryMs}ms`);
   assert.ok(await page.evaluate(()=>window.__catProbe().some(p=>p.cat==='ghost'&&p.visible)));
   // It must remain usable without another mousemove, not merely flash once.
   for(let i=0;i<5;i++){
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.kitten-preview-label').count(),1);
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
   assert.deepEqual(errors,[]);
   await fs.mkdir('/tmp/boop-preview-recovery',{recursive:true});
   await page.screenshot({path:`/tmp/boop-preview-recovery/page-${viewport.width}.png`});
   await page.mouse.move(5,5);
   await page.waitForTimeout(250);
   assert.equal(await page.locator('.kitten-preview-label').count(),0,'leaving the quilt clears ghost');
   console.log(JSON.stringify({viewport,recoveryMs,ghost:true}));await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
