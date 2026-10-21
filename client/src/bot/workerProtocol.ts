import { GameState, PlayerColor } from '../types';
import { BotConfig } from './types';
import { SearchStats } from './BotAI';
export interface BotRequest { state: GameState; color: PlayerColor; config: BotConfig }
export type BotReply = { state: GameState; stats: SearchStats } | { error: string };
