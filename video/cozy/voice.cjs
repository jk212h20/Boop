// Public Breeze Studio UI workflow. Uses its progress, input player and persistent history.
const {chromium}=require('../../client/node_modules/playwright');
const fs=require('fs'),path=require('path');
const root=__dirname,out=path.join(root,'outputs'), script=require('./script.json');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:7862/');
 await page.waitForFunction(()=>document.querySelector('#statusText').textContent==='Model ready');
 const limit=Number(process.env.LIMIT||script.scenes.length);
 for(const [i,s] of script.scenes.slice(0,limit).entries()){
  const dest=path.join(out,s.id+'.wav');if(fs.existsSync(dest)){console.log('exists '+s.id);continue;}
  console.log('Submitting '+s.id+' '+s.text.length+' chars');
  if(true){
   if(!fs.existsSync(path.join(out,'../../outputs/intro-asr.json')))throw Error('Verify anchor transcript before cloning');
   await page.click('[data-mode="clone"]');
   await page.route('**/v1/audio/transcribe',r=>r.fulfill({json:{text:require('../script.json').scenes[0].text}}));
   await page.setInputFiles('#refAudio',path.join(out,'../../outputs/intro.wav'));
   await page.waitForFunction(()=>document.querySelector('#refText').value.length>10);
   await page.waitForFunction(()=>document.querySelector('#refAudioPlayer').readyState>=2);
   await page.fill('#instruction','Preserve the reference speaker’s vocal identity. Warm, clear, friendly conversational English. Brisk but clear teaching pace, gentle emphasis on rule contrasts. No music.');
  }else await page.fill('#instruction',script.voice);
  await page.fill('#text',s.text);
  await page.locator('details.advanced').evaluate(e=>e.open=true);
  await page.fill('#seed','42');
  await page.locator('#cfgScale').evaluate(e=>{e.value='4';e.dispatchEvent(new Event('input'))});
  await page.click('#generateButton');
  await page.waitForFunction(()=>!document.querySelector('#generateButton').disabled,{},{timeout:600000});
  if(!(await page.locator('#notice').textContent()).includes('Generation complete'))throw Error(await page.locator('#notice').textContent());
  const data=await page.evaluate(async()=>{const all=await getAll();const item=all.sort((a,b)=>b.created.localeCompare(a.created))[0];return {bytes:Array.from(new Uint8Array(await item.audio.arrayBuffer())),id:item.id,text:item.text};});
  if(data.text!==s.text)throw Error('Wrong result');fs.writeFileSync(dest,Buffer.from(data.bytes));
  await page.waitForFunction(()=>document.querySelector('#history audio')?.readyState>=1);
  await page.screenshot({path:path.join(out,'breeze-'+s.id+'.png')});
  console.log('Saved '+s.id+' '+data.bytes.length+' bytes');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
