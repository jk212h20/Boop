const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome'});try{
 const p=await b.newPage();await p.goto(process.env.BOOP_TEST_URL);
 await p.evaluate(async()=>{
  const {default:R}=await import('/node_modules/.vite/deps/react.js');const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {useBotGame}=await import('/src/hooks/useBotGame.ts');const {Game}=await import('/src/components/Game.tsx');
  window.RealWorker=Worker;window.Worker=class{constructor(){throw Error('blocked');}};
  function Harness(){const bot=useBotGame();window.bot=bot;return bot.gameState?R.createElement(Game,{key:bot.gameId,gameState:bot.gameState,playerColor:'orange',roomCode:'TEST',onPlacePiece:bot.placePiece,onLeave:()=>{},gameOver:bot.gameOver,isBotGame:true,botThinking:bot.botThinking,botError:bot.botError,onRetryBot:bot.retryBot}):null;}
  D.createRoot(document.getElementById('root')).render(R.createElement(Harness));
 });
 await p.waitForFunction(()=>window.bot);await p.evaluate(()=>window.bot.startBotGame());
 await p.waitForFunction(()=>window.bot.gameState);await p.evaluate(()=>window.bot.placePiece(2,2,'kitten'));
 await p.getByRole('button',{name:'Retry bot move',exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.bot.gameState.currentTurn),'gray');
 assert.equal(await p.evaluate(()=>window.bot.gameState.board.flat().filter(Boolean).length),1);
 assert.equal(await p.evaluate(()=>window.bot.botThinking),false);
 await p.evaluate(()=>window.Worker=window.RealWorker);await p.getByRole('button',{name:'Retry bot move',exact:true}).click();
 await p.waitForFunction(()=>window.bot.gameState.currentTurn==='orange');
 assert.equal(await p.evaluate(()=>window.bot.gameState.board.flat().filter(Boolean).length),2);
 assert.equal(await p.getByRole('button',{name:'Retry bot move',exact:true}).count(),0);
 console.log('PASS worker failure keeps board unchanged, shows concrete retry, and retry plays the full versioned bot.');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
