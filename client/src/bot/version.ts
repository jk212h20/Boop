import { BotConfig, DEFAULT_BOT_CONFIG } from './types';

/** Frozen public identity. Any decision-affecting change requires a new ID,
 * a new source manifest and regenerated golden decisions/replays. */
export const BOT_VERSION = 'v4';
export const BOT_PROFILES = {
  easy: { searchDepth: 1, nodeBudget: 30000 },
  normal: { searchDepth: 2, nodeBudget: 30000 },
  hard: { searchDepth: 3, nodeBudget: 30000 },
  expert: { searchDepth: 4, nodeBudget: 30000 },
  master: { searchDepth: 5, nodeBudget: 30000 },
  standard: { searchDepth: 12, nodeBudget: 30000 },
} as const;
export type BotProfile = keyof typeof BOT_PROFILES;
export function versionConfig(profile: BotProfile = 'standard'): BotConfig {
  return { ...DEFAULT_BOT_CONFIG, ...BOT_PROFILES[profile] };
}
export function botIdentity(config: BotConfig): string {
  for (const profile of Object.keys(BOT_PROFILES) as BotProfile[]) {
    const frozen = versionConfig(profile);
    if (Object.keys(frozen).every(key => ['silent','thinkingDelayMs','timeBudgetMs'].includes(key) ||
      config[key as keyof BotConfig] === frozen[key as keyof BotConfig])) return `Bot ${BOT_VERSION}, ${profile}`;
  }
  return `Bot ${BOT_VERSION}, custom (unrated)`;
}
