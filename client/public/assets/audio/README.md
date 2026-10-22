# Win voice

`win-meow.mp3` is the bundled celebratory deep-voice “Meow! Meow! Meow!”
recording. It replaces the perspective-dependent win/lose tones for every win.
Three emphatic calls with short pauses and wider pitch modulation make it a
cheer rather than a flat announcement. Pitch is baked into the recording so the
browser does not need an installed speech voice or a speech service.

Generated on macOS with the Alex voice at 155 words/minute, using speech
commands `pbas 45`, `pmod 65`, `emph +` before each call and 100ms pauses.
Source sample rate: 22050Hz. FFmpeg processing: `asetrate=17640`,
`aresample=44100`, `atempo=1.2`, `loudnorm=I=-16:TP=-1.5:LRA=7`.
Encoded as 128kbps MP3. No external voice service or runtime TTS dependency.

The sound manager preloads and decodes the asset, unlocks Web Audio on user
interaction, and uses the existing mute and volume settings. `useWinSound`
announces either winner once after 500ms, re-arms when game-over clears, and
cancels pending playback on reset/unmount. Browser regression coverage is in
`client/tests/winSound.browser.cjs` (set `BOOP_TEST_URL` to a verified Vite server).
