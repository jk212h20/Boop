const {chromium}=require('../client/node_modules/playwright');
const path=require('path'),fs=require('fs');
(async()=>{
 const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1100}});
 await p.goto('file://'+path.join(__dirname,'player.html'));
 await p.waitForFunction(()=>document.querySelector('video').readyState>=1);
 const info=await p.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
 if(info.width!==1920||info.height!==1080||info.duration<250||info.duration>260)throw Error(JSON.stringify(info));
 if(await p.locator('#chapters button').count()!==17)throw Error('Missing chapters');
 await p.locator('#chapters button').nth(14).click();
 await p.waitForFunction(()=>document.querySelector('video').currentTime>213);
 await p.locator('video').evaluate(v=>{v.pause();v.currentTime+=5});
 await p.waitForTimeout(300);
 await p.screenshot({path:path.join(__dirname,'outputs/player-reviewed.png')});
 console.log('Local player decoded 1080p video; all 17 chapter controls present; eight-cat chapter seek works. '+JSON.stringify(info));
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
