// Stateful successor experiment: bounded decision history is explicit policy input.
import { BotAI } from '../compact/CompactBot';
import { encode, snapshot, type CompactState, colorIndex } from '../compact/CompactGame';
import { eightCatValue } from '../compact/eightCatValue';
import { DEFAULT_BOT_CONFIG, type BotConfig } from '../types';
import type { GameState, PlayerColor } from '../../types';
const key=(s:CompactState)=>JSON.stringify(snapshot(s));
class HistoryProgressBot {
 private visits=new Map<string,number>();private recent:string[]=[];
 private bot:BotAI;private own:number;
 constructor(private color:PlayerColor,private config:BotConfig){
  this.own=colorIndex(color);
  this.bot=new BotAI(color,config,(s,c)=>eightCatValue(s,c)-(c===this.own?40*Math.min(3,this.visits.get(key(s))??0):0));
 }
 private remember(s:GameState){
  const k=key(encode(s));this.recent.push(k);this.visits.set(k,(this.visits.get(k)??0)+1);
  if(this.recent.length>128){const old=this.recent.shift()!,n=this.visits.get(old)!-1;if(n)this.visits.set(old,n);else this.visits.delete(old);}
 }
 findBestMove(s:GameState){if(s.phase==='playing'&&s.currentTurn===this.color)this.remember(s);return this.bot.findBestMove(s);}
 findBestGraduation(s:GameState){if(s.phase==='selecting_graduation'&&s.pendingGraduationPlayer===this.color)this.remember(s);return this.bot.findBestGraduation(s);}
 getStats(){return this.bot.getStats();}
 getConfig(){return this.bot.getConfig();}
 setConfig(c:Partial<BotConfig>){this.config={...this.config,...c};this.bot.setConfig(c);this.clearCache();}
 clearCache(){this.visits.clear();this.recent=[];this.bot.clearCache();}
}
export function createBot(color:PlayerColor,config?:Partial<BotConfig>){return new HistoryProgressBot(color,{...DEFAULT_BOT_CONFIG,...config});}
