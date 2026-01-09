// Bot vs Bot Simulation
// Run this to generate statistics about bot performance

import { createInitialGameState, executeMove, cloneGameState } from './LocalGame';
import { createBot } from './BotAI';
import { GameState, PlayerColor } from '../types';

interface SimulationResult {
  winner: PlayerColor | 'draw';
  totalMoves: number;
  winCondition?: string;
}

interface SimulationStats {
  gamesPlayed: number;
  orangeWins: number;
  grayWins: number;
  draws: number;
  avgMoves: number;
  winByThreeCats: number;
  winByEightCats: number;
  minMoves: number;
  maxMoves: number;
}

// Run a single game between two bots
export function runBotVsBotGame(verbose: boolean = false): SimulationResult {
  let state = createInitialGameState('Bot Orange', 'Bot Gray');
  const orangeBot = createBot('orange');
  const grayBot = createBot('gray');
  
  let moveCount = 0;
  const maxMoves = 200; // Safety limit
  
  while (state.phase === 'playing' && moveCount < maxMoves) {
    const currentBot = state.currentTurn === 'orange' ? orangeBot : grayBot;
    const move = currentBot.findBestMove(state);
    
    if (!move) {
      if (verbose) console.log(`[Move ${moveCount}] ${state.currentTurn} has no valid moves!`);
      break;
    }
    
    const result = executeMove(state, move.row, move.col, move.pieceType, state.currentTurn);
    
    if (!result.valid) {
      if (verbose) console.log(`[Move ${moveCount}] Invalid move by ${state.currentTurn}!`);
      break;
    }
    
    state = result.newState;
    moveCount++;
    
    if (verbose && moveCount % 10 === 0) {
      console.log(`[Move ${moveCount}] Game in progress...`);
    }
  }
  
  return {
    winner: state.winner || 'draw',
    totalMoves: moveCount,
    winCondition: state.winner ? 'unknown' : undefined,
  };
}

// Run multiple simulations and return statistics
export function runSimulation(numGames: number = 100, verbose: boolean = false): SimulationStats {
  console.log(`\n🤖 Running ${numGames} Bot vs Bot games...\n`);
  
  const results: SimulationResult[] = [];
  
  for (let i = 0; i < numGames; i++) {
    const result = runBotVsBotGame(verbose);
    results.push(result);
    
    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${numGames} games completed`);
    }
  }
  
  // Calculate statistics
  const orangeWins = results.filter(r => r.winner === 'orange').length;
  const grayWins = results.filter(r => r.winner === 'gray').length;
  const draws = results.filter(r => r.winner === 'draw').length;
  const totalMoves = results.map(r => r.totalMoves);
  const avgMoves = totalMoves.reduce((a, b) => a + b, 0) / numGames;
  
  const stats: SimulationStats = {
    gamesPlayed: numGames,
    orangeWins,
    grayWins,
    draws,
    avgMoves: Math.round(avgMoves * 10) / 10,
    winByThreeCats: results.filter(r => r.winCondition === 'three_cats_in_row').length,
    winByEightCats: results.filter(r => r.winCondition === 'all_eight_cats').length,
    minMoves: Math.min(...totalMoves),
    maxMoves: Math.max(...totalMoves),
  };
  
  return stats;
}

// Pretty print the results
export function printStats(stats: SimulationStats): void {
  console.log('\n' + '='.repeat(50));
  console.log('📊 BOT VS BOT SIMULATION RESULTS');
  console.log('='.repeat(50));
  console.log(`
| Metric               | Value                          |
|---------------------|--------------------------------|
| Games Played        | ${stats.gamesPlayed.toString().padEnd(30)} |
| Orange Wins         | ${stats.orangeWins} (${(stats.orangeWins/stats.gamesPlayed*100).toFixed(1)}%)${' '.repeat(20 - (stats.orangeWins/stats.gamesPlayed*100).toFixed(1).length)} |
| Gray Wins           | ${stats.grayWins} (${(stats.grayWins/stats.gamesPlayed*100).toFixed(1)}%)${' '.repeat(20 - (stats.grayWins/stats.gamesPlayed*100).toFixed(1).length)} |
| Draws               | ${stats.draws} (${(stats.draws/stats.gamesPlayed*100).toFixed(1)}%)${' '.repeat(20 - (stats.draws/stats.gamesPlayed*100).toFixed(1).length)} |
| Avg Moves/Game      | ${stats.avgMoves.toString().padEnd(30)} |
| Min Moves           | ${stats.minMoves.toString().padEnd(30)} |
| Max Moves           | ${stats.maxMoves.toString().padEnd(30)} |
`);
  console.log('='.repeat(50));
  
  // Analysis
  console.log('\n📈 ANALYSIS:');
  if (stats.orangeWins > stats.grayWins) {
    console.log(`  • Orange (first player) has ${((stats.orangeWins - stats.grayWins)/stats.gamesPlayed*100).toFixed(1)}% advantage`);
  } else if (stats.grayWins > stats.orangeWins) {
    console.log(`  • Gray (second player) has ${((stats.grayWins - stats.orangeWins)/stats.gamesPlayed*100).toFixed(1)}% advantage`);
  } else {
    console.log('  • Games are evenly matched');
  }
  
  if (stats.draws > 0) {
    console.log(`  • ${stats.draws} games ended in draws (possibly hit move limit)`);
  }
  
  console.log(`  • Average game length: ~${Math.round(stats.avgMoves)} moves`);
  console.log('\n');
}

// Export for running from console
export async function runAndPrint(numGames: number = 50): Promise<void> {
  const stats = runSimulation(numGames);
  printStats(stats);
}

// Default export for easy testing
export default { runSimulation, printStats, runAndPrint, runBotVsBotGame };
