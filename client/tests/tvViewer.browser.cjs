const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('fs');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});const p=await b.newPage();const out='/tmp/boop-tv-qa';fs.mkdirSync(out,{recursive:true});
await p.goto((process.env.BOOP_TEST_URL||'http://127.0.0.1:3012')+'/?preview3d');await p.waitForTimeout(2500);
// Open the actual physical TV through its projected interaction probe.
for(const width of [1440,1280,1279,1024,768,601,600,390,320]){
 await p.setViewportSize({width,height:1100});
 // Open through the actual canvas's registered TV picking surface.
 await p.waitForFunction(()=>window.__roomProbe);
 const point=await p.evaluate(()=>window.__roomProbe().find(p=>p.prop==='tv'));assert.ok(point?.visible);
 await p.mouse.click(point.x,point.y);await p.locator('.rules-video').waitFor();
 await p.waitForFunction(()=>document.querySelector("video")?.readyState>=2);
 assert.ok(await p.locator("video").evaluate(v=>v.videoWidth===1920&&v.duration>=120&&v.duration<=180));
 const boxes=await p.evaluate(()=>['.rules-tv-cabinet','.rules-video','.rules-video-frame','.rules-tv-antenna'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return {q,x:r.x,y:r.y,right:r.right,bottom:r.bottom}}));
 boxes.forEach(r=>{assert.ok(r.x>=-1&&r.right<=width+1,r.q+' horizontal clipping');assert.ok(r.y>=-1&&r.bottom<=1101,r.q+' vertical clipping');});
 await p.screenshot({path:out+'/'+width+'.png',fullPage:true});await p.keyboard.press('Escape');
}
console.log("PASS TV cabinet, antennae and screen bounds at all nine widths");await b.close();})().catch(e=>{console.error(e);process.exit(1)});
