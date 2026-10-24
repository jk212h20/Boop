# Frozen bot fixtures

Boop owns these test-only release artifacts. They are not bundled into live play.

- `BotAI.before.ts`: previous unversioned timed opponent copied from `130d26f`,
  with only import paths adjusted. Comparisons give it 850ms and depth ceiling 12;
  it searches its own graduation choices. Do not label this opponent v4.
- `v4-manifest.json`: complete standard config and SHA-256 hashes of runtime
  decision sources and canonical rules. Frozen initial v4 release, 30,000 nodes.
- `v4-golden.json`: 22 saved decisions and a 57-decision complete self-play replay.

Never regenerate an existing released version's manifest/expected decisions to
make a failing test pass. A decision-affecting change is a new version. For an
initial, unreleased candidate only, `tools/freezeBot.ts` requires explicit
`BOOP_FREEZE_CANDIDATE=1`. Keep the final release manifest in Git, and retain the
original version's source/config when adding successors.

Full contract and evidence: `docs/BOT_V4.md` at repository root.
