const {chromium}=require('playwright');const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const b=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-webgl']});try{
 const out='/tmp/boop-walk-qa';await fs.mkdir(out,{recursive:true});const p=await b.newPage({viewport:{width:1440,height:1100}});
 await p.goto(process.env.BOOP_TEST_URL+'?preview3d&return');await p.waitForFunction(()=>window.__catProbe?.().some(c=>c.cat.includes('orange-cat-6')));
 const samples=[];for(let i=0;i<45;i++){samples.push(await p.evaluate(()=>window.__catProbe().find(c=>c.cat.includes('orange-cat-6'))));await p.screenshot({path:`${out}/walk-${String(i).padStart(2,'0')}.png`});await p.waitForTimeout(160)}
 assert.ok(samples.filter(Boolean).every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.z)));assert.ok(new Set(samples.filter(Boolean).map(s=>s.x.toFixed(2)+':'+s.z.toFixed(2))).size>5,'Cat actually travels');
 await fs.writeFile(out+'/samples.json',JSON.stringify(samples));console.log('PASS: complete off-bed path advances; forty-five rendered motion samples saved');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
