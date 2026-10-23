const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try {
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.BOOP_TEST_URL);
 await p.evaluate(async()=>{
  const {default:R}=await import('/node_modules/.vite/deps/react.js');
  const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {Game}=await import('/src/components/Game.tsx');
  const {useBotGame}=await import('/src/hooks/useBotGame.ts');
  const {createInitialGameState,executeMove}=await import('/src/bot/LocalGame.ts');
  function H(){const bot=useBotGame();const [fixture,set]=R.useState(null);window.bot=bot;
   window.stockFixture=(type='kitten')=>{const s=createInitialGameState();s.board[0][0]={color:'orange',type};s.players.orange.kittensInPool=0;s.players.orange.catsInPool=0;s.currentTurn='gray';set(s);};
   window.boopOff=()=>set(s=>{s.players.gray.catsInPool=1;return executeMove(s,0,1,'cat','gray').newState;});
   const state=fixture||bot.gameState;
   return state?R.createElement(Game,{gameState:state,playerColor:'orange',roomCode:'TEST',onPlacePiece:bot.placePiece,onLeave:()=>{},gameOver:null,opponentDisconnected:false,isBotGame:true}):null;}
  D.createRoot(document.getElementById('root')).render(R.createElement(H));
 });
 await p.waitForFunction(()=>window.bot);await p.evaluate(()=>window.bot.startBotGame());await p.waitForTimeout(1000);
 await p.evaluate(()=>{window.trace=[];function tick(){const s=window.bot.gameState;const m=s.lastMove;const actor=m&&window.__catProbe?.().find(c=>c.cat===`gray-kitten-${m.row}-${m.col}`);if(s.currentTurn==='orange'&&actor)window.trace.push(actor.y);window.frame=requestAnimationFrame(tick);}tick();void window.bot.placePiece(2,2,'kitten');});
 await p.waitForTimeout(2400);
 const ys=await p.evaluate(()=>{cancelAnimationFrame(window.frame);return window.trace;});
 assert.ok(ys.some(y=>y>2),'bot placement must start above the bed');
 assert.ok(ys.some(y=>y>.8&&y<2),'bot placement must visibly fall');
 assert.ok(Math.abs(ys.at(-1)-.49)<.02,'bot placement must settle');
 for(const type of ['kitten','cat']) {
 await p.evaluate(type=>window.stockFixture(type),type);await p.waitForTimeout(900);
 assert.equal(await p.locator(`[data-pool-target="orange-${type}"] .pool-piece-count`).textContent(),'0');
 await p.evaluate(()=>window.boopOff());await p.waitForTimeout(1500);
 assert.equal(await p.locator(`[data-pool-target="orange-${type}"] .pool-piece-count`).textContent(),'1','returned stock must not wait for inventory arrival');
 const walkers=await p.evaluate(type=>window.__catProbe().filter(c=>c.cat.startsWith(`orange-${type}-`)&&c.cat!==`orange-${type}-0-0`),type);
 assert.ok(walkers.length,'return trip should still be running when stock is available');
 }
 assert.deepEqual(errors,[]);console.log('PASS real worker bot drops visibly; returned stock available during cosmetic walk');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
