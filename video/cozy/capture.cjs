const {chromium}=require('../../client/node_modules/playwright');
const fs=require('fs'),path=require('path');
const root=__dirname, out=path.join(root,'outputs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Shader'))errors.push(m.text())});
 await page.goto('http://127.0.0.1:3012/?rulesfilm');
 await page.waitForFunction(()=>window.filmFrame);await page.waitForTimeout(6000);
 // Preload both model types before any new staged actors are captured.
 await page.evaluate(()=>window.filmFrame('welcome',0));await page.waitForTimeout(1000);
 await page.evaluate(()=>window.filmFrame('setup',0));await page.waitForTimeout(1000);
 const timeline=JSON.parse(fs.readFileSync(path.join(out,'timeline.json')));
 for(const scene of timeline){
   const dir=path.join(out,scene.id);fs.mkdirSync(dir,{recursive:true});
   for(let f=0;f<scene.frames;f++){
     const dest=path.join(dir,String(f).padStart(5,'0')+'.png');
     if(fs.existsSync(dest))continue;
     const bytes=await page.evaluate(async({id,t})=>window.filmFrame(id,t),{id:scene.id,t:f/(scene.frames-1)});
     fs.writeFileSync(dest,Buffer.from(bytes,'base64'));
     if(f%60===0)console.log(scene.id+' '+f+'/'+scene.frames);
   }
 }
 if(errors.length)throw Error(errors.join('\n'));await browser.close();console.log('CAPTURE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
