const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const url=process.env.BOOP_TEST_URL;assert.ok(url);
 const out='/tmp/boop-animation-qa';await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-webgl']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?preview3d&win');await page.locator('.game-win-status').waitFor();await page.waitForTimeout(2500);
  const poses=[];
  for(let i=0;i<6;i++){poses.push(await page.evaluate(()=>window.__catProbe().filter(c=>c.cat.startsWith('orange-cat'))));await page.screenshot({path:`${out}/dance-${i}.png`});await page.waitForTimeout(170)}
  assert.equal(poses[0].length,3);assert.ok(poses.every(p=>p.every(c=>c.visible)));
  assert.ok(Math.max(...poses.map(p=>p[0].y))-Math.min(...poses.map(p=>p[0].y))>.035,'Winner root dances');
  assert.equal(await page.locator('.game-win-status').evaluate(e=>getComputedStyle(e).position),'fixed');
  for(const width of [1440,1280,1279,1024,768,600,599,390,320]){
   await page.setViewportSize({width,height:1100});await page.waitForTimeout(400);
   const geometry=await page.locator('.game-win-status').evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
   assert.ok(geometry.left>=0&&geometry.right<=width,'Win label fits viewport');assert.ok(geometry.bottom<65);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   await page.screenshot({path:`${out}/win-${width}.png`,fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const a=await page.evaluate(()=>window.__catProbe());await page.waitForTimeout(400);const b=await page.evaluate(()=>window.__catProbe());assert.deepEqual(a.map(c=>[c.x,c.y,c.z,c.ry]),b.map(c=>[c.x,c.y,c.z,c.ry]));
  assert.deepEqual(errors,[]);console.log('PASS: three visible dancing winners, reduced motion, fixed compact status, responsive full-page layouts.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
