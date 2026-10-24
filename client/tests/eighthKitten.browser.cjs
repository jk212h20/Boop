const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-webgl']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BOOP_TEST_URL);
  await page.evaluate(async()=>{
   const {default:R}=await import('/node_modules/.vite/deps/react.js');
   const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {Game}=await import('/src/components/Game.tsx');
   const {createInitialGameState,executeMove,resolveGraduationChoice}=await import('/src/bot/LocalGame.ts');
   const {BotWorkerClient}=await import('/src/bot/BotWorkerClient.ts');
   const s=createInitialGameState();
   // Eight dispersed kittens, no line and no boop from the eighth square.
   for(const [r,c] of [[0,0],[0,2],[0,4],[2,0],[2,2],[2,4],[4,0]])s.board[r][c]={color:'orange',type:'kitten'};
   s.players.orange.kittensInPool=1;
   window.botCalls=0;window.choices=[];
   const bot=new BotWorkerClient('gray',{timeBudgetMs:1});
   function Harness(){
    const [state,set]=R.useState(s);window.state=state;
    const reply=async(next)=>{
     if(next.phase==='playing'&&next.currentTurn==='gray'){
      window.botCalls++;const result=await bot.play(next);set(result);
     }
    };
    return R.createElement(Game,{gameState:state,playerColor:'orange',roomCode:'TEST',gameOver:null,isBotGame:true,onLeave:()=>{},
     onPlacePiece:async(r,c,t)=>{const result=executeMove(state,r,c,t,'orange');if(result.valid){set(result.newState);void reply(result.newState);}return result.valid;},
     onSelectGraduation:async(i)=>{window.choices.push(i);const result=resolveGraduationChoice(state,i);if(result.valid){set(result.newState);/* check graduation before replying */}return result.valid;}
    });
   }
   D.createRoot(document.getElementById('root')).render(R.createElement(Harness));
  });
  await page.waitForFunction(()=>window.__cellScreen);
  await page.waitForTimeout(1500);
  const point=await page.evaluate(()=>window.__cellScreen(4,4));
  await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>window.state.players.orange.kittensInPool===0);
  assert.equal(await page.evaluate(()=>window.state.phase),'selecting_graduation');
  // No extra board click. The offer must appear on its own after the drop.
  await page.getByRole('complementary',{name:'Promotion choices'}).waitFor({timeout:6000});
  assert.equal(await page.getByRole('button',{name:/^Kitten /}).count(),8);
  assert.equal(await page.evaluate(()=>window.botCalls),0);
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.botCalls),0);
  await page.getByRole('button',{name:'Kitten E5',exact:true}).click();
  await page.waitForFunction(()=>window.choices.length===1);
  await page.waitForFunction(()=>!window.__catProbe().some(a=>a.cat==='orange-kitten-4-4'),{},{timeout:8000});
  const result=await page.evaluate(()=>({phase:window.state.phase,turn:window.state.currentTurn,cats:window.state.players.orange.catsInPool,kittens:window.state.players.orange.kittensInPool,actors:window.__catProbe()}));
  assert.equal(result.phase,'playing');assert.equal(result.turn,'gray');assert.equal(result.cats,1);assert.equal(result.kittens,0);
  assert.ok(!result.actors.some(a=>a.cat==='orange-kitten-4-4'));
  assert.equal(await page.locator('.promotion-strip').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS eighth kitten automatically offers all eight choices, no bot turn before choice, promotion yields one usable cat.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
