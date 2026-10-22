# Win voice

`win-meow.mp3` is one long female “Meeeeoooow” recorded with the macOS
Samantha voice at 90 words/minute. FFmpeg processing uses `atempo=0.5,atempo=0.65`
(to elongate without lowering the female pitch) and
`loudnorm=I=-16:TP=-1.5:LRA=7`, encoded as 128kbps MP3.
It replaces the earlier triple-meow cheer. No runtime speech service is needed.

The sound manager preloads and decodes the recording, unlocks Web Audio on
user interaction, respects mute/volume and suppresses hidden-tab sounds.
`useWinSound` announces either winner once after 500ms, re-arms on rematch,
and cancels pending playback on reset/unmount. Browser regression coverage:
`client/tests/winSound.browser.cjs` with a devports-verified `BOOP_TEST_URL`.
