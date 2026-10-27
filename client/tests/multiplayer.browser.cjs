// Production-build UI smoke: isolated players, real server, no mocked socket.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.BOOP_TEST_URL;
if(!url)throw Error('Set BOOP_TEST_URL to a verified production-build server');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 const errors=[];
 try{
  const ca=await browser.newContext({viewport:{width:1440,height:1100}});
  const cb=await browser.newContext({viewport:{width:1440,height:1100}});
  const a=await ca.newPage(),b=await cb.newPage();
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  await Promise.all([a.goto(url),b.goto(url)]);
  // Real one-click default; no difficulty form or name required.
  await a.getByRole('button',{name:'🤖 Play vs Bot',exact:true}).click();
  await a.getByRole('region',{name:"🤖 Boop AZ64's pieces",exact:true}).waitFor();
  assert.equal(await a.locator('select').count(),0);
  await a.waitForFunction(()=>window.__cellScreen);
  await a.waitForTimeout(1000);
  const opening=await a.evaluate(()=>window.__cellScreen(2,2));
  await a.mouse.click(opening.x,opening.y);
  await a.waitForFunction(()=>window.__catProbe().some(a=>a.cat.startsWith('gray-')),{},{timeout:15000});
  await a.getByText('Your turn!',{exact:true}).waitFor();
  await a.getByRole('button',{name:'Leave Game',exact:true}).click();
  await a.getByRole('button',{name:'🎮 Create Game',exact:true}).click();
  await a.getByPlaceholder('Enter your name').fill('Release Orange');
  await a.getByRole('button',{name:'Create Game',exact:true}).click();
  await a.locator('.room-code').waitFor();const code=(await a.locator('.room-code').innerText()).trim();
  await b.getByRole('button',{name:'🔗 Join Game',exact:true}).click();
  await b.getByPlaceholder('Enter your name').fill('Release Gray');
  await b.getByPlaceholder('BOOP-XXXX').fill(code);
  await b.getByRole('button',{name:'Join Game',exact:true}).click();
  for(const p of [a,b])await p.waitForFunction(()=>window.__cellScreen);
  async function actors(p){return p.evaluate(()=>window.__catProbe().filter(a=>a.cat!=='ghost').map(a=>a.cat).sort());}
  async function move(p,r,c){
   await p.getByText('Your turn!',{exact:true}).waitFor();
   await p.waitForTimeout(1600);
   const xy=await p.evaluate(([r,c])=>window.__cellScreen(r,c),[r,c]);await p.mouse.click(xy.x,xy.y);
  }
  await move(a,2,2);
  await b.getByText('Your turn!',{exact:true}).waitFor();
  await b.waitForFunction(()=>window.__catProbe().some(a=>a.cat==='orange-kitten-2-2'));
  await move(b,4,4);
  await a.getByText('Your turn!',{exact:true}).waitFor();
  await a.waitForFunction(()=>window.__catProbe().some(a=>a.cat==='gray-kitten-4-4'));
  await a.waitForFunction(()=>window.__catProbe().filter(a=>a.cat!=='ghost').length===2);
  await b.waitForFunction(()=>window.__catProbe().filter(a=>a.cat!=='ghost').length===2);
  assert.deepEqual(await actors(a),await actors(b));
  // Browser reload retains token, room, board and ownership.
  await b.reload();await b.waitForFunction(()=>window.__cellScreen);
  await b.waitForFunction(()=>window.__catProbe().some(a=>a.cat==='gray-kitten-4-4'));
  assert.deepEqual(await actors(a),await actors(b));
  await move(a,0,0);await b.getByText('Your turn!',{exact:true}).waitFor();
  await move(b,0,5);await a.getByText('Your turn!',{exact:true}).waitFor();
  await a.waitForFunction(()=>window.__catProbe().some(a=>a.cat==='gray-kitten-0-5'));
  await b.waitForFunction(()=>window.__catProbe().some(a=>a.cat==='gray-kitten-0-5'));
  assert.deepEqual(await actors(a),await actors(b));
  await b.getByRole('button',{name:'Leave Game',exact:true}).click();
  await a.getByText('⚠️ Your opponent has left the game',{exact:true}).waitFor();
  await a.getByRole('button',{name:'Leave Game',exact:true}).click();
  // Quick match uses a separate lobby/matching path.
  for(const [p,name]of [[a,'Quick Orange'],[b,'Quick Gray']]){
   await p.getByRole('button',{name:'🎲 Quick Match',exact:true}).click();
   await p.getByPlaceholder('Enter your name').fill(name);
   await p.getByRole('button',{name:'Enter Lobby',exact:false}).click();
  }
  await a.getByRole('button',{name:/Play/}).last().click();
  for(const p of [a,b]){
   await p.locator('canvas').waitFor();
   await p.getByRole('region',{name:"Quick Orange's pieces",exact:true}).waitFor();
   await p.getByRole('region',{name:"Quick Gray's pieces",exact:true}).waitFor();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({oneClickBot:'Boop AZ64',room:code,createJoin:true,twoWayMoves:true,reloadRejoin:true,leaveNotice:true,quickMatch:true,pageErrors:errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
