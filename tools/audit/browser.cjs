// Standalone browser audit. Set PLAYWRIGHT_MODULE to a documented Playwright
// installation, and BOOP_AUDIT_URL to a verified Boop Vite listener.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.BOOP_AUDIT_URL;
if (!url) throw Error('BOOP_AUDIT_URL is required');
const mockSocket = `
const handlers = new Map();
const socket = {connected:true, on(name,fn){handlers.set(name,fn);return this}, disconnect(){}, emit(name,...args){
 window.__requests.push({name,args}); const cb=args.at(-1);
 if(typeof cb === 'function' && window.__response) cb(window.__response(name,args[0]));
}};
window.__requests=[]; window.__server=(name,data)=>handlers.get(name)?.(data);
export function io(){setTimeout(()=>handlers.get('connect')?.(),20);return socket}
export class Socket{};
`;
const harness = `
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
const {useState}=React;
const {createRoot}=ReactDOM;
import {useSocket} from '/src/hooks/useSocket.ts';
import {useBotGame} from '/src/hooks/useBotGame.ts';
import {useGameHistory} from '/src/hooks/useGameHistory.ts';
import {createInitialGameState,executeMove} from '/src/bot/LocalGame.ts';
import {Game} from '/src/components/Game.tsx';
import {BotAI} from '/src/bot/BotAI.ts';
window.__initial=createInitialGameState;
window.__execute=executeMove;
window.__scriptBot=(moves)=>{BotAI.prototype.findBestMove=(state)=>{
 if(window.__fixtureBot){window.__fixtureBot=false;const s=createInitialGameState();
 for(const [r,c] of [[0,0],[0,1],[0,2],[5,0],[5,1],[5,2]]) s.board[r][c]={color:'gray',type:'kitten'};
 s.currentTurn='gray';s.players.gray.kittensInPool=2;Object.assign(state,s)}
 return moves.shift()||null;
}};
function App(){
 const socket=useSocket(); const bot=useBotGame();
 const [state,setState]=useState(createInitialGameState());
 const history=useGameHistory(state.board);
 const [showGame,setShowGame]=useState(false);
 window.__audit={socket,bot,history,state,setState,setShowGame};
 return showGame ? <Game gameState={state} playerColor="orange" roomCode="test" onPlacePiece={async()=>true} onLeave={()=>{}} gameOver={null} opponentDisconnected={false}/> : <div>harness</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
async function main(){
 const browser=await chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext(); const page=await context.newPage(); const errors=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
  await page.route('**/node_modules/.vite/deps/socket__io-client.js*',r=>r.fulfill({contentType:'application/javascript',body:mockSocket}));
  const boardStub = `import React from '/node_modules/.vite/deps/react.js'; export function FloatingBoard3D(props){window.__boardProps=props;return React.createElement('div',{'data-testid':'board'},'Board')}`;
  await page.route('**/src/components/FloatingBoard3D.tsx',r=>r.fulfill({contentType:'application/javascript',body:boardStub}));
  await page.route('**/audit-harness',r=>r.fulfill({contentType:'text/html',body:'<html><head><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/__audit.tsx"></script></body></html>'}));
  // Ask Vite's existing transformer to compile the test-only JSX; the harness
  // module itself is served via an intercepted module request.
  const esbuild=require('../../client/node_modules/esbuild');
  const compiled=esbuild.transformSync(harness,{loader:'tsx',format:'esm'}).code;
  await page.route('**/__audit.tsx',r=>r.fulfill({contentType:'application/javascript',body:compiled}));
  await page.goto(url+'/audit-harness'); await page.waitForFunction(()=>window.__audit?.socket.connected,null,{timeout:15000});
  await page.evaluate(()=>{
   const state=window.__initial();
   window.__response=(name)=>({success:true,roomCode:'BOOP-TEST',roomId:'test',playerColor:'orange',gameState:state});
  });
  await page.evaluate(()=>window.__audit.socket.createRoom('Tester'));
  const ignored=await page.evaluate(()=>{window.__server('az_error',{error:'AZ service is unavailable'});return window.__audit.socket.error});
  assert.equal(ignored,null);console.log('CONFIRMED A01 AZ service failure event has no client handler or visible error');
  // Saving only the initial join timestamp expires a still-running game.
  const expired=await page.evaluate(()=>{
   const active=JSON.parse(localStorage.getItem('boop_active_game'));active.savedAt=Date.now()-301000;
   localStorage.setItem('boop_active_game',JSON.stringify(active));
   return window.__audit.socket.checkForActiveGame();
  });
  assert.equal(expired,null); console.log('CONFIRMED C01 active game expires five minutes after JOIN, not disconnect');
  // Build history entry, then supply a new board. Hook overwrites initial.
  const start=await page.evaluate(async()=>{
   const a=window.__audit;const before=window.__initial().board;const after=before.map(r=>r.slice());after[2][2]={color:'orange',type:'kitten'};
   a.history.recordMove(before,after,'orange',{row:2,col:2,pieceType:'kitten'},[],[],{orange:{kittensInPool:8,catsInPool:0},gray:{kittensInPool:8,catsInPool:0}},{orange:{kittensInPool:7,catsInPool:0},gray:{kittensInPool:8,catsInPool:0}});
   a.setState({...a.state,board:after});await new Promise(r=>setTimeout(r,50));window.__audit.history.goToStart();
   await new Promise(r=>setTimeout(r,50));return window.__audit.history.viewingBoard[2][2];
  });
  // Repaired: the opening position is kept once a move is recorded, so "go to
  // start" shows the empty opening board instead of the live one.
  assert.equal(start,null);console.log('CONFIRMED H01 go to start shows the initial board');
  // A fast finishing opponent queues behind our placement, but game_over
  // timer ignores that queue and applies the final state after only 500ms.
  const early=await page.evaluate(async()=>{
   const one=window.__initial();one.lastMove={row:0,col:0};one.board[0][0]={color:'orange',type:'kitten'};
   const final=window.__initial();final.phase='finished';final.winner='gray';final.lastMove={row:5,col:5};
   window.__server('game_update',{gameState:one,boopedPieces:[],graduatedPieces:[]});
   window.__server('game_update',{gameState:final,boopedPieces:[{from:{row:1,col:1},to:{row:0,col:0},piece:{color:'gray',type:'cat'}}],graduatedPieces:[]});
   window.__server('game_over',{winner:'gray',winCondition:'three_cats_in_row',gameState:final});
   await new Promise(r=>setTimeout(r,650));return Boolean(window.__audit.socket.gameOver);
  });
  // Repaired: game_over waits behind the queued animation window, so it is not
  // applied 650 ms after a move that is still animating.
  assert.equal(early,false);console.log('CONFIRMED C02 game_over waits for the queued animation window');
  // Clear leftover event; then leave with an update still queued.
  await page.waitForTimeout(1400);
  const resurrected=await page.evaluate(async()=>{
   window.__server('game_update',{gameState:window.__initial(),boopedPieces:[],graduatedPieces:[]});
   const stale=window.__initial();stale.lastMove={row:3,col:3};stale.board[3][3]={color:'gray',type:'kitten'};
   window.__server('game_update',{gameState:stale,boopedPieces:[],graduatedPieces:[]});
   window.__audit.socket.leaveRoom();await new Promise(r=>setTimeout(r,650));
   return window.__audit.socket.gameState?.lastMove;
  });
  // Repaired: leaving cancels the queued update, so it cannot resurrect state.
  assert.equal(resurrected,undefined);console.log('CONFIRMED C03 leaving cancels queued updates');
  // Reset starts a new game but leaves the old delayed bot action alive.
  const reset=await page.evaluate(async()=>{
   window.__scriptBot([{row:5,col:5,pieceType:'kitten'}]);
   window.__audit.bot.startBotGame('Tester',{searchDepth:1});await new Promise(r=>setTimeout(r,30));
   await window.__audit.bot.placePiece(0,0,'kitten');
   window.__audit.bot.resetGame();await new Promise(r=>setTimeout(r,2200));
   return window.__audit.bot.gameState.board[0][0];
  });
  assert.ok(reset);console.log('CONFIRMED B07 old bot timeout overwrites a reset game');
  const stuck=await page.evaluate(async()=>{
   window.__scriptBot([]);
   // findBestMove receives the exact state used by executeMove. Populate a
   // deterministic gray multi-line fixture at that boundary.
   window.__scriptBot([{row:3,col:4,pieceType:'kitten'}]);
   window.__audit.bot.startBotGame('Tester',{searchDepth:1});await new Promise(r=>setTimeout(r,30));
   window.__fixtureBot=true;
   await window.__audit.bot.placePiece(0,0,'kitten');await new Promise(r=>setTimeout(r,2200));
   return {phase:window.__audit.bot.gameState.phase,player:window.__audit.bot.gameState.pendingGraduationPlayer,thinking:window.__audit.bot.botThinking};
  });
  // Repaired: the bot resolves its own pending choice, so the game moves on
  // instead of deadlocking on a dialog the bot can never answer.
  assert.notEqual(stuck.phase,'selecting_graduation');
  assert.equal(stuck.player,undefined);
  console.log('CONFIRMED B01 the local bot resolves its own graduation choice');
  await page.evaluate(()=>{window.__audit.setState(window.__initial());window.__audit.setShowGame(true)});
  await page.waitForTimeout(100);
  // Pending selection keeps currentTurn on orange. Game assumes a turn flip
  // and labels it gray. Resolving with unchanged lastMove records nothing.
  await page.evaluate(()=>{
   const s=window.__initial();s.lastMove={row:3,col:4};s.board[3][4]={color:'orange',type:'kitten'};
   s.phase='selecting_graduation';s.pendingGraduationPlayer='orange';s.pendingGraduationOptions=[[{row:0,col:0},{row:0,col:1},{row:0,col:2}],[{row:5,col:0},{row:5,col:1},{row:5,col:2}]];
   window.__audit.setState(s);
  });
  await page.waitForTimeout(100);
  assert.ok((await page.locator('.history-slider').innerText()).includes('gray'));
  console.log('CONFIRMED H02 pending graduation placement is recorded as opposite player');
  await page.evaluate(()=>{const s=window.__audit.state;window.__audit.setState({...s,phase:'playing',currentTurn:'gray',pendingGraduationOptions:undefined,pendingGraduationPlayer:undefined,graduatedPieces:[{row:0,col:0},{row:0,col:1},{row:0,col:2}]})});
  await page.waitForTimeout(100);
  const historyText=await page.locator('.history-slider').innerText();
  assert.ok(historyText.includes('Move 1/1'));assert.ok(!historyText.includes('🎓'));
  console.log('CONFIRMED H03 graduation selection is missing from move history');
  await page.evaluate(()=>window.__audit.setState(window.__initial()));await page.waitForTimeout(100);
  assert.ok((await page.locator('.history-slider').innerText()).includes('Move 1/1'));
  console.log('CONFIRMED H04 rematch/new empty game keeps previous move history');
  // Repaired: the environment is built in memory from lightformers, so a
  // blocked third-party asset cannot take the board down.
  await page.unroute('**/src/components/FloatingBoard3D.tsx');
  await page.route('https://raw.githack.com/**',r=>r.abort());
  await page.reload();await page.waitForFunction(()=>window.__audit);
  await page.evaluate(()=>window.__audit.setShowGame(true));
  await page.waitForTimeout(1800);
  assert.equal(await page.locator('.board-fallback').count(),0);
  assert.ok(await page.locator('canvas').count() > 0);
  console.log('CONFIRMED U01 the board renders without a third-party environment fetch');
  const appPage=await context.newPage();
  await appPage.route('**/node_modules/.vite/deps/socket__io-client.js*',r=>r.fulfill({contentType:'application/javascript',body:mockSocket}));
  await appPage.addInitScript(()=>{
   localStorage.setItem('boop_player_token','test-token');
   localStorage.setItem('boop_active_game',JSON.stringify({roomCode:'BOOP-TEST',roomId:'test',playerColor:'orange',playerName:'Tester',savedAt:Date.now()}));
   window.__response=()=>({success:true,roomCode:'BOOP-TEST',roomId:'test',playerColor:'orange',gameState:{board:Array.from({length:6},()=>Array(6).fill(null)),players:{orange:{color:'orange',name:'Tester',kittensInPool:8,catsInPool:0,connected:true},gray:null},currentTurn:'orange',phase:'waiting',winner:null,lastMove:null,boopedPieces:[],graduatedPieces:[]}});
  });
  await appPage.goto(url+'/');await appPage.waitForTimeout(700);
  assert.equal(await appPage.getByText('Waiting for opponent...', {exact:true}).count(),0);
  assert.ok((await appPage.evaluate(()=>location.hash)).includes('BOOP-TEST'));
  console.log('CONFIRMED C04 auto-rejoin restores room but not App online game mode');
  await appPage.close();
  console.log('12 browser defect detectors completed.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
