const {chromium}=require('playwright'); const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.BOOP_TEST_URL);
 await p.evaluate(async()=>{
  const {default:R}=await import('/node_modules/.vite/deps/react.js');const {default:D}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {Game}=await import('/src/components/Game.tsx');const {createInitialGameState}=await import('/src/bot/LocalGame.ts');
  const s=createInitialGameState();s.phase='selecting_graduation';s.pendingGraduationPlayer='orange';s.currentTurn='orange';
  s.board[2][1]={color:'orange',type:'kitten'};s.board[2][2]={color:'orange',type:'kitten'};s.board[2][3]={color:'orange',type:'kitten'};
  s.lastMove={row:2,col:3};s.boopedPieces=[{from:{row:1,col:1},to:{row:2,col:1},piece:{color:'orange',type:'kitten'}},{from:{row:1,col:2},to:{row:2,col:2},piece:{color:'orange',type:'kitten'}}];
  s.pendingGraduationOptions=[[{row:2,col:1}],[{row:2,col:2}],[{row:2,col:3}],[{row:2,col:1},{row:2,col:2},{row:2,col:3}]];
  window.calls=[];window.accept=false;
  function Harness(){const [state,set]=R.useState(s);window.next=()=>set({...s,board:s.board.map(r=>r.slice())});
   return R.createElement(Game,{gameState:state,playerColor:'orange',roomCode:'TEST',onPlacePiece:async()=>true,onLeave:()=>{},gameOver:null,opponentDisconnected:false,isBotGame:true,onSelectGraduation:async i=>{window.calls.push(i);await new Promise(r=>setTimeout(r,150));return window.accept;}});}
  D.createRoot(document.getElementById('root')).render(R.createElement(Harness));
 });
 await p.waitForTimeout(1500);
 assert.equal(await p.locator('.promotion-strip').count(),0,'choices must not interrupt two boops');
 await p.getByRole('complementary',{name:'Promotion choices'}).waitFor();await p.waitForTimeout(300);
 assert.equal(await p.getByText('Choose What to Graduate!',{exact:true}).count(),0);
 const pt=await p.evaluate(()=>window.__cellScreen(2,1));await p.mouse.click(pt.x,pt.y-20);
 await p.getByRole('group',{name:'Choices for this kitten'}).waitFor();
 await p.getByRole('button',{name:'This kitten',exact:true}).click();
 await p.getByText('Promotion was not accepted. Please try again.',{exact:true}).last().waitFor();
 assert.deepEqual(await p.evaluate(()=>window.calls),[0]);
 const ends=await p.evaluate(()=>[window.__cellScreen(2,1),window.__cellScreen(2,2)]);
 await p.getByRole('button',{name:'Cancel',exact:true}).click();
 await p.mouse.click((ends[0].x+ends[1].x)/2,(ends[0].y+ends[1].y)/2);
 await p.waitForTimeout(300);
 assert.deepEqual(await p.evaluate(()=>window.calls),[0,3]);
 await p.evaluate(()=>window.accept=true);
 await p.getByRole('button',{name:'Collect three',exact:false}).first().focus();
 await p.keyboard.press('Enter');await p.waitForTimeout(250);
 assert.deepEqual(await p.evaluate(()=>window.calls),[0,3,3]);
 fs.mkdirSync('/tmp/boop-promotion-qa',{recursive:true});
 for(const width of [1440,1280,1279,1024,768,601,600,390,320]){
  await p.setViewportSize({width,height:1000});await p.waitForTimeout(250);
  await p.screenshot({path:`/tmp/boop-promotion-qa/${width}.png`,fullPage:true});
  const box=await p.locator('.promotion-strip').boundingBox();assert.ok(box.width>=150);
  const canvas=await p.locator('canvas').boundingBox();
  assert.ok(box.y < canvas.y + canvas.height,'panel below board '+width);
  const cats=await p.evaluate(()=>[1,2,3].map(c=>window.__cellScreen(2,c)));
  cats.forEach(c=>assert.ok(c.x<box.x||c.x>box.x+box.width||c.y<box.y||c.y>box.y+box.height,'panel covers a choice '+width));
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
  assert.ok(await p.locator('canvas').isVisible());
 }
 assert.deepEqual(errors,[]);console.log('PASS board-first choices, ambiguous kitten, rejected submission, keyboard line selection and nine responsive widths');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
