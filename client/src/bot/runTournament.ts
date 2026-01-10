#!/usr/bin/env npx ts-node
// CLI script to run bot tournaments
// Usage: npx ts-node src/bot/runTournament.ts [numGames]

import {
  runTournament,
  printLeaderboard,
  exportResults,
  CONFIG_VARIANTS,
} from './BotTournament';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const RESULTS_DIR = './tournament-results';
const DEFAULT_GAMES_PER_MATCH = 100;

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Parse command line args
  const args = process.argv.slice(2);
  const gamesPerMatch = args[0] ? parseInt(args[0], 10) : DEFAULT_GAMES_PER_MATCH;
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    🐱 BOOP BOT TOURNAMENT 🐱                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Games per match: ${gamesPerMatch}`);
  console.log(`Variants: ${CONFIG_VARIANTS.length}`);
  console.log('');
  
  // Run tournament
  const startTime = Date.now();
  const result = runTournament(CONFIG_VARIANTS, gamesPerMatch);
  const endTime = Date.now();
  
  const durationSec = ((endTime - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Tournament completed in ${durationSec} seconds`);
  
  // Print results
  printLeaderboard(result);
  
  // Save results to file
  ensureResultsDir();
  const filename = `tournament-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  
  const jsonOutput = exportResults(result);
  fs.writeFileSync(filepath, jsonOutput);
  console.log(`📁 Results saved to: ${filepath}`);
  
  // Also save a summary markdown file
  const summaryPath = path.join(RESULTS_DIR, `summary-${new Date().toISOString().split('T')[0]}.md`);
  const summaryMd = generateMarkdownSummary(result, durationSec);
  fs.writeFileSync(summaryPath, summaryMd);
  console.log(`📝 Summary saved to: ${summaryPath}`);
  
  console.log('');
}

function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

function generateMarkdownSummary(result: ReturnType<typeof runTournament>, duration: string): string {
  const lines: string[] = [];
  
  lines.push('# Bot Tournament Results');
  lines.push('');
  lines.push(`**Date:** ${result.date}`);
  lines.push(`**Games per match:** ${result.gamesPerMatch}`);
  lines.push(`**Duration:** ${duration}s`);
  lines.push(`**Variants tested:** ${result.variants.length}`);
  lines.push('');
  
  lines.push('## Leaderboard');
  lines.push('');
  lines.push('| Rank | Config | Wins | Losses | Draws | Win Rate |');
  lines.push('|------|--------|------|--------|-------|----------|');
  
  for (const entry of result.leaderboard) {
    lines.push(`| ${entry.rank} | ${entry.name} | ${entry.wins} | ${entry.losses} | ${entry.draws} | ${entry.winRate.toFixed(1)}% |`);
  }
  
  lines.push('');
  lines.push('## Winner Configuration');
  lines.push('');
  const winner = result.leaderboard[0];
  lines.push(`**${winner.name}** with ${winner.winRate.toFixed(1)}% win rate`);
  lines.push('');
  lines.push('```typescript');
  lines.push('const winnerConfig = {');
  for (const [key, value] of Object.entries(winner.config)) {
    lines.push(`  ${key}: ${value},`);
  }
  lines.push('};');
  lines.push('```');
  lines.push('');
  
  lines.push('## Variant Descriptions');
  lines.push('');
  for (const variant of result.variants) {
    lines.push(`- **${variant.name}**: ${variant.description || 'No description'}`);
  }
  lines.push('');
  
  lines.push('## Head-to-Head Results');
  lines.push('');
  for (const match of result.matches) {
    lines.push(`- ${match.configA} vs ${match.configB}: ${match.winsA}-${match.winsB} (${match.draws} draws)`);
  }
  lines.push('');
  
  return lines.join('\n');
}

// Run
main().catch(console.error);
