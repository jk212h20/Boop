const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url=process.env.BOOP_TEST_URL;if(!url)throw Error('BOOP_TEST_URL required');
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
 fs.mkdirSync('/tmp/boop-az64-visual',{recursive:true});
 for(const width of [390,767,768,895,896,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});await page.goto(url);
  const start=Date.now();await page.getByRole('button',{name:'🤖 Play vs Bot',exact:true}).click();
  await page.getByRole('region',{name:"🤖 Boop AZ64's pieces",exact:true}).waitFor();
  await page.waitForFunction(()=>window.__cellScreen);await page.waitForTimeout(1000);
  const xy=await page.evaluate(()=>window.__cellScreen(2,2));await page.mouse.click(xy.x,xy.y);
  await page.waitForFunction(()=>window.__catProbe().some(a=>a.cat.startsWith('gray-')),{},{timeout:15000});
  const metrics=await page.evaluate(()=>{
   const regions=[...document.querySelectorAll('[aria-label$="pieces"]')].map(e=>{const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height,scroll:e.scrollWidth,client:e.clientWidth};});
   const canvas=document.querySelector('canvas').getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth,regions,canvas:{width:canvas.width,height:canvas.height}};
  });assert.equal(metrics.overflow,false);assert(metrics.canvas.width>280);assert.equal(metrics.regions.length,2);
  for(const r of metrics.regions){assert(r.width>100);assert(r.scroll<=r.client+1);assert(r.x>=-1 && r.x+r.width<=width+1);}
  await page.screenshot({path:`/tmp/boop-az64-visual/${width}.png`,fullPage:true});
  console.log(JSON.stringify({width,elapsedMs:Date.now()-start,...metrics}));
  await page.getByRole('button',{name:'Leave Game',exact:true}).click();await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
