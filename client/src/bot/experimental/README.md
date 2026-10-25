# Unpromoted fixed-work bot experiments

These are isolated research snapshots, not supported live opponents. The default
worker continues to import frozen `../BotAI.ts` (v4). No candidate should be
silently substituted under v4's identity or promoted based on one favorable batch.

Files intentionally retain self-contained search copies for controlled ablation.
This is experimental duplication, not an architecture for adding production bots.
Before maintaining another production engine, consolidate shared mechanisms with
version-preserving tests; never edit released v4 to make an experiment easier.

- PvsBot: exact narrow-window search experiment, no measured improvement.
- LmrBot: selective late reductions, 26–26–8 over all 60 measured games.
- PromotionBot: greater permanent adult value, marginal 11–10–3.
- GrowthBot: adult value plus less positional emphasis, 9–11–4.
- ThreatBot: one bounded horizon extension for detected direct cat-line threats.

All use canonical LocalGame transitions and 30,000 attempted transitions, including
re-search work. No timing-dependent choices. Run `npm run test:bot:candidates`.
Protocol, raw evidence, source hashes and outcome interpretation live in
`docs/BOT_SEARCH_EXPERIMENTS.md` and `docs/bot-experiments/` at repository root.
