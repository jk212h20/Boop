# Durable progress results

Owner: Boop. Plan: `BOT_PROGRESS_PLAN.md`. No live/default opponent changes.

## Search diagnosis before further heuristic tuning

The user correctly challenged the idea that an early exact loop is a small
strategic omission. The all-kitten 1408 loop is a major counterexample to useful
long-horizon play, not evidence of a solved drawn opening.

`client/tools/loopSearchOracle.ts` implements canonical-rule alpha-beta without
TT, history, iterative ordering, compact transitions or fixed-work cutoffs. Each
root action is scored with a separate full window. Its evaluator independently
reconstructs positional/inventory arithmetic, reusing canonical pair features.
It is independent of the production search, not of all evaluation assumptions.

At each of the two loop states, both canonical and compact searches choose an
oracle-optimal action at every checked completed depth 1–5. Additional pending
choice fixtures check actor ownership and horizon graduation settlement. These
are targeted checks, not a universal correctness proof.

Orange's best scores at depths 1–4: +22, 0, +23.92, -12.
Gray's: +8.96, -14, +12, -23.92. At depth four both select the exact looping moves.
They do NOT both evaluate themselves as winning. Each sees the repeating action
as its least-bad finite-horizon choice. This is consistent with zero-sum scoring:
they evaluate different states, at different horizons, with different predicted
continuations, not contradictory positive values of the same state.

Orange's depth-four PV after its looping move predicts gray developing at (3,2),
not gray's actual (2,1) recycling reply. The opponent instead replans four plies
from its new state. The repetition is therefore a receding-horizon failure:
neither forecast promises that both sides will actually follow the loop forever.
The static evaluator also swings by 26 points in favor of the mover on
**each** recycling move: orange -6 to +20, gray -20 to +6. Both board positions
contain the same two kittens per side, no adults and no scored pairs. Thus the
immediate attraction is entirely positional recycling, not progress in material
or a promotion threat. A complete cycle restores the original scores exactly.
Odd/even score swings show substantial last-mover/horizon sensitivity. These
numbers are heuristic units, not win probabilities or proven minimax outcomes.

Raw all-action scores, static component breakdowns and principal variations are
in `bot-experiments/loop-search-diagnosis.json.gz`. No immediate wins or missing
adult terminal checks explain the all-kitten loop. No claim that deeper search
alone repairs it.

## Candidates and evidence

Both candidates reuse the compact search unchanged. Development adds kitten
presence and single-kitten open promotion-runway windows, tapered by owned
adults, on top of the previous deployed-adult progress term. Retention additionally
penalizes geometrically ejectable pieces. No repetition penalties, hidden game
history, new rules or uncharged child-transition searches.

All feature tests cover color/D4 symmetry, stock/strength/blocker conditions,
nonmutation, repeated fixed-work decisions and terminal priority. Open windows
are potential development, not guaranteed promotion; exposure is direct geometric
risk, not an assertion that the opponent should take it.

At depth five the independent oracle and both engines again agree, but now
choose developing moves: orange (3,3) at +24.08 and gray (3,2) at +19.92.
This supports horizon sensitivity, not a theorem that depth five is sufficient
elsewhere. The oracle is also regression-checked against fully exhaustive,
non-pruned minimax through depth three from both colors' perspectives.

### Predeclared equal-work screening

Seeds 2000–2011, 12 color-swapped pairs per candidate, 30k each:

- Development: **16–6–2**, 70.83% score. Both six-pair halves score 70.83%;
  meets the predeclared gate and selected for held-out confirmation.
- Retention: **10–9–5**, 52.08%; fails gate. Not selected.

There is no matched-seed evidence here that the geometric risk penalty improves
this candidate. Preserve it as a negative ablation rather than adding complexity.
Source hashes are frozen in `bot-experiments/durable-manifest.json` before the
confirmation batch on untouched seeds 2100–2123; no subsequent weight changes.

Development candidate's both-upgraded continuation diagnostics: 1402 gray wins
in 19, 1406 gray wins in 19, 1408 gray wins in 36; 1405 still loops through 80.
This remedies the original early all-kitten loop without a history policy, not
all repetition. These previously inspected positions are not strength holdouts.

Retention both-upgraded diagnostics also leave 1405 looped. On the original
all-kitten loop, development succeeds even unilaterally: orange-only wins in
27 further placements, gray-only wins in 40. This is more encouraging than the
previous history penalty, which escaped that position by losing. It remains a
known training fixture, not proof of general strength.

### Validation and scope

Clean staged-source client/server builds, 43 standard client tests, ten new
feature/oracle tests and six prior progress/audit tests pass. Seven compact
parity tests and four frozen-v4 reproducibility tests also pass. The emitted
production worker and main bundle hashes stay unchanged; neither candidate is
selected by the UI/worker. No graphics files are included. Existing large-bundle
and stale Browserslist warnings persist. No new browser/second-device release
calibration is claimed for these experimental candidates.

## Fresh held-out confirmation and decision

Untouched seeds 2100–2123, 24 complete color-swapped pairs, equal 30k work:
**26 wins, 18 losses, 4 capped games**, **58.33%** match score. First half 56.25%,
second half 60.42%. Descriptive paired-score SE 0.08333 (24 openings, not 48
independent games). Broad uncertainty; no reliable rating/strength claim.

This is positive in both halves but **fails the predeclared 60% overall gate**.
No promotion, no further tuning on these holdouts, no moving the threshold to
bless the result. Keep DevelopmentBot as a promising experimental feature, not
a validated stronger opponent. Screening plus confirmation total 42–24–6 for
this candidate, but the screening was selected and must not replace the fresh
confirmation as the decision criterion.

Confirmation sampled candidate p50/p95/max 121.4/149.4/158.5 ms, control
84.6/109.1/119.8 ms; both median depth four. The richer evaluator costs more per
fixed transition attempt. Concurrent jobs and one warmed machine: descriptive
only, not isolated calibration or portable latency promises. Source manifest
hashes remain unchanged after the complete batch.

## Next direction, not an unrun strength claim

The early-loop problem is demonstrably a receding-horizon positional preference,
and useful kitten development repairs that specific case even unilaterally.
It is not simply a missing eight-cat win detector or an unconditional need for
game-history penalties. The remaining 1405 adult loop resists both new features.
Next work should diagnose its counterfactual lines and stabilization at the search
horizon (promotions, boop exchanges, reserve-to-board conversion), rather than
sweep more arbitrary bonus weights. Any selective extension must charge every
transition and beat a same-work control; prior tactical extensions were negative.
This bounded plan is complete: diagnostic oracle, two ablations, known-cycle
continuations, held-out confirmation and regression validation are retained.
