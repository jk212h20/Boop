# Compact search engine (experimental, not the live opponent)

Boop owns this implementation under `client/src/bot/compact/`. Released v4,
its manifest, fixtures, worker and UI selection are unchanged. No deployment or
stronger-opponent release is implied by this work.

## Representation and contract

`CompactGame.ts` is an independent search-only transition engine:

- A 36-byte `Uint8Array` encodes empty, orange kitten/cat, gray kitten/cat.
- A six-byte `Int8Array` holds both players' kitten/cat reserves and retired kittens.
- Numeric turn, phase, choice owner and winner; ordered graduation square lists.
- Precomputed boop destinations, line rays and win windows.
- Each transition copies the two small arrays once. No board rows, piece objects,
  player metadata, effect records, repeated board clones or animation data.
- Options are immutable after construction; sibling transitions share them until
  replaced. Input arrays are never modified by a transition.

The supported boundary is a valid two-player canonical state in playing,
selecting-graduation or finished phase. `encode()` rejects missing players and
unsupported phases. This is not a network validator or replacement UI state.
Invalid coordinates, exhausted stock, occupied placements and invalid choice
indices return null. Turn/color comes from the compact state, not caller input.
No undo stack or probabilistic hash is needed in this first implementation.

Graduation ordering is part of the rules/search contract: row-major starts,
canonical direction/ray order, overlapping triple windows deduplicated in first
occurrence order, then row-major eighth-piece single-kitten options. Both owners'
graduations and pending-choice sequence are preserved. Mover wins precede opponent
wins, and both precede graduation. Canonical quirks are preserved, not repaired
silently in a supposedly equivalent implementation.

`CompactBot.ts` is a controlled numeric port of v4 search. Iterative deepening,
alpha-beta, stable ordering/ties, history and transposition semantics, evaluation
arithmetic and work charging remain unchanged. Each attempted transition still
costs one node. The exact transposition key encodes state and ordered options,
not a collision-prone random hash. Evaluation's direct numeric port deliberately
preserves operation order, including floating-point additions.

This is a second backend experiment, not another production search architecture.
Before promotion/consolidation, preserve the released v4 source bytes and keep
behavioral equivalence tests. Existing rejected search snapshots remain isolated
research artifacts; do not build new production features on those copies.

## Correctness evidence

`tests/compactRules.test.ts` compares every child of 7,234 seeded reachable states:
226,574 transition attempts, 541 visited pending-choice positions, 120 terminal
games. Another 8,220 attempts cover 700 dense synthetic boards, including long
and crossing lines and graduation ordering. Evaluation breakdowns and legal move
order are checked for both colors, plus parent nonmutation and sibling isolation.
A further **8,800** exhaustive local geometry attempts cover all board squares,
eight push directions, adjacent colors/types, blocker colors/types and both
placed types. Explicit sequential-choice fixtures settle both owners and verify
the mover retains the turn until the sequence finishes.
This is extensive differential evidence, not an exhaustive proof over all states.

`tests/compactSearch.test.ts` checks corpus positions at 1, 40, 1,000, 30,000
and 60,000 nodes, including cache reuse: exact actions, completed depth, node counts and all
TT statistics. The complete frozen 57-decision v4 self-play replay reproduces.

`tests/compact.browser.cjs` independently matches all 22 frozen positions and the
57-decision replay in Chrome, WebKit and Firefox. Initial maximum sampled
30k decision times: Chrome 88.7ms, WebKit 71ms, Firefox 173ms. These are same-machine
browser samples, not worker startup measurements, throttling tests or a second
physical-device guarantee.

## Performance

Raw evidence: `docs/bot-experiments/compact-performance.jsonl`.
Warmed same-process alternating-order transition batches: **7.5–8.1× faster**.
Three rounds of all 22 saved positions at identical 30k work: **2.85× median paired
whole-search speedup**, with exact actions/work/depth/TT statistics asserted.

- Canonical v4 decision p50 211.4ms, p95 240.1ms.
- Compact 30k decision p50 72.3ms, p95 87.6ms.
- Compact 60k decision p50 146.4ms, p95 164.9ms.

One M4 Max, Node, warmed corpus, unisolated local machine. Other processes/browser
checks may contend. Not a universal latency promise or a strength claim. Encoding
cost is included in whole-search measurements; transition microbenchmarks start
from already encoded states. A deterministic larger allowance can now cost less
than old 30k on this sample, but must still earn promotion through fresh matches.

## Reproduce

From `client/`:

```sh
npm run test:bot:compact
npm run test:bot:repro
npm run bench:bot:compact
```

For browser comparison, run the existing project Vite service, set `BOOP_TEST_URL`
to its verified URL, and choose `BOOP_BROWSER=chrome`, `webkit` or `firefox` for
`npm run test:bot:compact:browser`. Long checks/matches use the registered background
runner. No default worker import has changed.

## Validation and release boundary

Seven compact rule/search tests pass, as do all four immutable v4 reproduction
tests. A clean staged-source build (excluding unrelated graphics work) passes
client/server compilation and all 43 committed client unit tests. Existing
bundle-size/Browserslist warnings remain. The production worker asset is still
`bot.worker-a3f2c45e.js`; the clean frontend remains `index-f31fee9d.js`. Numeric
backend source hashes are saved in `compact-manifest.json` beside the raw results.

Promotion needs a separate decision: larger work changes opponent identity and
requires its own version/profile, frozen fixtures, worker-level checks and fresh
strength confirmation. This engine milestone does not rewrite v4's manifest or
select an unconfirmed stronger default.

## Larger-work pilot (completed, not a release)

Fresh seeds 1400–1411, four seeded opening placements, swapped colors, 180-placement
cap: compact **60,000** against canonical v4 **30,000** finished **12 wins, 8 losses,
4 capped draws (58.3% match score)**. This is a development pilot, not held-out
confirmation or an absolute rating. No evaluation/search-policy changes or timed
fallbacks. The 850ms field in the raw harness metadata is ignored legacy config,
not a time limit; the explicit candidate work budget is 60,000.

In-match candidate decisions: p50 158.4ms, p95 211.6ms, maximum 252.4ms over 804
decisions. V4: p50 234.4ms, p95 281.5ms, maximum 340.6ms over 807 decisions. Median
completed depth remained 4 for both, candidate maximum 6. Same-depth work can still
change which iterations finish on specific positions; larger work is not guaranteed
to improve every move. Full paired outcomes/timings are retained in
`docs/bot-experiments/compact-60k-pilot.jsonl`.

This establishes the engineering milestone: more deterministic work for less
measured time, with a favorable but small pilot. It does **not** establish a
reliably stronger released opponent. No extra candidate sweeps or silent promotion.
