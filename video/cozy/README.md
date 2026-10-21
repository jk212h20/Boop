# Boop — cozy game-night TV cut

A separate, shorter personal/research rules film. The original `../outputs/boop-rules.mp4` is preserved.

## Direction and ownership

Warm cream, rust, mustard and sage public-access-TV graphics. Rounded framing, a restrained moving camera for the opening/closing, stable elevated views for rule causality, large captions, and an original 92-BPM mellow FM-key/pad/bass score under reference-conditioned Breeze narration. No destructive tape noise, fake publisher endorsement, hosted production, or generative gameplay imagery.

The development-only `?rulesfilm` stage reuses the actual game CatModel, BedShell, QuiltCell, Room and fabric resources. `filmActors()` owns deterministic instructional positions; tests verify the key boops, blocking, strength contrast, graduation clearance, win fixtures and active-piece counts. CatModel's optional `filmTime` samples animation time explicitly rather than tying captured poses to capture speed. The stage cannot submit moves to a real game.

`script.json` covers the standard rules, including mixed rows, the eight-piece option, choosing one graduation, and both wins. The optional junior game is omitted to keep the standard tutorial focused; the full book/original film remain available.

## Reproduce locally

Run through registered pi-bg jobs:

1. `node video/cozy/voice.cjs` — Breeze Studio public UI, shared verified original synthetic voice reference, persistent history and input preview. Studio must be healthy on its assigned 7862 port; check studio/devports first. Outputs carry Breeze's noncommercial/research license restriction.
2. `python3 video/cozy/finish.py --prepare` — paced audio and exact chapter durations; enforce 120–180 seconds.
3. `node video/cozy/capture.cjs` — capture 24-fps native game-asset frames from the existing verified local Boop development server.
4. `python3 video/cozy/finish.py` — original music synthesis, graphics, burned-in captions, SRT, H.264/AAC, -18 LUFS target and -1.5 dBTP limit.
5. Run `asr.py` using the documented local Nemotron executable environment; `check.py` reports transcript differences and probes the encoded artifact. Human-equivalent listening or vision approval must not be inferred from these numeric checks.

Captions are sentence-length-weighted, not forced aligned. Instructional stages use normalized chapter beats; they are not word-exact choreography. Generated frames, WAVs, review stills and MP4 live in ignored `outputs/`. Keep only final deliverable/QC files once validated; remove captured scratch frames.

Workflow attribution: Serge Shima's CC-BY-4.0 director skill, https://github.com/smixs/visual-skills. Game rules: Scott Brady / Smirk & Dagger (2022), as extracted in the project authority.

The available still-image tool in this Pi session returns textual descriptions,
not native image pixels. Encoded stills and full-page screenshots were saved,
but numerical/browser checks must not be represented as direct visual approval.
