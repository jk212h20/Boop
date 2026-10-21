const {chromium}=require('playwright');const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const b=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-webgl']});try{
 await fs.mkdir('/tmp/boop-animation-qa',{recursive:true});
 for(const width of [1440,390]){
  const page=await b.newPage({viewport:{width,height:1100}});
  await page.goto(process.env.BOOP_TEST_URL+'?preview3d&return');
  const flight=page.locator('[data-inventory-flight="orange-cat"]');await flight.waitFor({timeout:20000});
  const result=await flight.evaluate(e=>{const a=e.getAnimations()[0];a.pause();a.currentTime=540;const r=e.getBoundingClientRect(),t=document.querySelector('[data-pool-target="orange-cat"] .animated-piece-icon').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,tx:t.x,ty:t.y,tw:t.width,th:t.height}});
  for(const [v,t] of [['x','tx'],['y','ty'],['w','tw'],['h','th']])assert.ok(Math.abs(result[v]-result[t])<1,JSON.stringify(result));
  await page.screenshot({path:`/tmp/boop-animation-qa/return-${width}.png`,fullPage:true});
  console.log('PASS exact portrait handoff at',width,result);await page.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
