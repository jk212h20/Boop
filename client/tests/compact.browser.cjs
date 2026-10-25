// Numeric backend portability against the immutable v4 release fixtures.
const {chromium,webkit,firefox}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const golden=JSON.parse(fs.readFileSync(__dirname+'/baselines/v4-golden.json','utf8'));
 const expected=golden.positions.map(({name,expected})=>({name,...expected}));
 const kind=process.env.BOOP_BROWSER||'chrome';
 const browser=await (kind==='webkit'?webkit:kind==='firefox'?firefox:chromium).launch(kind==='chrome'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage();await page.goto(process.env.BOOP_TEST_URL);
  const result=await page.evaluate(async golden=>{
   const {corpus}=await import('/tools/botRepro.ts');
   const {createBot}=await import('/src/bot/compact/CompactBot.ts');
   const samples=corpus().map(({name,state})=>{
    const bot=createBot(state.pendingGraduationPlayer??state.currentTurn,{silent:true});
    const action=state.phase==='selecting_graduation'?bot.findBestGraduation(state):bot.findBestMove(state);
    const {nodes,completedDepth,elapsedMs}=bot.getStats();return {name,action,nodes,depth:completedDepth,elapsedMs};
   });
   const {advance}=await import('/tools/botRepro.ts');
   const {createInitialGameState}=await import('/src/bot/LocalGame.ts');
   let state=createInitialGameState();const replay=[];
   for(const _ of golden.replay.actions){
    const bot=createBot(state.pendingGraduationPlayer??state.currentTurn,{silent:true});
    const action=state.phase==='selecting_graduation'?bot.findBestGraduation(state):bot.findBestMove(state);
    const {nodes,completedDepth}=bot.getStats();replay.push({action,nodes,depth:completedDepth});state=advance(state,action);
   }
   return {samples,replay,state};
  },golden);
  assert.deepEqual(result.samples.map(({elapsedMs,...stable})=>stable),expected);
  assert.deepEqual(result.replay,golden.replay.actions);assert.deepEqual(result.state,golden.replay.finalState);
  console.log(JSON.stringify({browser:kind,positions:result.samples.length,replayDecisions:result.replay.length,maxMs:Math.max(...result.samples.map(x=>x.elapsedMs))}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
