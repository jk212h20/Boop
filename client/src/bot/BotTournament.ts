// Bot Tournament System
// Run parameter tuning tournaments and track results

import { createInitialGameState, executeMove } from './LocalGame';
import { BotAI } from './BotAI';
import { BotConfig, DEFAULT_BOT_CONFIG } from './types';
import { GameState } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ConfigVariant {
  name: string;
  config: Partial<BotConfig>;
  description?: string;
}

export interface MatchResult {
  configA: string;
  configB: string;
  winsA: number;
  winsB: number;
  draws: number;
  totalGames: number;
  avgMoves: number;
}

export interface TournamentResult {
  date: string;
  gamesPerMatch: number;
  variants: ConfigVariant[];
  matches: MatchResult[];
  leaderboard: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  config: Partial<BotConfig>;
}

// ============================================================================
// PREDEFINED CONFIG VARIANTS
// ============================================================================

export const CONFIG_VARIANTS: ConfigVariant[] = [
  {
    name: 'Baseline',
    config: {},
    description: 'Default parameters',
  },
  {
    name: 'CenterLover',
    config: { pieceInCenter: 25, pieceInInnerRing: 12 },
    description: 'High center control priority',
  },
  {
    name: 'EdgeHater',
    config: { pieceOnEdge: -12, pieceInCorner: -20 },
    description: 'Strong avoidance of edges',
  },
  {
    name: 'ThreatFocused',
    config: { twoInRowCats: 50, twoInRowKittens: 20 },
    description: 'Prioritize creating threats',
  },
  {
    name: 'Aggressive',
    config: { oppPieceBoopedOff: 40 },
    description: 'High value on booping opponents',
  },
  {
    name: 'CatValuer',
    config: { catMultiplier: 2.0 },
    description: 'Cats worth 2x kittens',
  },
  {
    name: 'Balanced+',
    config: { pieceInCenter: 18, twoInRowCats: 35, oppPieceBoopedOff: 30 },
    description: 'Slightly boosted all-around',
  },
  {
    name: 'Defensive',
    config: { pieceOnEdge: -10, pieceInCorner: -18, twoInRowCats: 25 },
    description: 'Avoid edges, moderate threats',
  },
  {
    name: 'DeepThinker',
    config: { searchDepth: 3 },
    description: 'Search depth 3 (slower but smarter)',
  },
  {
    name: 'QuickThinker',
    config: { searchDepth: 1 },
    description: 'Search depth 1 (faster but weaker)',
  },
];

// ============================================================================
// CORE TOURNAMENT LOGIC
// ============================================================================

// Run a single game between two bot configs
function runSingleGame(
  configA: Partial<BotConfig>,
  configB: Partial<BotConfig>,
  orangeIsA: boolean
): { winner: 'A' | 'B' | 'draw'; moves: number } {
  // Always run in silent mode for tournaments
  const fullConfigA: BotConfig = { ...DEFAULT_BOT_CONFIG, ...configA, silent: true };
  const fullConfigB: BotConfig = { ...DEFAULT_BOT_CONFIG, ...configB, silent: true };
  
  let state: GameState = createInitialGameState('BotA', 'BotB');
  
  const botOrange = new BotAI('orange', orangeIsA ? fullConfigA : fullConfigB);
  const botGray = new BotAI('gray', orangeIsA ? fullConfigB : fullConfigA);
  
  let moveCount = 0;
  const maxMoves = 200;
  
  while (state.phase === 'playing' && moveCount < maxMoves) {
    const currentBot = state.currentTurn === 'orange' ? botOrange : botGray;
    const move = currentBot.findBestMove(state);
    
    if (!move) break;
    
    const result = executeMove(state, move.row, move.col, move.pieceType, state.currentTurn);
    if (!result.valid) break;
    
    state = result.newState;
    moveCount++;
  }
  
  if (!state.winner) {
    return { winner: 'draw', moves: moveCount };
  }
  
  // Determine if winner is A or B
  const winnerIsOrange = state.winner === 'orange';
  const winnerIsA = (winnerIsOrange && orangeIsA) || (!winnerIsOrange && !orangeIsA);
  
  return { winner: winnerIsA ? 'A' : 'B', moves: moveCount };
}

// Run a match between two configs (multiple games, alternating colors)
export function runMatch(
  variantA: ConfigVariant,
  variantB: ConfigVariant,
  numGames: number = 100
): MatchResult {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let totalMoves = 0;
  
  for (let i = 0; i < numGames; i++) {
    // Alternate who plays orange
    const orangeIsA = i % 2 === 0;
    const result = runSingleGame(variantA.config, variantB.config, orangeIsA);
    
    totalMoves += result.moves;
    
    if (result.winner === 'A') winsA++;
    else if (result.winner === 'B') winsB++;
    else draws++;
  }
  
  return {
    configA: variantA.name,
    configB: variantB.name,
    winsA,
    winsB,
    draws,
    totalGames: numGames,
    avgMoves: Math.round(totalMoves / numGames * 10) / 10,
  };
}

// Run full round-robin tournament
export function runTournament(
  variants: ConfigVariant[] = CONFIG_VARIANTS,
  gamesPerMatch: number = 100
): TournamentResult {
  console.log(`\n🏆 STARTING TOURNAMENT`);
  console.log(`   ${variants.length} variants, ${gamesPerMatch} games/match`);
  console.log(`   Total matches: ${variants.length * (variants.length - 1) / 2}`);
  console.log('');
  
  const matches: MatchResult[] = [];
  const wins: Map<string, number> = new Map();
  const losses: Map<string, number> = new Map();
  const drawsMap: Map<string, number> = new Map();
  
  // Initialize counters
  for (const v of variants) {
    wins.set(v.name, 0);
    losses.set(v.name, 0);
    drawsMap.set(v.name, 0);
  }
  
  // Round-robin: each pair plays once
  let matchNum = 0;
  const totalMatches = variants.length * (variants.length - 1) / 2;
  
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      matchNum++;
      const variantA = variants[i];
      const variantB = variants[j];
      
      console.log(`  [${matchNum}/${totalMatches}] ${variantA.name} vs ${variantB.name}...`);
      
      const result = runMatch(variantA, variantB, gamesPerMatch);
      matches.push(result);
      
      // Update stats
      wins.set(variantA.name, (wins.get(variantA.name) || 0) + result.winsA);
      wins.set(variantB.name, (wins.get(variantB.name) || 0) + result.winsB);
      losses.set(variantA.name, (losses.get(variantA.name) || 0) + result.winsB);
      losses.set(variantB.name, (losses.get(variantB.name) || 0) + result.winsA);
      drawsMap.set(variantA.name, (drawsMap.get(variantA.name) || 0) + result.draws);
      drawsMap.set(variantB.name, (drawsMap.get(variantB.name) || 0) + result.draws);
      
      console.log(`           ${variantA.name}: ${result.winsA} | ${variantB.name}: ${result.winsB} | Draws: ${result.draws}`);
    }
  }
  
  // Build leaderboard
  const leaderboard: LeaderboardEntry[] = variants.map(v => {
    const w = wins.get(v.name) || 0;
    const l = losses.get(v.name) || 0;
    const d = drawsMap.get(v.name) || 0;
    const total = w + l + d;
    return {
      rank: 0,
      name: v.name,
      wins: w,
      losses: l,
      draws: d,
      winRate: total > 0 ? Math.round(w / total * 1000) / 10 : 0,
      config: v.config,
    };
  });
  
  // Sort by win rate
  leaderboard.sort((a, b) => b.winRate - a.winRate);
  leaderboard.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });
  
  return {
    date: new Date().toISOString(),
    gamesPerMatch,
    variants,
    matches,
    leaderboard,
  };
}

// ============================================================================
// OUTPUT / REPORTING
// ============================================================================

export function printLeaderboard(result: TournamentResult): void {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('🏆 TOURNAMENT LEADERBOARD');
  console.log('═'.repeat(70));
  console.log(`Date: ${result.date}`);
  console.log(`Games per match: ${result.gamesPerMatch}`);
  console.log('');
  console.log('┌──────┬────────────────────┬──────┬──────┬──────┬─────────┐');
  console.log('│ Rank │ Config             │ Wins │ Loss │ Draw │ Win %   │');
  console.log('├──────┼────────────────────┼──────┼──────┼──────┼─────────┤');
  
  for (const entry of result.leaderboard) {
    const rank = entry.rank.toString().padStart(4);
    const name = entry.name.padEnd(18).slice(0, 18);
    const wins = entry.wins.toString().padStart(4);
    const losses = entry.losses.toString().padStart(4);
    const draws = entry.draws.toString().padStart(4);
    const winRate = `${entry.winRate.toFixed(1)}%`.padStart(7);
    console.log(`│ ${rank} │ ${name} │ ${wins} │ ${losses} │ ${draws} │ ${winRate} │`);
  }
  
  console.log('└──────┴────────────────────┴──────┴──────┴──────┴─────────┘');
  
  // Print winner's config
  const winner = result.leaderboard[0];
  console.log('');
  console.log('🥇 WINNER CONFIG:');
  console.log(`   Name: ${winner.name}`);
  console.log(`   Win Rate: ${winner.winRate}%`);
  console.log('   Parameters:');
  for (const [key, value] of Object.entries(winner.config)) {
    if (key !== 'thinkingDelayMs') {
      console.log(`     ${key}: ${value}`);
    }
  }
  console.log('');
}

export function printMatchDetails(result: TournamentResult): void {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('📊 MATCH DETAILS');
  console.log('═'.repeat(70));
  
  for (const match of result.matches) {
    const total = match.winsA + match.winsB + match.draws;
    const rateA = Math.round(match.winsA / total * 100);
    const rateB = Math.round(match.winsB / total * 100);
    console.log(`${match.configA} vs ${match.configB}:`);
    console.log(`  ${match.configA}: ${match.winsA} (${rateA}%) | ${match.configB}: ${match.winsB} (${rateB}%) | Draws: ${match.draws}`);
    console.log(`  Avg moves: ${match.avgMoves}`);
    console.log('');
  }
}

// Export results as JSON for record keeping
export function exportResults(result: TournamentResult): string {
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

// Quick tournament with default variants
export async function runQuickTournament(gamesPerMatch: number = 100): Promise<TournamentResult> {
  const result = runTournament(CONFIG_VARIANTS, gamesPerMatch);
  printLeaderboard(result);
  return result;
}

// Run tournament with custom variants
export async function runCustomTournament(
  variants: ConfigVariant[],
  gamesPerMatch: number = 100
): Promise<TournamentResult> {
  const result = runTournament(variants, gamesPerMatch);
  printLeaderboard(result);
  return result;
}

// Grid search on specific parameters
export function generateGridVariants(
  paramName: keyof BotConfig,
  values: number[]
): ConfigVariant[] {
  return values.map(value => ({
    name: `${paramName}=${value}`,
    config: { [paramName]: value },
    description: `Testing ${paramName} at ${value}`,
  }));
}

// Generate variants for multi-param grid search
export function generateMultiGridVariants(
  params: { name: keyof BotConfig; values: number[] }[]
): ConfigVariant[] {
  if (params.length === 0) return [];
  if (params.length === 1) {
    return generateGridVariants(params[0].name, params[0].values);
  }
  
  // Recursive combination
  const variants: ConfigVariant[] = [];
  const [first, ...rest] = params;
  const restVariants = generateMultiGridVariants(rest);
  
  for (const value of first.values) {
    if (restVariants.length === 0) {
      variants.push({
        name: `${first.name}=${value}`,
        config: { [first.name]: value },
      });
    } else {
      for (const rv of restVariants) {
        variants.push({
          name: `${first.name}=${value},${rv.name}`,
          config: { [first.name]: value, ...rv.config },
        });
      }
    }
  }
  
  return variants;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  runTournament,
  runQuickTournament,
  runCustomTournament,
  runMatch,
  printLeaderboard,
  printMatchDetails,
  exportResults,
  generateGridVariants,
  generateMultiGridVariants,
  CONFIG_VARIANTS,
};
