# Post-v4 search experiments

Status: experiments, not released or deployed. V4 source and identity
remain unchanged. All candidates use the same 30,000 canonical-transition budget,
depth ceiling 12 and canonical rules; no timed fallback. The initial search
candidates retain v4 evaluation; later evaluation variants are identified below.

## Candidates

- `client/src/bot/experimental/PvsBot.ts`: principal-variation search with fractional
  null windows and full re-search on bound improvement. Exact optimization, tested
  against full-width minimax on 22 saved positions at completed depth two. Ties may
  differ. The existing terminal-win early stop is permitted before depth two.
- `client/src/bot/experimental/LmrBot.ts`: selective late-move reduction. At depth
  >=3, after six searched children, reduce quiet placement children by one ply and
  re-search bound improvements at full depth. No reduction of promotion decisions,
  terminal transitions, or positions/children with direct pair-based winning
  completion squares. This is approximate: it can overlook threats outside that
  detector. Do not describe it as minimax-equivalent or proven safe.

Both reset caches/history per decision and charge re-search transitions to the
same fixed allowance. Neither candidate is imported into the shipped worker. The default remains v4.

## Protocol

`client/tools/benchmarkBot.ts` now accepts BOOP_CANDIDATE_MODULE as well as the
existing baseline module. Without overrides, the opponent is actual frozen v4,
not the older timed engine. Four seeded opening placements, swapped colors for
each seed, canonical promotion choices, 180-placement cap. Randomness exists only
in the benchmark openings, never in bot search. Draws are cap outcomes, not proof
of a game-theoretic draw.

Predeclared batches:
- PVS pilot: six paired seeds 700–705 (12 games).
- LMR pilot: six paired seeds 720–725 (12 games).
- LMR fresh evaluation: twelve paired seeds 800–811 (24 games), launched without
  changing/tuning candidate based on pilot results. This batch is not a PVS test.

Concurrent matches are valid for deterministic strength comparisons, but their
wall-clock measurements are contention-affected. Run isolated calibration before
promoting any candidate. A selective search is eligible for a new version only
with positive fresh-match evidence, tactical/rules/repro checks and runtime
calibration; do not alter v4 or overwrite its released fixtures to bless changes.
An unfavorable result stays recorded and the candidate stays experimental.

## Initial validation

PVS: full-width fixed-depth value comparisons and cache-reuse/work-cap checks pass.
LMR: all seven existing tactical/legality tests pass. V4's four source/golden/replay
regressions pass unchanged. Candidate build passed with the existing bundle-size
and Browserslist warnings. None of this substitutes for final match results.

22-position search diagnostic (single run, under concurrent load): aggregate
completed depth v4 68, PVS 68, LMR 72; PVS changed zero actions, LMR changed two.
Maximum observed decision v4 256ms, PVS 250ms, LMR 257ms. Aggregate depth is only a
search-work diagnostic; reduced depth is not directly comparable to full depth.

## Completed PVS pilot

4 wins, 5 losses, 3 capped draws against v4 (45.8% score), seeds 700–705.
No evidence of improvement: do not promote PVS. Raw records are retained in
`docs/bot-experiments/pvs-pilot.jsonl`. Both engines had median completed depth 4.

## LMR results so far

Pilot seeds 720–725: 4 wins, 5 losses, 3 capped draws (45.8%).
Fresh seeds 800–811: 15 wins, 8 losses, 1 capped draw (64.6%).
Combined: 19–13–4 (58.3%). Record both: the favorable fresh batch does not erase
the unfavorable pilot. A second fresh 24-game confirmation uses seeds 900–911
and the exact release-candidate source then named BotV5.ts, without algorithm
changes. After rejection it was moved back to experimental/LmrBot.ts (imports
only), and the live v4 selection was restored.

Candidate saved actions/depth/work and complete 61-decision self-play replay
match Node, Chrome, WebKit and Firefox. No second physical device tested.

## Evaluation candidates (not selected from final results)

Started while LMR confirmation was running, two independent v4 full-width-search
evaluation candidates use the same 30,000 work budget:
- PromotionBot: permanent adult inventory weight 65 -> 100; all else unchanged.
  Paired seeds 1000–1011, 24 games.
- GrowthBot: inventory 100 plus reduced positional emphasis (kitten position
  multiplier .6, adult .35 instead of 1 and 1.5). Seeds 1100–1111, 24 games.
These are development batches, not held-out confirmation of a selected winner.
They remain experimental and cannot replace the released identity without a new
freeze and further fresh evaluation. No node allowance increases.

## LMR confirmation: rejected for default

Seeds 900–911: 7 wins, 13 losses, 4 capped draws. Both fresh batches combined
22–21–5 (51.0%); including pilot 26–26–8 (50.0%). No demonstrated strength
improvement. V4 remains default. The experimental candidate replay is retained for
reproducible evidence, not described as a released stronger opponent.

## Tactical-horizon candidate

ThreatBot adds at most one extra placement layer when a horizon position has a
direct pair-based winning completion for either side. The extension allowance
travels with the path and enters the transposition key; all transitions still
count toward 30,000. It is not a full quiescence solver, and no extra work budget
is granted. Paired development seeds 1200–1211, 24 games.

## Promotion inventory result

11 wins, 10 losses, 3 capped draws (52.1%) against v4, seeds 1000–1011. Too
close to promote. Increasing permanent growth weight alone is not a demonstrated
strength improvement. No follow-up selected on this marginal result.

## Reduced-position growth result

9 wins, 11 losses, 4 capped draws (45.8%), seeds 1100–1111. Rejected.
The adult inventory increase combined with reduced positional emphasis did not
improve the measured opponent. Keep v4's existing evaluation.

## Validation and interpretation

35 candidate tests pass (tactics, legal moves, unchanged inputs, fixed allowances,
cache-reset repeatability, full candidate replay and exact PVS score checks).
V4 source/golden/replay checks and live worker/lobby/cancellation/failure/retry
smoke pass. Build passes with existing bundle-size/Browserslist warnings.

LMR candidate browser/worker diagnostics before rejection: 22 positions plus full
61-decision replay match on Chrome, WebKit, Firefox; Chrome 4× throttle also matches.
Max unthrottled decision: Chrome 247ms, WebKit 349ms, Firefox 506ms. Max complete
worker reply: 495ms, 643ms, 859ms respectively. Chrome 4× decision max 1043ms with
identical choices. These were contention-affected diagnostics, not isolated release
calibration, and do not justify promoting the rejected candidate.

`client/tools/summarizeMatches.py` reports paired-opening score/standard error from
retained JSONL. Color-swapped games share openings, so do not treat them as fully
independent observations or claim an absolute skill rating from these batches.

## Tactical horizon result and conclusion

ThreatBot: 7 wins, 15 losses, 2 capped draws (33.3%), seeds 1200–1211. Rejected.
The extra tactical layer consumed work needed elsewhere and did not improve play.

All five avenues were implemented and measured, totaling 144 games. None provides
convincing improvement over frozen v4 at the same allowance. Do not call any a
stronger released bot. V4 is unchanged and remains the default. The next substantive
avenue would be a compact, rules-equivalent transition engine to make a larger
deterministic search allowance affordable, backed by differential canonical-rules
tests and fresh paired matches; that larger implementation is not claimed done.
