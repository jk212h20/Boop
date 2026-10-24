const {chromium,webkit,firefox}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
const golden=JSON.parse(fs.readFileSync(__dirname+'/baselines/v4-golden.json'));
(async()=>{
 const kind=process.env.BOOP_BROWSER||'chrome';
 const engine=kind==='webkit'?webkit:kind==='firefox'?firefox:chromium;
 const browser=await engine.launch(kind==='chrome'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage();await page.goto(process.env.BOOP_TEST_URL);
  const cdp=kind==='chrome'?await page.context().newCDPSession(page):null;
  const runs=[];
  for(const rate of cdp?[1,4]:[1]){
   if(cdp)await cdp.send('Emulation.setCPUThrottlingRate',{rate});
   const result=await page.evaluate(async golden=>{
    const {decision,advance}=await import('/tools/botRepro.ts');
    const {createInitialGameState}=await import('/src/bot/LocalGame.ts');
    const samples=[];const timings=[];
    for(const fixture of golden.positions){const {elapsedMs,...stable}=decision(fixture.state);samples.push(stable);timings.push(elapsedMs);}
    let state=createInitialGameState();const replay=[];
    for(const expected of golden.replay.actions){const {elapsedMs,...stable}=decision(state);replay.push(stable);state=advance(state,stable.action);timings.push(elapsedMs);}
    const {BotWorkerClient}=await import('/src/bot/BotWorkerClient.ts');
    const {versionConfig}=await import('/src/bot/version.ts');
    const workerTimes=[];
    for(const fixture of golden.positions){
     const color=fixture.state.pendingGraduationPlayer??fixture.state.currentTurn;
     let expected=fixture.state;
     const settle=()=>{while(expected.phase==='selecting_graduation'&&expected.pendingGraduationPlayer===color)expected=advance(expected,decision(expected).action);};
     settle();if(expected.phase==='playing'&&expected.currentTurn===color){expected=advance(expected,decision(expected).action);settle();}
     const worker=new BotWorkerClient(color,versionConfig());
     const start=performance.now();const actual=await worker.play(fixture.state);workerTimes.push(performance.now()-start);worker.dispose();
     if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('worker mismatch '+fixture.name);
    }
    return {samples,replay,state,maxMs:Math.max(...timings),maxWorkerReplyMs:Math.max(...workerTimes)};
   },golden);
   assert.deepEqual(result.samples,golden.positions.map(p=>p.expected));
   assert.deepEqual(result.replay,golden.replay.actions);assert.deepEqual(result.state,golden.replay.finalState);
   runs.push({browser:kind,rate,positions:result.samples.length,replayDecisions:result.replay.length,maxMs:result.maxMs,maxWorkerReplyMs:result.maxWorkerReplyMs});
  }
  console.log(JSON.stringify(runs));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
