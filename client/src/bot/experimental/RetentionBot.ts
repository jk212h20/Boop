// Experimental shared-search durable-progress ablation; not a release.
import { BotAI } from '../compact/CompactBot';
import { retentionValue } from '../compact/developmentValue';
import { DEFAULT_BOT_CONFIG, type BotConfig } from '../types';
import type { PlayerColor } from '../../types';
export function createBot(color:PlayerColor,config?:Partial<BotConfig>):BotAI {
 return new BotAI(color,{...DEFAULT_BOT_CONFIG,...config},retentionValue);
}
