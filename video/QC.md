# Rules explainer review — 2026-10-20

## Rule coverage

Checked against the extracted publisher rules in the Boop root. Includes eight starting kittens each, off-board cat reserve, first-player selection, any empty square, both colors and all eight adjacent directions, occupied destinations, no chain reaction, edge return, kitten/cat push asymmetry, all row directions, mixed graduation, cats to the pool rather than the board, eight active pieces, full-bed single-piece alternative, choosing one of intersecting triples, both adult-cat win conditions, checks after pushes, and optional kitten-only junior game.

`test_rules.py`: four tests passing; every displayed push destination is independently recomputed from placement, adjacency, adult strength and destination occupancy. Graduate/win rows verified to contain three orange pieces after resolution. Eight-piece and eight-cat examples verified by count. Source examples intentionally use the current player's orange placement to make its own orange row, not an opponent placement portrayed as the current player's graduation.

## Review and repairs

Reviewed before/placement/movement/after frames from the rendered MP4 using local visual inspection tools. Large headings, board cells, pool labels and subtitles remain inside frame. Final review also samples the deliverable itself, not only PIL stills.

Repairs made before delivery:

- Setup originally illustrated kittens on the bed; moved them to named off-board pools and showed an empty quilt, with eight cats per player in reserve.
- Supporting text collided with a two-line caption in an early still; reserved a separate lower text zone.
- Graduation now leaves three empty highlighted squares and shows adult cats only in the available pool.
- Added phase labels so placement precedes boops; kitten/cat resistance uses a separate upper diagram from the lower adult push.
- Win banner originally crossed the bottom board row; moved it into the left-hand annotation column. Final master is a fresh render of the corrected source, not an alternate take.
- Mastered the voice track toward -18 LUFS and -1.5 dBTP; quiet original chapter tones remain below the voice.

## Narration validation

17 separately generated Breeze clips. First clip creates one synthetic narrator; all 16 subsequent clips are reference-conditioned on that same WAV/transcript, using the same seed and direction. Public Breeze Studio handles selected inputs, readable reference playback, visible generation progress and saved history; request settings and generated WAVs are retained locally.

Independent local Nemotron ASR validates every line. Remaining differences were punctuation and near-homophones: intro “Meet” → “Meat”, “piece you” → “PC you”, junior “the little push” → “a little push”. A second Whisper large-v3 check confirms “The piece you place” exactly in the booping clip. No dropped rule words or numerical substitutions found. No clipped samples in any source WAV, no non-silent clip below RMS 0.005; longest interior quiet run 1.1 seconds, most below 0.9 seconds. Per-clip results are in generated `outputs/audio-qc.json`.

Limits: these are transcript/acoustic checks, not a claim of human listening approval or perceptually proven speaker identity. Reference conditioning is consistent by construction but exact voice resemblance/naturalness deserves Nick's listening review. Captions use approximate sentence timings rather than ASR word alignment. No external/hosted media generation or analysis was used.

## Deliverable

Final corrected MP4 verified: 1920×1080, 24 fps, H.264/AAC, 255.75 seconds, 9,446,989 bytes. Encoded loudness is -18.17 LUFS integrated, -1.50 dBTP, 3.30 LU loudness range. Chrome successfully decoded the local player, found all 17 chapter controls, and sought into the eight-cat chapter. Encoded-frame review confirms all eight cats remain visible after moving the win banner out of the board. Matching SRT and chaptered local player included. Breeze outputs are for research/non-commercial use under the installed model license. Generated media is gitignored; source scripts and these review notes are maintained in the Boop repository.
