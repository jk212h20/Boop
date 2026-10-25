# Local bot history

**Current owner:** [Bot v4 fixed-work specification](BOT_V4.md).
Post-v4 candidates remain experimental; see [search experiments](BOT_SEARCH_EXPERIMENTS.md). The deadline,
watchdog fallback and timing claims below describe the previous unversioned
engine, preserved for historical comparison, not the current opponent.

## Previous one-second local bot

## Goal and implemented plan

Search within one second on the tested foreground browser, use the available time
for stronger play, and keep rendering/input responsive. This belongs to Boop's
local engine; the separately hosted experimental AlphaZero option is unchanged.

1. **Correct search transitions.** Use `executeMove` and
   `resolveGraduationChoice`, exactly as live play does. Returned stock, both
   players' promotions, opponent wins and retired kittens remain in the state.
   Graduation choices are decision nodes owned by the choosing player, even when
   they interrupt the other player's turn; resolving them costs no search ply.
2. **Stronger search.** Remove the priority cascade which discarded moves before
   search. Rank all legal children, iterative-deepen alpha-beta, and prioritize
   previous best/transposition moves. Store correct upper/lower/exact bounds and
   publish only completed iterations. Keep a legal static fallback. Evaluate
   permanent cat inventory, position, and unblocked three-cell line potential.
3. **Bounded, responsive execution.** Warm a module Web Worker at game creation.
   Search immediately in parallel with the previous animation. Publish when
   search is ready and elapsed time reaches max(400ms, shared animation budget). Off-board walks
   remain independently cosmetic; drops, boops and graduations finish first. Share an 850ms budget across a reply's
   placement/choices. Search checks a monotonic clock between nodes and children;
   the client watchdog falls back at 950ms on worker failure/overrun. Reset,
   leave and unmount terminate the worker and invalidate stale responses.
4. **Validate, then make strongest the default.** Grandmaster now means adaptive
   search up to depth 12, not an unbounded fixed-depth promise. Existing easier
   levels retain smaller depth ceilings with the same maximum time. The selector
   shows a short name with its description below, avoiding clipped phone labels.
   The home screen's primary Play vs Bot action starts Grandmaster immediately,
   with a saved name or Player; optional setup remains under Bot settings.
   Server connecting/error state does not block either local entry point.

## Original search evidence — 2026-10-21

- Seven bot regressions: immediate cat-line win, blocking the opponent, avoiding
  booping an opponent into victory, all-eight-cats win, choosing a graduation,
  tiny-budget legal fallback and input immutability, finished/wrong-turn guards.
- Existing client/server rules tests pass (21 and 16 respectively).
- **12/12 wins** against the pre-change Hard bot (depth 3), using six seeded
  openings, each played as both colours. Four random opening placements, actual
  rule transitions for both engines, 180-ply cap. New engine budget 850ms.
  Across 126 searched placements: median 850.02ms, p95 850.07ms, max 858.95ms;
  median completed depth 3, max 4. Deadline variation can change later games.
- Reduced 150ms trial versus pre-change Normal depth 2: 11 wins, 0 losses,
  1 game hitting the ply cap. 199 placements, max 150.15ms.
- Chrome/Vite actual worker round trips: six distinct opening replies around
  850–851ms, main-thread 10ms timer advanced 510 times. Cancellation and failed
  worker creation verified. Responsive lobby checked at 1440, 1024, 896, 768,
  640, 639 and 390px. Actual React-hook reply: **856.8ms**; reset and leave
  during thinking both prevented stale board updates. These original hook times
  precede the animation gate; worker search times remain valid.

This is evidence of a large improvement over the previous bot, not solved Boop,
a human rating, or an exhaustive tactical guarantee. Ordinary browser scheduling
can delay callbacks in suspended/background tabs or overloaded devices; a web app
cannot promise a hard real-time deadline there. Very slow devices may complete
less depth or use the legal fallback. Wins can return early.

## Entry points

- `npm --prefix client test` — rules and tactical regressions.
- `npm --prefix client run build` — production worker bundle and type check.
- After verifying Vite with `devports`, set `BOOP_TEST_URL` and run
  `npm --prefix client run test:bot:browser` — real worker, hook and lobby tests.
- `npm --prefix client run bench:bot` — paired search baseline by default.
  `BOOP_BENCH_PAIRS`, `BOOP_BENCH_BUDGET`, `BOOP_BASELINE_DEPTH` customize it.
  `BOOP_LEGACY_MODULE` may name a pre-change module copied beside its original
  dependencies in a separate checkout. Legacy engine isn't shipped in the app.

## Limits and next strength work

The simple evaluator and clone-based rule engine typically complete depth 3–4.
Further strength work should first optimize measured transition/evaluation costs
and test a larger tactical corpus, then compare selective extensions, symmetry
caching or learned evaluation on paired matches. Do not conflate a larger depth
ceiling or "Grandmaster" label with established grandmaster strength.

## Animation handoff adjustment (clarified)

The 400ms requirement is a minimum TOTAL elapsed time, not an added pause.
Worker search starts immediately. Publishing waits until search is ready and
`max(400, animationDurationMs(previousMove))` has elapsed. Search, minimum wait
and animation overlap; there is no pre-search pause or post-animation margin.
Off-board walks remain independent. Reset, leave and unmount cancel pending
publication and searching. Longer boop/graduation animations can still make the
visible reply exceed one second. Tests reject adding 400ms to normal replies
or animation budgets.

Corrected browser measurements: normal reply 856.7ms (no added 400ms),
boop handoff 3607.7ms against its 3600ms animation gate. Build, 29 client
tests and browser lifecycle checks passed.
