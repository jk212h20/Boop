/** Stateless, bounded JSONL interface for MLFactory. No training logic or UI imports. */
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInitialGameState, executeMove, resolveGraduationChoice, getAllValidMoves } from '../src/bot/LocalGame';
import { BotAI } from '../src/bot/BotAI';
import { versionConfig } from '../src/bot/version';
import type { GameState, PlayerColor } from '../src/types';

const files = ['src/bot/LocalGame.ts', 'src/bot/BotAI.ts', 'src/bot/evaluation.ts', 'src/bot/types.ts', 'src/bot/version.ts', 'src/types.ts'];
const sources = Object.fromEntries(files.map(name => [name, createHash('sha256').update(readFileSync(fileURLToPath(new URL('../' + name, import.meta.url)))).digest('hex')]));
const colors: PlayerColor[] = ['orange', 'gray'];
function actor(s: GameState): PlayerColor { return s.pendingGraduationPlayer ?? s.currentTurn; }
function actions(s: GameState): number[] {
  if (s.phase === 'finished') return [];
  if (s.phase === 'selecting_graduation') return (s.pendingGraduationOptions ?? []).map((_, i) => 72 + i);
  return getAllValidMoves(s, actor(s)).map(m => (m.pieceType === 'cat' ? 36 : 0) + m.row * 6 + m.col);
}
function snapshot(s: GameState) {
  const legal = actions(s);
  if (legal.some(a => a >= 104)) throw new Error('Graduation action capacity exceeded; update encoding before training');
  return { raw: s, legal, to_play: colors.indexOf(actor(s)), is_terminal: s.phase === 'finished',
    winner: s.winner === null ? null : colors.indexOf(s.winner),
    board: s.board.flat().map(p => !p ? 0 : (p.color === 'orange' ? 1 : 3) + (p.type === 'cat' ? 1 : 0)),
    orange_pool: [s.players.orange!.kittensInPool, s.players.orange!.catsInPool, s.players.orange!.kittensRetired],
    gray_pool: [s.players.gray!.kittensInPool, s.players.gray!.catsInPool, s.players.gray!.kittensRetired],
    phase: s.phase, pending_options: (s.pendingGraduationOptions ?? []).map(o => o.map(c => c.row * 6 + c.col)) };
}
export function dispatch(req: { op: string; state?: GameState; action?: number }) {
  if (req.op === 'ping') return { protocol: 1, rules: 'boop-canonical-v1', opponent: 'v4-standard-30000', sources };
  if (req.op === 'initial') return snapshot(createInitialGameState('training-orange', 'training-gray'));
  const s = req.state;
  if (!s) throw new Error('Missing state');
  if (req.op === 'inspect') return snapshot(s);
  if (req.op === 'v4') {
    if (s.phase === 'finished') throw new Error('Terminal state');
    const bot = new BotAI(actor(s), { ...versionConfig('standard'), silent: true });
    const move = s.phase === 'playing' ? bot.findBestMove(s) : null;
    const action = s.phase === 'selecting_graduation' ? 72 + bot.findBestGraduation(s) :
      move ? (move.pieceType === 'cat' ? 36 : 0) + move.row * 6 + move.col : -1;
    if (!actions(s).includes(action)) throw new Error('v4 returned illegal action');
    return { action };
  }
  if (req.op !== 'step' || !Number.isInteger(req.action) || !actions(s).includes(req.action!)) throw new Error('Invalid operation or illegal action');
  const a = req.action!;
  const result = s.phase === 'selecting_graduation' ? resolveGraduationChoice(s, a - 72) :
    executeMove(s, Math.floor((a % 36) / 6), a % 6, a >= 36 ? 'cat' : 'kitten', actor(s));
  if (!result.valid) throw new Error(result.error ?? 'Canonical transition rejected');
  return snapshot(result.newState);
}
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  try { console.log(JSON.stringify({ ok: true, result: dispatch(JSON.parse(line)) })); }
  catch (error) { console.log(JSON.stringify({ ok: false, error: String(error) })); }
});
