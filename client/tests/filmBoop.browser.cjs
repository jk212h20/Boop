const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});const p=await b.newPage({viewport:{width:1280,height:900}});await p.goto('http://127.0.0.1:3012/?rulesfilm');await p.waitForFunction(()=>window.filmFrame);await p.waitForTimeout(1500);
const samples=[];for(const t of [.21,.24,.27,.30,.34]){await p.evaluate(t=>window.filmFrame('boop',t),t);samples.push(await p.evaluate(()=>window.filmBoopProbe()));}
assert.ok(samples[0].length===9);assert.ok(samples.some(s=>s.filter(p=>p.y>.7).length>=8),'Neighbors perform actual airborne arc');assert.ok(samples.at(-1).every(p=>Math.abs(p.y-.49)<.02),'All actors land on quilt');
await p.evaluate(()=>window.filmFrame('setup',.5));await p.screenshot({path:'/tmp/boop-scattered-floor-browser.png'});await b.close();console.log('PASS shared boop: nine actors, airborne neighbors, grounded ending');})().catch(e=>{console.error(e);process.exit(1)});
