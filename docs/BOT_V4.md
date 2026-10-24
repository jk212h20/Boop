# Bot v4, standard

Local fixed-work opponent. Owner: Boop client engine in this repository. The
previous unversioned timed engine is preserved only in
`client/tests/baselines/BotAI.before.ts` (source from commit `130d26f`). Do not
retroactively label wins over that engine as wins over v4.

## Frozen specification

The machine-readable source SHA-256 manifest and complete numeric configuration
are `client/tests/baselines/v4-manifest.json`. Decision sources, including the
canonical game rules, are hashed. Changes to those sources require a new bot
version, source manifest, and golden fixtures. Old manifests must not be silently
regenerated to bless changed decisions. Nondecision UI/rendering changes need not
change the opponent. This initial freeze is v4; it does not imply v1–v3 were
previously reproducible released opponents.

- Standard budget: **30,000 nodes per decision**, depth ceiling 12.
- A node is **one attempted application** of canonical `executeMove` or
  `resolveGraduationChoice` in search, charged BEFORE the attempt. Invalid
  attempts, root ordering attempts, and repeated attempts in iterative deepening
  count. Evaluation, cache probes and visiting an already-generated root child
  do not add nodes. Reaching the limit aborts the current iteration; only the
  last fully completed iteration determines the published action. At tiny custom
  budgets before an iteration completes, the available statically ordered legal
  root fallback is deterministic. Normal standard budget covers all root actions.
- Stop early only for a completed terminal-score iteration, no legal action, or
  depth ceiling. No wall-clock stopping, random moves or machine-dependent budget.
- Alpha–beta iterative deepening, canonical transitions, full pending-choice
  resolution at the horizon. Choices consume nodes but no placement depth.
- Root ordering: previous best, prior iteration value, stable canonical order.
  Internal ordering: transposition action, cutoff-history score, centre distance,
  stable canonical order. Strict improvement replaces best; ties keep the first.
- Canonical action order: row-major empty square, kitten before cat. Promotion
  options retain canonical rule order. No random opening book: search begins
  from the empty board. The golden opening is kitten D1.
- Transposition map and 144-entry history array reset before EVERY decision;
  30,000-entry table cap. Keys include board, turn, phase, pending chooser/options
  (in their original order), both pools and retired kittens.
- Position weights: centre 15, inner ring 8, edge -5, corner -12; adult multiplier
  1.5. Each acquired cat (pool or board) 65. Terminal result ±100,000.
- Additional pair scores are below; all weights/source are in the manifest.
- Easier named profiles freeze depth ceilings 1 through 5 with the same node cap.
  They are different labelled opponents. Arbitrary config is labelled custom,
  unrated. Legacy `timeBudgetMs` and `thinkingDelayMs` do not control decisions.
  The unused legacy evaluation fields (`ownPieceBoopedOff`, `oppPieceBoopedOff`)
  remain serialized in the complete config but do not contribute to v4's score.
- Worker reply may include resolving pending choices, one placement, and resolving
  resulting bot-owned choices. Each decision gets the same fixed budget, never
  whatever wall time remains. No timed weaker fallback. Worker failure leaves the
  board unchanged and exposes an error and retry action. Slow work finishes the
  same computation. Cancel/reset/leave can explicitly discard a pending request.

## How two-in-a-row is valued

Only on-board three-cell windows count. A diagonal with no legal third square
gets zero pair credit. An opponent in that window blocks it.

For each otherwise open two-piece window, independently test reserve kitten and
cat completion. An adjacent piece stays if the placed kitten cannot push that
adult, or its outward destination is occupied by either colour. Off-board is NOT
a blocker. Nonadjacent members stay. This distinguishes adjacent protected pairs
from separated pairs that a gap placement would scatter.

- Two adults and a legal reserve-cat completion: +30 per window; deduplicate
  distinct completion squares for the threat bonus.
- Other legal completions: promotion potential, +12 times newly acquired kittens
  divided by three. A kitten completion adds one new kitten to that line; a cat
  completion does not. Existing adults are recycled, not three new adults.
- No legal completion with available stock: 8% of the base pair weight, only a
  speculative setup, not a ready threat.
- At least one adult winning square: +180 when that player acts next, otherwise
  +80; each additional distinct square adds 55, capped at three extras.
- Each distinct promotion square: +12 on turn or +6 off turn, capped at four.

These are direct-completion potentials, not proofs of a forced win. Search must
still account for booping the pair, occupying squares, forcing choices, winning
first and all-eight-cats victories. The 1,260-case pair/rule test cross-checks
predicted direct adult completions against actual canonical moves.

## Reproducibility and support

`v4-golden.json` saves 22 exact positions with expected action, work count and
completed depth, plus a complete 57-decision self-play game and final state.
Tests check fresh engines, reused caches, Node, browsers and CPU throttling.
The SHA manifest makes accidental rule/weight/algorithm drift fail closed. JavaScript
uses IEEE-754 doubles; this engine uses no transcendental/random scoring. Stable
ECMAScript sorting preserves canonical ties. Exact regression checks, rather than
assuming portability, establish the tested runtime matrix.

Run from `client`:

```sh
npx tsx --tsconfig tests/tsconfig.json --test tests/reproducibility.test.ts
BOOP_TEST_URL=http://127.0.0.1:5173 node tests/reproducibility.browser.cjs
BOOP_TEST_URL=http://127.0.0.1:5173 BOOP_BROWSER=webkit node tests/reproducibility.browser.cjs
BOOP_TEST_URL=http://127.0.0.1:5173 BOOP_BROWSER=firefox node tests/reproducibility.browser.cjs
```

Use a verified devports Vite listener. CPU throttling emulates slower execution,
not a physical second device. No claim of testing every device. New runtime
support requires running these fixtures there. One-second performance cannot be
guaranteed on arbitrary hardware; identical decisions take precedence.

## Strength and performance evidence

Final configuration: 30,000 nodes. Calibration ran on this M4 Max with concurrent
validation load. Across 22 saved positions and a complete 57-decision replay:

- Chrome maximum single decision 312ms; maximum cold worker reply 873ms.
- WebKit maximum single decision 381ms; maximum cold worker reply 709ms.
- Firefox maximum single decision 782ms; maximum cold worker reply 1,328ms.
- Chrome 4× CPU throttle: maximum single decision 2,185ms, with exactly the same
  moves, completed depths, node counts and final replay state.

A worker reply can contain multiple fixed-budget decisions (promotion choices and
placement), plus worker startup. It is NOT guaranteed to stay below a second in
Firefox or on slower devices. Single-decision calibration is below a second on
all three tested browser engines; slower replies retain the exact same opponent.
No second physical device was tested. Runtime matrix uses Node plus installed
Chrome, Playwright WebKit 27.2 and Firefox 157.

The rejected 40,000-node candidate scored 15 wins, 8 losses, 1 draw against the
850ms baseline over 24 games but had less timing headroom. Its results must not
be attributed to the final 30,000-node version. A smaller 6,000-node candidate
lost 1–3 despite being quick; speed alone was not accepted as an improvement.

Final match evidence is saved in `BOT_V4_RESULTS.json`. Matches use canonical
rules, four seeded random opening placements, each seed played as both colours,
a 180-placement draw cap, and each engine's own searched graduation choices.
The baseline gets its full 850ms per decision and depth ceiling 12; v4 gets
30,000 nodes and the same ceiling. The test harness previously handicapped legacy
promotion choices and defaulted baseline depth to 2; both are corrected here.
This is a comparative sample, not an Elo rating or proof of optimal play.

### Final 30,000-node comparison

**15 wins, 6 losses, 3 draws in 24 games** (68.75% match score), fresh seeds
500–511, each with v4 as both colours. Across 745 v4 placement/choice decisions:
median 282ms, p95 515ms, maximum 809ms; median completed depth 4, maximum 5.
The 743 baseline decisions had median/p95 850ms and maximum 850.3ms, median
depth 4. Neither engine was restricted to a shallower search ceiling. This is a
useful measured improvement over this baseline, not statistical certainty about
all openings or an absolute skill rating.

Validation: client unit suite (including pair cases and identity), 1,260 canonical
pair-rule comparisons, four frozen-source/reproducibility tests, 16 server rule
tests, full Chrome/WebKit/Firefox fixture/replay/worker matrix, live lobby/worker
lifecycle, failure/retry, rapid input, and stationary-preview checks passed.
