const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'chrome',args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-webgl']});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.BOOP_UNGUARDED) await page.route('**/src/components/Game.tsx*',async route=>{
   const response=await route.fetch();let source=await response.text();
   source=source.replace('!isMyTurn || moveInProgress','!isMyTurn').replace('isMyTurn && !moveInProgress &&','isMyTurn &&');
   await route.fulfill({response,body:source});
  });
  await page.goto(process.env.BOOP_TEST_URL);
  await page.evaluate(async()=>{
   const {default:R}=await import('/node_modules/.vite/deps/react.js');
   const {default:DOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {Game}=await import('/src/components/Game.tsx');
   const {useBotGame}=await import('/src/hooks/useBotGame.ts');
   function Harness(){
    const bot=useBotGame(); window.bot=bot;
    return bot.gameState ? R.createElement(Game,{key:bot.gameId,gameState:bot.gameState,playerColor:bot.playerColor,roomCode:'TEST',onPlacePiece:bot.placePiece,onSelectGraduation:bot.selectGraduation,onLeave:()=>{},gameOver:bot.gameOver,botThinking:bot.botThinking,isBotGame:true}) : null;
   }
   DOM.createRoot(document.getElementById('root')).render(R.createElement(Harness));
   window.samples=[];let prev=null;let move=0;
   function sample(){
    const s=window.bot?.gameState;
    if(s?.board!==prev){prev=s?.board;move++;}
    if(s?.lastMove){const p=s.board[s.lastMove.row][s.lastMove.col];
     window.samples.push({move,time:performance.now(),turn:s.currentTurn,last:s.lastMove,color:p?.color,phase:s.phase,actors:window.__catProbe?.()});
    }
    window.sampleFrame=requestAnimationFrame(sample);
   }requestAnimationFrame(sample);
  });
  await page.waitForFunction(()=>window.bot);
  await page.evaluate(()=>window.bot.startBotGame('Animation',{timeBudgetMs:1}));
  await page.waitForFunction(()=>window.__catProbe);
  await page.waitForTimeout(1800);
  for(let turn=0;turn<6;turn++){
   await page.waitForFunction(()=>!window.bot.botThinking);
   const [r,c]=await page.evaluate(()=>{
    const s=window.bot.gameState;
    const preferred=[[2,2],[4,4],[0,0],[0,5],[5,0],[5,5]];
    return preferred.find(([r,c])=>!s.board[r][c]) ?? s.board.flatMap((line,r)=>line.map((p,c)=>p?null:[r,c])).find(Boolean);
   });
   // Click through Game, not the hook: hammer the next square as soon as
   // the bot gives back the logical turn. It must not interrupt the drop.
   const before=await page.evaluate(()=>window.bot.gameState.lastMove);
   const point=await page.evaluate(([r,c])=>window.__cellScreen(r,c),[r,c]);
   let accepted=false;
   for(let i=0;i<250;i++){
    await page.mouse.click(point.x,point.y);
    accepted=await page.evaluate(old=>{const s=window.bot.gameState;return s.currentTurn==='gray'||JSON.stringify(s.lastMove)!==JSON.stringify(old)},before);
    if(accepted)break;
    await page.waitForTimeout(30);
   }
   assert.ok(accepted,`Placement not accepted at ${r},${c}: ${await page.locator('.game-instructions').textContent()}`);
   await page.waitForFunction(()=>!window.bot.botThinking);
   await page.waitForTimeout(process.env.BOOP_FAST_INPUT ? 0 : 1000);
  }
  await page.waitForTimeout(1100);
  const samples=await page.evaluate(()=>{cancelAnimationFrame(window.sampleFrame);return window.samples;});
  const moves=[];
  for(const id of [...new Set(samples.map(s=>s.move))]){
   const frames=samples.filter(s=>s.move===id);const s=frames[0];
   const tag=`${s.color}-kitten-${s.last.row}-${s.last.col}`;
   const ys=frames.flatMap(f=>f.actors?.filter(a=>a.cat===tag).map(a=>a.y)||[]);
   moves.push({id,color:s.color,cell:s.last,frames:frames.length,min:Math.min(...ys),max:Math.max(...ys),first:ys.slice(0,8)});
  }
  console.log(JSON.stringify(moves,null,2));
  assert.deepEqual(errors,[]);
  for(const move of moves.filter(m=>m.color==='gray')){
   assert.ok(move.max>1.5,`Bot skipped its drop: ${JSON.stringify(move)}`);
   assert.ok(move.frames>=35,`Bot animation interrupted: ${JSON.stringify(move)}`);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
