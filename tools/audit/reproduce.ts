// Audit detectors: assert the documented defects are still reproducible.
// These are NOT passing game-rule conformance tests; see docs/AUDIT.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoopGame } from '../../server/src/game/GameState';
import { RoomManager } from '../../server/src/rooms/RoomManager';
import { setupSocketHandlers } from '../../server/src/socket/handlers';
import { LobbyManager } from '../../server/src/lobby/LobbyManager';
import { AzClient } from '../../server/src/bots/azClient';
import { createInitialGameState, executeMove, simulateMove, findCatLines, cloneGameState } from '../../client/src/bot/LocalGame';
import { createBot } from '../../client/src/bot/BotAI';

let checks = 0;
function detect(name: string, fn: () => void) {
  fn(); checks++; console.log(`CONFIRMED ${name}`);
}
const kitten = { color: 'orange', type: 'kitten' } as const;
const cat = { color: 'orange', type: 'cat' } as const;
function fixture(pieces: [number, number, 'kitten' | 'cat', 'orange' | 'gray'][], color: 'orange' | 'gray' = 'orange') {
  const state = createInitialGameState();
  state.currentTurn = color;
  for (const [row, col, type, owner] of pieces) state.board[row][col] = {type, color: owner};
  for (const owner of ['orange', 'gray'] as const) {
    const own = pieces.filter(p => p[3] === owner);
    const cats = own.filter(p => p[2] === 'cat').length;
    const kittens = own.length - cats;
    const player = state.players[owner]!;
    player.kittensRetired = cats;
    player.kittensInPool = 8 - cats - kittens;
    player.catsInPool = 0;
  }
  return state;
}
function engine(state = createInitialGameState()) {
  const game = new BoopGame();
  game.addPlayer('local-player', 'Orange', 'secret-orange');
  game.addPlayer('local-bot', 'Gray', 'secret-gray');
  // Hydrate exact legal inventory fixtures without a long random setup game.
  Object.assign(game as any, { board: state.board, players: state.players, currentTurn: state.currentTurn, phase: state.phase });
  return game;
}

// Complete an all-cat triple by booping its third cat alongside a kitten.
const winningSetup = () => {
  // Cat at (1,2) is pushed to (0,2), completing c c c k on row 0.
  // The kitten at (0,3) is two rows away and stays put.
  const s = fixture([[0,0,'cat','orange'], [0,1,'cat','orange'], [1,2,'cat','orange'], [0,3,'kitten','orange']]);
  s.players.orange!.kittensInPool--; s.players.orange!.kittensRetired++; s.players.orange!.catsInPool++;
  return s;
};
detect('R01 winning cat line erased by mixed graduation (server and local)', () => {
  const s = winningSetup();
  const local = executeMove(s, 2,2,'cat','orange');
  const server = engine(winningSetup()); const result = server.placePiece('local-player',2,2,'cat');
  assert.equal(local.valid, true); assert.equal(result.valid, true);
  assert.equal(local.newState.winner, null); assert.equal(result.winner, null);
  assert.equal(findCatLines(local.newState.board, 'orange').length, 0);
  assert.equal(local.newState.graduatedPieces.length, 3);
});
detect('R02 opponent cat win is ignored', () => {
  const s = fixture([[0,0,'cat','gray'], [0,1,'cat','gray'], [1,2,'cat','gray']]);
  // Give orange one cat to push the gray cat upwards.
  s.players.orange!.kittensInPool = 7; s.players.orange!.kittensRetired = 1; s.players.orange!.catsInPool = 1;
  const game = engine(s); const result = game.placePiece('local-player',2,2,'cat');
  assert.equal(result.valid,true); assert.equal(findCatLines(game.getState().board,'gray').length,1);
  assert.equal(result.winner,null); assert.equal(game.getState().phase,'playing');
});
const eightSetup = () => fixture([[0,0,'kitten','orange'],[0,2,'kitten','orange'],[0,4,'kitten','orange'],[2,0,'kitten','orange'],[2,2,'kitten','orange'],[2,4,'kitten','orange'],[4,0,'kitten','orange']]);
detect('R03 eight-piece graduation is forced to first kitten with no choice', () => {
  const game = engine(eightSetup()); const result = game.placePiece('local-player',4,4,'kitten');
  assert.equal(result.valid,true); assert.deepEqual(result.graduatedPieces,[{row:0,col:0}]);
  assert.equal(game.getState().phase,'playing');
});
detect('R04 eight pieces plus a triple offers no single-piece alternative', () => {
  const s = eightSetup(); s.board[0][4] = null; s.board[0][1] = kitten;
  const result = engine(s).placePiece('local-player',4,4,'kitten');
  assert.equal(result.valid,true); assert.equal(result.graduatedPieces.length,3);
  assert.equal(result.requiresGraduationChoice,undefined);
});
detect('V01 invalid piece type mints a piece and negative cat inventory', () => {
  const game = engine(); const result = game.placePiece('local-player',2,2,'dragon' as any);
  assert.equal(result.valid,true); assert.equal(game.getState().players.orange!.catsInPool,-1);
  assert.equal(game.getState().board[2][2]!.type,'dragon');
});
detect('V02 fractional row crashes engine rather than returning invalid', () => {
  assert.throws(() => engine().placePiece('local-player',0.5,2,'kitten'),TypeError);
});
const selectionSetup = () => fixture([[0,0,'kitten','orange'],[0,1,'kitten','orange'],[0,2,'kitten','orange'],[5,0,'kitten','orange'],[5,1,'kitten','orange'],[5,2,'kitten','orange']]);
detect('V03 fractional graduation index throws', () => {
  const game = engine(selectionSetup()); assert.equal(game.placePiece('local-player',3,4,'kitten').requiresGraduationChoice,true);
  assert.throws(() => game.selectGraduation('local-player',0.5),TypeError);
});
detect('S01 both reconnect secrets are exposed to clients', () => {
  const game = new BoopGame(); game.addPlayer('a','A','secret-a'); game.addPlayer('b','B','secret-b');
  const publicState = JSON.parse(JSON.stringify(game.getState()));
  assert.equal(publicState.players.gray.playerToken,'secret-b');
});
detect('S02 disclosed token replaces an online opponent socket', () => {
  const rm = new RoomManager(); const room = rm.createRoom();
  rm.joinRoom(room.id,'a','A','secret-a'); rm.joinRoom(room.id,'b','B','secret-b');
  assert.equal(rm.rejoinRoom(room.code,'attacker','secret-b').success,true);
  assert.equal(room.game.getPlayerColor('attacker'),'gray');
  assert.equal(room.game.getPlayerColor('b'),null);
});
detect('M01 stranger can take a disconnected seat during grace period', () => {
  const rm = new RoomManager(); const room = rm.createRoom();
  rm.joinRoom(room.id,'a','A','ta'); rm.joinRoom(room.id,'b','B','tb'); rm.softDisconnect('a');
  assert.equal(rm.joinRoom(room.id,'stranger','Stranger','tx').success,true);
  assert.equal(rm.rejoinRoom(room.code,'a2','ta').success,false);
});
detect('M02 replacement join cancels graduation selection', () => {
  const game = engine(selectionSetup()); game.placePiece('local-player',3,4,'kitten');
  assert.equal(game.getState().phase,'selecting_graduation'); game.disconnectPlayer('local-player');
  game.addPlayer('replacement','Replacement'); assert.equal(game.getState().phase,'playing');
  assert.ok(game.getState().pendingGraduationOptions);
});
detect('M03 both disconnected seats cause immediate room deletion', () => {
  const rm = new RoomManager(); const room = rm.createRoom();
  rm.joinRoom(room.id,'a','A','ta'); rm.joinRoom(room.id,'b','B','tb'); rm.softDisconnect('a'); rm.softDisconnect('b');
  rm.cleanupEmptyRooms(); assert.equal(rm.findRoomById(room.id),undefined);
});
detect('M04 grace-period expiry leaves token reusable forever', () => {
  const rm = new RoomManager(); const room = rm.createRoom();
  rm.joinRoom(room.id,'a','A','ta'); rm.joinRoom(room.id,'b','B','tb'); rm.softDisconnect('a');
  (rm as any).disconnectedPlayers.get('ta').disconnectedAt = new Date(Date.now()-360000);
  rm.cleanupDisconnectedPlayers(); assert.equal(rm.rejoinRoom(room.code,'a2','ta').success,true);
});
detect('M05 one socket can occupy both seats and becomes unable to move as gray', () => {
  const rm = new RoomManager(); const room = rm.createRoom();
  assert.equal(rm.joinRoom(room.id,'a','A','ta').success,true);
  assert.equal(rm.joinRoom(room.id,'a','A','ta').success,true);
  assert.equal(room.game.placePiece('a',0,0,'kitten').valid,true);
  assert.equal(room.game.placePiece('a',5,5,'kitten').error,'Not your turn');
});
detect('M06 joining a second room leaves a ghost player in first', () => {
  const rm = new RoomManager(); const a = rm.createRoom(); const b = rm.createRoom();
  rm.joinRoom(a.id,'s','A','ta'); rm.joinRoom(b.id,'s','A','ta'); rm.softDisconnect('s');
  assert.equal(a.game.getState().players.orange!.connected,true);
});
detect('M07 explicit leave leaves orphaned board pieces and a playing game', () => {
  const game = engine(); game.placePiece('local-player',0,0,'kitten'); game.removePlayer('local-player');
  assert.equal(game.getState().phase,'playing'); assert.equal(game.getState().board[0][0]!.color,'orange');
  game.addPlayer('replacement','Replacement');
  assert.equal(game.getState().players.orange!.kittensInPool,8); // plus existing board piece = 9
});
detect('B02 simulation discards graduation choices', () => {
  const s = selectionSetup(); const sim = simulateMove(s,3,4,'kitten','orange');
  const actual = executeMove(s,3,4,'kitten','orange');
  assert.equal(actual.newState.phase,'selecting_graduation'); assert.equal(sim.createsGraduation,false);
  assert.equal((sim as any).pendingOptions,undefined);
});
detect('B03 search state loses opponent pieces returned to pool and kittens retired', () => {
  const s = fixture([[0,0,'cat','gray']]); s.players.gray!.catsInPool = 0;
  s.players.orange!.catsInPool=1; s.players.orange!.kittensInPool=7; s.players.orange!.kittensRetired=1;
  const sim = simulateMove(s,1,1,'cat','orange');
  const bot:any = createBot('orange',{silent:true}); const projected = bot.buildResultingState(s,sim,'orange');
  const actual = executeMove(s,1,1,'cat','orange').newState;
  assert.equal(projected.players.gray.catsInPool,0); assert.equal(actual.players.gray!.catsInPool,1);
  const g = fixture([[0,0,'kitten','orange'],[0,1,'kitten','orange']]);
  const gs = simulateMove(g,0,2,'kitten','orange');
  assert.equal(bot.buildResultingState(g,gs,'orange').players.orange.kittensRetired,0);
  assert.equal(executeMove(g,0,2,'kitten','orange').newState.players.orange!.kittensRetired,3);
});
detect('B04 supposed blocking move still boops opponent into a winning line', () => {
  // Either player's cat at (4,4) pushes gray (3,4) to (2,4), completing
  // gray's row. Occupying the winning move's cell is not a defense.
  const s = fixture([[2,2,'cat','gray'],[2,3,'cat','gray'],[3,4,'cat','gray']]);
  s.players.gray!.kittensRetired=4; s.players.gray!.kittensInPool=4; s.players.gray!.catsInPool=1;
  s.players.orange!.kittensRetired=1; s.players.orange!.kittensInPool=7; s.players.orange!.catsInPool=1;
  const bot:any = createBot('orange',{silent:true});
  const moves = [{row:4,col:4,pieceType:'cat'},{row:4,col:4,pieceType:'kitten'}];
  const blocks = bot.findBlockingMoves(s,moves);
  // Validate returned candidates by actual resulting opponent wins.
  assert.ok(blocks.some((m:any) => findCatLines(simulateMove(s,m.row,m.col,m.pieceType,'orange').newBoard,'gray').length>0));
});
detect('B05 config knobs are accepted but never used', () => {
  // Static source check is the evidence, not equality on an empty board.
  const source=readFileSync(new URL('../../client/src/bot/BotAI.ts',import.meta.url),'utf8');
  assert.equal(source.includes('this.config.ownPieceBoopedOff'),false);
  assert.equal(source.includes('this.config.oppPieceBoopedOff'),false);
});
detect('B06 cloning a selection state strips its pending options', () => {
  const s=executeMove(selectionSetup(),3,4,'kitten','orange').newState;
  assert.ok(s.pendingGraduationOptions); assert.equal(cloneGameState(s).pendingGraduationOptions,undefined);
});
// Exercise event handlers without binding any ports.
function socketHarness() {
  const handlers: Record<string,Function>={}; const emitted:any[]=[]; const joins:string[]=[]; const leaves:string[]=[];
  const socket:any={id:'s',on:(name:string,fn:Function)=>handlers[name]=fn,join:(id:string)=>joins.push(id),leave:(id:string)=>leaves.push(id),to:(id:string)=>({emit:(...args:any[])=>emitted.push([id,...args])})};
  const io:any={on:(_name:string,fn:Function)=>fn(socket),to:(id:string)=>({emit:(...args:any[])=>emitted.push([id,...args])}),sockets:{sockets:new Map([['s',socket]])}};
  const rooms=new RoomManager(); const lobby=new LobbyManager(); setupSocketHandlers(io,rooms,lobby);
  const invoke=(name:string,data:any)=>{let response:any; handlers[name](data,(r:any)=>response=r); return response;};
  return {handlers,emitted,joins,leaves,socket,rooms,lobby,invoke};
}
detect('M08 quick-match seats omit reconnection tokens', () => {
  const h=socketHarness(); h.lobby.addPlayer('s','S'); h.lobby.addPlayer('other','Other');
  const result=h.invoke('select_opponent',{opponentId:'other'}); assert.equal(result.success,true);
  assert.equal(result.gameState.players.orange.playerToken,undefined);
  assert.equal(result.gameState.players.gray.playerToken,undefined);
});
detect('M09 self quick-match seats the same socket twice', () => {
  const h=socketHarness(); h.lobby.addPlayer('s','S');
  const result=h.invoke('select_opponent',{opponentId:'s'}); assert.equal(result.success,true);
  assert.equal(result.gameState.players.orange.socketId,result.gameState.players.gray.socketId);
});
detect('M10 joining lobby neither leaves old socket room nor informs opponent', () => {
  const h=socketHarness(); h.invoke('create_room',{playerName:'S',playerToken:'t'});
  h.emitted.length=0; assert.equal(h.invoke('join_lobby',{playerName:'S'}).success,true);
  assert.equal(h.leaves.length,0); assert.equal(h.emitted.some(e=>e[1]==='player_left'),false);
});
detect('M11 missing acknowledgement crashes handler even inside catch', () => {
  const h=socketHarness(); assert.throws(()=>h.handlers.create_room({playerName:'S'}),TypeError);
});
detect('A02 malformed AZ indices pass schema validation', () => {
  const client:any=new AzClient('http://invalid.test');
  assert.doesNotThrow(()=>client.validateMoveResponse({kind:'place',row:0.5,col:Infinity,pieceType:'cat'}));
  assert.doesNotThrow(()=>client.validateMoveResponse({kind:'graduation',optionIndex:NaN}));
});
detect('B08 changing bot evaluation config leaves old cached scores intact',()=>{
  const bot:any=createBot('orange',{silent:true});
  bot.transpositionTable.set('fixture',{depth:3,score:123,flag:0,bestMove:null});
  bot.setConfig({pieceInCenter:999}); assert.equal(bot.transpositionTable.size,1);
});
detect('M12 rejoin leaves old socket room mapping behind',()=>{
  const rm=new RoomManager();const room=rm.createRoom();rm.joinRoom(room.id,'old','A','ta');
  rm.rejoinRoom(room.code,'new','ta');assert.equal(rm.getPlayerRoom('old')?.id,room.id);
});
console.log(`\n${checks} deterministic/static defect detectors completed.`);
