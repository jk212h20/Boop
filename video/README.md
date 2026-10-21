# Boop rules explainer

A local/private, 1080p motion-graphics rules explainer based on `../Boop Instructions - Extracted Text.txt` (Scott Brady / Smirk & Dagger, 2022). This is a fan-made teaching aid, not publisher artwork or an official rules video.

## Direction

Cream paper, plum typography, a stitched six-by-six pastel quilt, orange and slate pieces. Kitten/cat silhouettes have different sizes and chest markings. An invariant overhead board keeps directions and destinations unambiguous. Each example proceeds through before → place → boop → after, then holds for the explanation. Warm reference-conditioned Breeze narration; quiet original three-note chapter cues, no continuous music competing with dense rules. All gameplay imagery is deterministic: neither Krea nor H3 is needed to invent potentially inaccurate board states.

17 chapters cover setup, placement, all adjacent pushes, edges, blocking, no chain reactions, graduation, the pool, adult strength, mixed rows, eight-piece option, choosing among groups, both wins, recap, and the optional junior variant. Burned-in sentence captions and a separate SRT provide accessible review. Caption timing is sentence-weighted, not word-forced alignment.

## Ownership / reproduction

This production belongs with Boop's authoritative rules and Git repository, not a new cross-project rendering service. `script.json` owns the narration and chapter text. `render.py` is a project-specific PIL/FFmpeg adapter, not a supported general motion-graphics API. The supported Breeze Studio owns speech generation; `voice.cjs` drives its public browser form, input preview, visible progress and IndexedDB history. Every later line is conditioned on the same synthetic intro voice, never a real person's recording.

Dependencies: Boop's installed Playwright and Chrome; Pillow/NumPy; `/opt/homebrew/bin/ffmpeg`; Breeze Studio managed by `studio`; the installed local Nemotron benchmark runtime for independent ASR. Do not import private code from another project's virtualenv: the executables are explicit tools and the scripts use public package APIs.

- Start Breeze through `studio up breeze-tts`, check `devports` ownership and `/health`.
- Generate the intro using `LIMIT=1 node video/voice.cjs` under pi-bg.
- Independently transcribe the intro using `video/asr.py` and verify the words before generating the remaining reference-conditioned lines.
- Generate remaining lines with `node video/voice.cjs` under pi-bg. Existing WAVs are resumably skipped. To repair a defective line, remove its WAV and ASR record, then rerun; don't keep alternate deliverables.
- Run `python3 video/test_rules.py` for exact move destinations and row/piece assertions.
- Run `video/render.py --stills` for before, after and graduation inspection; run without the flag for the MP4. Use pi-bg for both.
- Final artifacts and browser history screenshots are in gitignored `outputs/`. Review `QC.md` for actual validation results.

Breeze TTS 2 self-hosted outputs are restricted by its model license to research/non-commercial use. This personal explainer must not be treated as commercial deliverable clearance. Director workflow informed by Serge Shima's CC-BY-4.0 video skill, https://github.com/smixs/visual-skills.

## New in-game TV cut

The TV now uses the separate [cozy 2:04 cut](cozy/README.md), with actual game assets and an original continuous music bed. This original 4:16 master and its player remain intact.
