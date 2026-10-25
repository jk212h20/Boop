// Offline search diagnostics; candidates remain outside the shipped worker.
import { corpus } from './botRepro';
import { createBot as v4 } from '../src/bot/BotAI';
import { createBot as pvs } from '../src/bot/experimental/PvsBot';
import { createBot as lmr } from '../src/bot/experimental/LmrBot';
import { createBot as threat } from '../src/bot/experimental/ThreatBot';
for(const {name,state} of corpus()) {
  const results=[];
  for(const [label,factory] of [['v4',v4],['pvs',pvs],['lmr',lmr],['threat',threat]] as const) {
    const bot=factory(state.pendingGraduationPlayer ?? state.currentTurn,{silent:true});
    const action=state.phase==='selecting_graduation'?bot.findBestGraduation(state):bot.findBestMove(state);
    results.push({label,action,...bot.getStats()});
  }
  console.log(JSON.stringify({name,results}));
}
