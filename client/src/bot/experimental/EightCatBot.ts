// Experimental ablation: shared compact search, one explicit evaluation term.
import { BotAI } from '../compact/CompactBot';
import { eightCatValue } from '../compact/eightCatValue';
import { DEFAULT_BOT_CONFIG, type BotConfig } from '../types';
import type { PlayerColor } from '../../types';
export function createBot(color:PlayerColor,config?:Partial<BotConfig>):BotAI {
  return new BotAI(color,{...DEFAULT_BOT_CONFIG,...config},eightCatValue);
}
