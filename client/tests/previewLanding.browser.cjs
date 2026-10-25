// User-visible latency: actual bot actors land -> stationary placement ghost.
// Never uses the input-lock status as the timing origin.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-webgl']});
 try{
  for(const offBoard of [false,true]){
  for(const viewport of [{width:1440,height:1100},{width:896,height:1100},{width:390,height:844}]){
   const page=await browser.newPage({viewport});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(process.env.BOOP_OLD_TIMING)await page.route('**/src/animationTiming.ts*',async route=>{
    const response=await route.fetch();const body=(await response.text()).replace('return BOOP_LAND_MS;', 'return 3600;');
    assert.notEqual(body,await response.text(),'negative control must restore old timing');
    await route.fulfill({response,body});
   });
   await page.goto(process.env.BOOP_TEST_URL);
   await page.evaluate(async offBoard=>{
    const {default:R}=await import('/node_modules/.vite/deps/react.js');
    const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {Game}=await import('/src/components/Game.tsx');
    const {createInitialGameState,executeMove}=await import('/src/bot/LocalGame.ts');
    const state=createInitialGameState();state.currentTurn='gray';
    const r=offBoard?0:2,c=offBoard?2:2;
    state.board[r][c]={color:'orange',type:'kitten'};state.players.orange.kittensInPool--;
    window.next=executeMove(state,r+1,c,'kitten','gray').newState;
    function Harness(){const [s,set]=R.useState(state);window.publish=()=>set(window.next);return R.createElement(Game,{gameState:s,playerColor:'orange',roomCode:'TEST',onPlacePiece:()=>{window.accepted=(window.accepted??0)+1;},onLeave:()=>{},gameOver:null,isBotGame:true});}
    D.createRoot(document.getElementById('root')).render(R.createElement(Harness));
   },offBoard);
   await page.waitForFunction(()=>window.__cellScreen);await page.waitForTimeout(1200);
   const target=await page.evaluate(()=>window.__cellScreen(4,4));await page.mouse.move(target.x,target.y);
   await page.evaluate(()=>{
    window.samples=[];window.start=performance.now();window.publish();
    const sample=()=>{
     const actors=window.__catProbe().filter(a=>a.cat!=='ghost');
     const expected=window.next.board.flatMap((row,r)=>row.map((p,c)=>p?`${p.color}-${p.type}-${r}-${c}`:null).filter(Boolean));
     const landed=expected.every(tag=>{const a=actors.find(a=>a.cat===tag);if(!a)return false;const bits=tag.split('-'),r=+bits[2],c=+bits[3];return Math.abs(a.y-.49)<.015&&Math.abs(a.x-(c-2.5)*1.17)<.015&&Math.abs(a.z-(r-2.5)*1.17)<.015;});
     window.samples.push({t:performance.now()-window.start,landed,ghost:!!document.querySelector('.kitten-preview-label'),actors});
     window.frame=requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
   });
   await page.waitForFunction(()=>window.samples.some(s=>s.ghost),{},{timeout:7000});
   const result=await page.evaluate(()=>{
    cancelAnimationFrame(window.frame);const rows=window.samples;
    // Must first see displacement, excluding stale pre-animation transforms.
    const moving=rows.findIndex(s=>!s.landed);
    // The drop touches down then rebounds. Measure its FINAL settled landing,
    // not the first transient crossing of board height during the bounce.
    const lastMoving=rows.reduce((last,s,i)=>!s.landed?i:last,-1);
    const landed=rows[lastMoving+1],ghost=rows.find(s=>s.ghost);
    return {landedMs:landed?.t,ghostMs:ghost.t,gapMs:ghost.t-landed?.t,moving};
   });
   console.log(JSON.stringify({viewport,offBoard,...result}));
   assert.deepEqual(errors,[]);
   assert.ok(result.moving>=0,'must observe actual animation');
   assert.ok(result.gapMs>=-50&&result.gapMs<300,`visible landing to ghost gap ${result.gapMs}ms`);
   await page.mouse.click(target.x,target.y);
   assert.equal(await page.evaluate(()=>window.accepted),1,'ghost handoff must also accept placement');
   await page.close();
  }
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
