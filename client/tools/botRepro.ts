import { createBot } from '../src/bot/BotAI';
import { createInitialGameState, executeMove, resolveGraduationChoice, getAllValidMoves } from '../src/bot/LocalGame';
import { versionConfig } from '../src/bot/version';
import { GameState } from '../src/types';

export function decision(state: GameState) {
  const color = state.pendingGraduationPlayer ?? state.currentTurn;
  const bot = createBot(color, versionConfig());
  const start = performance.now();
  const action = state.phase === 'selecting_graduation' ? bot.findBestGraduation(state) : bot.findBestMove(state);
  const elapsedMs = performance.now() - start;
  const stats = bot.getStats();
  return { action, nodes: stats.nodes, depth: stats.completedDepth, elapsedMs };
}
export function advance(state: GameState, action: ReturnType<typeof decision>['action']) {
  const result = typeof action === 'number' ? resolveGraduationChoice(state, action) :
    executeMove(state, action!.row, action!.col, action!.pieceType, state.currentTurn);
  if (!result.valid) throw Error(result.error);
  return result.newState;
}
export function corpus(): {name: string; state: GameState}[] {
  const result = [{ name: 'empty-opening', state: createInitialGameState() }];
  let state = createInitialGameState(); let seed=1701;
  for(let ply=0;ply<60&&state.phase!=='finished';ply++) {
    if(ply%5===0||state.phase==='selecting_graduation')result.push({name:`seeded-${ply}-${state.phase}`,state});
    if(state.phase==='selecting_graduation') state=resolveGraduationChoice(state,0).newState;
    else {
      const moves=getAllValidMoves(state,state.currentTurn);seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const move=moves[seed%moves.length];state=executeMove(state,move.row,move.col,move.pieceType,state.currentTurn).newState;
    }
  }
  const eighth=createInitialGameState();
  for(const [r,c] of [[0,0],[0,2],[0,4],[2,0],[2,2],[2,4],[4,0]])eighth.board[r][c]={color:'orange',type:'kitten'};
  eighth.players.orange!.kittensInPool=1;
  result.push({name:'eighth-kitten-choice',state:executeMove(eighth,4,4,'kitten','orange').newState});
  const mixed=createInitialGameState();
  for(const color of ['orange','gray'] as const){mixed.players[color]!.catsInPool=4;mixed.players[color]!.kittensInPool=0;}
  for(const [r,c] of [[1,1],[1,3],[3,1],[3,3]])mixed.board[r][c]={color:'orange',type:'cat'};
  for(const [r,c] of [[0,2],[2,0],[2,4],[4,2]])mixed.board[r][c]={color:'gray',type:'cat'};
  result.push({name:'adult-tactical',state:mixed});
  return result;
}
