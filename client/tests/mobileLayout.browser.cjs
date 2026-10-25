const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
 fs.mkdirSync('/tmp/boop-mobile-qa',{recursive:true});
 for(const width of [320,390,600,601,768,896,1279,1280,1440]){
  const page=await browser.newPage({viewport:{width,height:width<601?740:1100},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BOOP_TEST_URL);
  await page.getByRole('button',{name:'🤖 Play vs Bot',exact:true}).click();
  await page.waitForFunction(()=>window.__boardView);await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'Top down',exact:true}).click();
  for(let i=0;i<12;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.waitForTimeout(600);
  const result=await page.evaluate(()=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
   const pools=[...document.querySelectorAll('[data-pool-target]')].map(e=>({...box(e),label:e.querySelector('.pool-piece-head').getBoundingClientRect().width,icon:box(e.querySelector('.animated-piece-icon'))}));
   const canvas=box(document.querySelector('canvas'));
   const corners=window.__project([[-3.51,.49,-3.51],[3.51,.49,-3.51],[-3.51,.49,3.51],[3.51,.49,3.51]]);
   return {pools,canvas,corners,view:window.__boardView(),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(result.overflow,false);assert.equal(result.pools.length,4);
  for(const b of result.pools){assert.ok(b.w>=56&&b.h>=44);assert.ok(b.label<=b.w-4);if(width<=600)assert.ok(b.bottom<740&&b.x>=0&&b.right<=width);}
  assert.ok(result.view.polar<.0001,'true overhead available');
  for(const c of result.corners){assert.ok(c.x>=result.canvas.x-1&&c.x<=result.canvas.right+1&&c.y>=result.canvas.y-1&&c.y<=result.canvas.bottom+1,'quilt clipped');}
  const span=Math.max(...result.corners.map(c=>c.x))-Math.min(...result.corners.map(c=>c.x));
  assert.ok(span/Math.min(result.canvas.w,result.canvas.h)>.94,'quilt should fill screen at maximum zoom');
  await page.screenshot({path:`/tmp/boop-mobile-qa/top-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Angled',exact:true}).click();await page.waitForTimeout(500);
  // Actual wheel input uses OrbitControls too; it cannot bypass the fit limit.
  await page.mouse.move(result.canvas.x+result.canvas.w/2,result.canvas.y+100);
  await page.mouse.wheel(0,-5000);await page.waitForTimeout(500);
  const fitted=await page.evaluate(()=>({corners:window.__project([[-3.51,.49,-3.51],[3.51,.49,-3.51],[-3.51,.49,3.51],[3.51,.49,3.51]]),view:window.__boardView()}));
  for(const c of fitted.corners)assert.ok(c.x>=result.canvas.x-1&&c.x<=result.canvas.right+1&&c.y>=result.canvas.y-1&&c.y<=result.canvas.bottom+1,'wheel zoom clips quilt');
  assert.ok(fitted.view.polar>.1,'angled view still available');
  await page.screenshot({path:`/tmp/boop-mobile-qa/angled-${width}.png`,fullPage:true});
  if(width===390){
   await page.getByRole('button',{name:'Top down',exact:true}).click();
   const canvas=page.locator('canvas');const bb=await canvas.boundingBox();
   // Finger rotation can reach the same overhead limit without a button.
   const cdp=await page.context().newCDPSession(page);
   const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
   await touch('touchStart',bb.x+bb.width/2,bb.y+bb.height*.6);
   for(let i=1;i<=8;i++)await touch('touchMove',bb.x+bb.width/2,bb.y+bb.height*.6-i*8);
   await touch('touchEnd');await page.waitForTimeout(500);
   const dragged=await page.evaluate(()=>window.__boardView());assert.ok(dragged.polar>.01,'finger drag rotates board');
   await page.getByRole('button',{name:'Top down',exact:true}).click();
   const xy=await page.evaluate(()=>window.__cellScreen(2,2));await page.touchscreen.tap(xy.x,xy.y);
   await page.waitForFunction(()=>window.__catProbe().some(a=>a.cat==='orange-kitten-2-2'));
   await page.waitForFunction(()=>window.__catProbe().some(a=>a.cat.startsWith('gray-')));
   assert.ok((await page.evaluate(()=>window.__boardView())).polar<.0001,'bot reply preserves overhead view');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,...result}));await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
