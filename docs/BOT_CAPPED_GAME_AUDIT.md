# Capped-game audit and eight-cat valuation experiments

Owner: Boop. This audit examines the four capped games from compact 60k versus
frozen v4 30k, not the older unrelated LMR batches. Live/default v4 is unchanged.

## Reconstructing the evidence

`client/tools/auditCappedGames.ts` recreates seeds 1402/orange, 1405/orange,
1406/gray and 1408/gray with the exact original opening RNG, color assignment,
node allowances and depth ceiling. Both sides use the compact backend because
it has exact action/work/depth/TT parity with canonical v4, including at 60k.
Canonical LocalGame applies every action. Full states, decisions, inventories,
repeat references and stats are retained in `bot-experiments/capped-audit/`.
The original cap was 180 placements; these reconstructions continue to 240.

A repetition key includes board, stocks, retired kittens, mover, phase, pending
owner and ordered choices. UI events/lastMove are excluded; those do not affect
legal transitions or search. No repetition rule has been added to Boop.

## All four are exact two-placement loops

- 1402/orange: first repeated position before placement 38 (zero-based ply 37),
  returning to ply 35. It repeats 203 decision positions through 240 placements.
- 1405/orange: ply 45 returns to ply 43, 195 repeated decision positions.
- 1406/gray: ply 39 returns to ply 37, 201 repeated decision positions.
- 1408/gray: ply 6 returns to ply 4, 234 repeated decision positions. Only six
  unique positions are visited in the entire game, including the four seeded
  opening placements. Neither player ever graduates a kitten.

Every reconstruction is still unfinished at 240 placements. This is not evidence
that the rule cap should simply be raised. Once the exact decision-relevant state
recurs, deterministic stateless decisions reproduce the same loop indefinitely.

For example, 1402 trades the same adult placements at (5,2) and (4,1), zero-based:
each player boops the other cat off, then the opponent replaces it and returns
the board and stock exactly. No permanent promotion or board progress occurs.

At ply 180 the adults owned (board plus reserve) are respectively:
1402: orange 3, gray 5; 1405: 5 and 5; 1406: 4 and 5; 1408: 0 and 0.
These are not seven-cat positions overlooking an immediate eighth-cat placement.
They are failures to build toward either win condition at longer horizons.

## Diagnosis

V4 rewards total adult ownership at 65 each, but **reserve adults and board adults
receive the same permanent value**. The difference is just positional scoring:
center adult +22.5, corner adult -18, versus reserve adult 0. That can favor
recycling adults in safe central-looking exchanges instead of accumulating them
on the bed. The evaluator also lacks an explicit eight-on-board progress term.

Search is shallow in these positions (usually four placements), resets all
history per decision and has no game/path-repetition valuation. Therefore it can
keep choosing the same superficially profitable exchange without accounting for
how often it already failed to advance the game. Greater work sometimes changes
the move but does not reliably solve the underlying preference.

`probeCappedPositions.ts` checks every actor position in the first cycle at 30k,
60k, 240k, and a new adult-progress evaluator. There are no immediate winning
moves in those eight positions. Some 240k searches leave a loop, others repeat;
in particular both actors in 1402 still choose its repeating exchange at 240k.
This does not prove the non-loop alternative is better against perfect play.
Avoiding repetition can turn a drawable/defensible position into a loss.

## Controlled corrections under test

The compact shared search now has optional experimental evaluator/policy hooks;
with neither enabled it still reproduces exact v4 behavior. Frozen v4 is not edited.

1. **EightCatBot**: v4 plus `eightCatValue`: 22 points per deployed adult anywhere,
   then 4 times the square of adults beyond three, scaled by adults owned / 8.
   Existing terminal scores, adult ownership and tactical pair scores remain.
   This gives eight-cat progress a gradient rather than waiting for a terminal
   eight, and makes a corner adult's net positional/deployment value positive.
2. **ProgressBot**: the same term plus exact search-path cycle evaluation at zero
   (no progress), not an actual Boop draw adjudication. Search TT values are
   disabled in this experimental mode because ancestor-dependent cycle values
   cannot safely use board-only transposition bounds. Transition attempts still
   consume the fixed work budget. Path context is cleared at every decision.

Adult-only valuation cannot directly fix the all-kitten opening loop. A zero
cycle score also does not force a losing player to choose a worse non-loop move.
Neither is a blanket 'pick anything different' policy, nor a persistent real-game
history penalty. New behavior requires a successor identity if ever released.

Each candidate gets a 24-game paired development batch versus v4, and separate
80-placement continuations from the original first-cycle states with either side
or both upgraded. Escaping a cycle and winning are reported separately. No
candidate is promoted merely for reducing capped games.

3. **HistoryProgressBot**: adult progress plus a bounded history of the last 128
   observed own decision states, with an exact repeated-state evaluation penalty
   of 40 per visit, capped at 120. This is a separate stateful identity: only an
   identical decision sequence, not just an identical board, promises identical
   output. `clearCache()` explicitly clears that context; it is not a live worker
   feature. Baseline and other candidates remain stateless.

Full canonical traces are gzip-compressed with separate readable summaries.
`cappedAudit.test.ts` replays every retained action and verifies the entire
canonical state sequence, the two-placement repeats and 240-placement endings.

## Original-cycle continuation results

Adult-only correction, both sides upgraded: 1402 finishes in 19 further placements
(gray wins), 1406 finishes in 21 (gray wins); 1405 and 1408 remain exact loops for
80 further placements. Unilateral changes are not uniformly beneficial: changing
orange alone in 1402 escapes but loses to gray in 17 placements. Changing gray
alone in 1406 wins in 29. This demonstrates why 'fewer draws' is not a strength
metric by itself, and why we must retain side-specific losses.

Search-path zero-cycle valuation additionally lets gray alone escape and win
1402, but still leaves 1405 and 1408 looping even when both sides use it. No claim
that cycle detection by itself repairs the evaluator or game-history policy.

## Development strength evidence

Adult-only, 60k versus v4 30k, fresh seeds 1600–1611: **15–8–1**, 64.6% score.
This combines more search work and new valuation and cannot isolate the latter.
The original compact 60k pilot was 12–8–4 on different seeds; differences between
these small differently seeded batches are not a controlled effect estimate.
An equal-work fresh batch and separate cycle-policy experiments are retained
alongside the raw first pilot, not replaced by the best-looking sample.

Equal-work adult-only comparison (both compact, 30k each), fresh seeds 1900–1911:
**10–10–4**, exactly 50% match score. This does not demonstrate improved strength
from the new valuation alone. Keep the favorable higher-work pilot, but do not
attribute its wins solely to eight-cat valuation. The correction is useful as a
diagnosed progress feature, not a validated stronger release.

Search-path cycle candidate, 60k versus v4 30k, seeds 1700–1711: **8–13–3**
(39.6%). Rejected. Treating hypothetical path cycles as neutral while dropping
TT bounds did not improve the measured opponent. No live integration.

History candidate continuations, both sides upgraded: the original all-kitten
1408 loop now finishes in 34 more placements (gray wins); 1402 and 1406 also
finish, while 1405 remains stuck. Upgrading only one side in 1408 makes that
side **lose**: orange loses in 42, gray loses in 47. This is direct evidence that
forcing progress against a repeating opponent can surrender the prior non-loss.
Do not advertise a solved anti-loop policy or general improvement from this.

Validation: six progress/audit tests, seven compact differential/search tests,
four frozen v4 checks, clean staged-source client/server builds pass. Canonical
trace tests normalize absent versus undefined optional fields after JSON storage,
not any rule-relevant values. No fixture regeneration or default worker changes.

History candidate, 60k versus v4 30k, seeds 1800–1811: **12–12–0**. No capped
games, but no positive match score despite double work. It is a clear example
of removing draws without establishing strength. No promotion.

## Conclusion

The suspected long-horizon defect is real: exact short cycles, sometimes before
any promotion, not merely a generous move cap. Deployed-adult progress can be
valued explicitly and improves some diagnosed decisions, but its equal-work
strength result is neutral. Basic search-path and observed-state penalties also
do not robustly solve all loops without costs. A production successor needs a
stronger progress model (including kitten promotion and defense), explicit
history semantics if used, and equal-work fresh confirmation. This audit delivers
reproductions, targeted tests and measured ablations, not a stronger release.
