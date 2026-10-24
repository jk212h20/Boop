import { writeFile, readFile } from 'node:fs/promises';
if (process.env.BOOP_FREEZE_CANDIDATE !== '1') throw Error('Freeze is a release operation, not a test. Never regenerate an existing released version to bless changed decisions. Set BOOP_FREEZE_CANDIDATE=1 only before its initial release.');
import { createHash } from 'node:crypto';
import { corpus, decision, advance } from './botRepro';
import { createInitialGameState } from '../src/bot/LocalGame';
import { BOT_VERSION, versionConfig } from '../src/bot/version';
const positions=[];
for(const {name,state} of corpus()) {
 const result=decision(state);positions.push({name,state,expected:{action:result.action,nodes:result.nodes,depth:result.depth}});
 console.log(JSON.stringify({name,...result}));
}
let state=createInitialGameState();const actions=[];
for(let ply=0;ply<180&&state.phase!=='finished';ply++){
 const result=decision(state);actions.push({action:result.action,nodes:result.nodes,depth:result.depth});state=advance(state,result.action);
 if(ply%10===0)console.log(JSON.stringify({replayPly:ply,elapsedMs:result.elapsedMs}));
}
if(state.phase!=='finished')throw Error('Golden game did not finish');
await writeFile('tests/baselines/v4-golden.json',JSON.stringify({version:BOT_VERSION,positions,replay:{actions,finalState:state}},null,2)+'\n');
const files=['src/bot/BotAI.ts','src/bot/evaluation.ts','src/bot/LocalGame.ts','src/bot/types.ts','src/bot/version.ts','src/bot/bot.worker.ts'];
const hashes:Record<string,string>={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile('tests/baselines/v4-manifest.json',JSON.stringify({version:BOT_VERSION,config:versionConfig(),files:hashes},null,2)+'\n');
console.log(JSON.stringify({goldenPositions:positions.length,replayDecisions:actions.length,winner:state.winner}));
