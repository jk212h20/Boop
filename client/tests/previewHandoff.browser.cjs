const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-webgl']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1100}});const errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  if(process.env.BOOP_UNGUARDED) await p.route('**/src/components/FloatingBoard3D.tsx*',async route=>{
   const response=await route.fetch();const body=(await response.text()).replace('events.update?.()', 'void 0');
   await route.fulfill({response,body});
  });
  await p.goto(process.env.BOOP_TEST_URL);
  await p.evaluate(async()=>{
   const {default:R}=await import('/node_modules/.vite/deps/react.js');
   const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {Game}=await import('/src/components/Game.tsx');
   const {useBotGame}=await import('/src/hooks/useBotGame.ts');
   function Harness(){const bot=useBotGame();window.bot=bot;return bot.gameState?R.createElement(Game,{key:bot.gameId,gameState:bot.gameState,playerColor:'orange',roomCode:'TEST',onPlacePiece:bot.placePiece,onSelectGraduation:bot.selectGraduation,onLeave:()=>{},gameOver:bot.gameOver,botThinking:bot.botThinking,isBotGame:true}):null;}
   D.createRoot(document.getElementById('root')).render(R.createElement(Harness));
  });
  await p.waitForFunction(()=>window.bot);
  await p.evaluate(()=>window.bot.startBotGame('Preview',{timeBudgetMs:1}));
  await p.waitForFunction(()=>window.__cellScreen);
  await p.waitForTimeout(1400);
  const point=await p.evaluate(()=>window.__cellScreen(2,2));
  await p.mouse.click(point.x,point.y);
  // Stay on the just-occupied square while the bot replies. The cat under
  // the pointer moves away, exposing the quilt without any mousemove.
  await p.waitForFunction(()=>!window.bot.botThinking&&window.bot.gameState.currentTurn==='orange');
  const target=await p.evaluate(()=>window.__cellScreen(4,4));
  await p.mouse.move(target.x,target.y);
  // A pointer cancellation during the locked move clears R3F hover, while
  // the physical mouse stays over the same cell. No subsequent mousemove.
  await p.evaluate(()=>document.querySelector('canvas').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
  await p.getByText('Finishing the move animation…',{exact:true}).waitFor();
  await p.waitForTimeout(1400);
  await p.locator('.kitten-preview-label').waitFor({timeout:2500});
  assert.deepEqual(errors,[]);
  console.log('PASS stationary pointer restores cat preview after bot animation.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
