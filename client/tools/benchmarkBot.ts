// Run a reproducible paired match batch on actual game rules, never simulator rules.
// Optional BOOP_LEGACY_MODULE points to a saved pre-change engine for comparison.
import { createBot } from '../src/bot/BotAI';
import { createInitialGameState, executeMove, getAllValidMoves, resolveGraduationChoice } from '../src/bot/LocalGame';
import { PlayerColor } from '../src/types';
import { pathToFileURL } from 'node:url';

const baselineModule = process.env.BOOP_LEGACY_MODULE;
const baselineFactory = baselineModule ? (await import(pathToFileURL(baselineModule).href)).createBot : createBot;
const pairs = Number(process.env.BOOP_BENCH_PAIRS ?? 6);
const budget = Number(process.env.BOOP_BENCH_BUDGET ?? 850);
let wins = 0, losses = 0, draws = 0;
const timings: number[] = [], depths: number[] = [];
for (let seed = 0; seed < pairs; seed++) for (const newColor of ['orange', 'gray'] as const) {
  let s = createInitialGameState();
  let rng = seed + 123;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const bots = Object.fromEntries((['orange','gray'] as const).map(c => [c,
    c === newColor ? createBot(c, { timeBudgetMs: budget, searchDepth: 12, silent: true }) :
      baselineFactory(c, { searchDepth: Number(process.env.BOOP_BASELINE_DEPTH ?? 2), silent: true, timeBudgetMs: budget })]));
  let ply = 0;
  while (s.phase !== 'finished' && ply < 180) {
    if (s.phase === 'selecting_graduation') {
      const actor = s.pendingGraduationPlayer!;
      const choice = actor === newColor ? bots[actor].findBestGraduation(s) :
        (s.pendingGraduationOptions ?? []).reduce((best, option, i, options) =>
          option.filter(p => s.board[p.row][p.col]?.type === 'kitten').length >
          options[best].filter(p => s.board[p.row][p.col]?.type === 'kitten').length ? i : best, 0);
      s = resolveGraduationChoice(s, choice).newState;
      continue;
    }
    const actor: PlayerColor = s.currentTurn;
    // Same four seeded opening plies with colours swapped for each pair.
    const moves = getAllValidMoves(s, actor);
    const start = performance.now();
    const move = ply < 4 ? moves[Math.floor(random() * moves.length)] : bots[actor].findBestMove(s);
    if (actor === newColor && ply >= 4) {
      timings.push(performance.now() - start); depths.push(bots[actor].getStats().completedDepth);
    }
    if (!move) break;
    const result = executeMove(s, move.row, move.col, move.pieceType, actor);
    if (!result.valid) throw new Error(result.error);
    s = result.newState; ply++;
  }
  if (!s.winner) draws++; else if (s.winner === newColor) wins++; else losses++;
  console.log(JSON.stringify({ seed, newColor, winner: s.winner, ply, wins, losses, draws }));
}
timings.sort((a,b) => a-b); depths.sort((a,b) => a-b);
console.log(JSON.stringify({ wins, losses, draws, samples: timings.length, budget,
  p50Ms: timings[Math.floor(timings.length * .5)], p95Ms: timings[Math.floor(timings.length * .95)],
  maxMs: timings.at(-1), medianDepth: depths[Math.floor(depths.length * .5)], maxDepth: depths.at(-1) }));
