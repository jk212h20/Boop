# Boop implementation audit — 2026-10-15

Audited baseline: `3a8b845` (working tree initially clean). The original audit commit added evidence and documentation only. See the repair addendum below for subsequent fixes; the remaining findings describe the audited baseline.

## Result and limits

The production client/server build succeeds. Behavioral correctness does not: **40 defect detectors reproduce current failures** (28 engine/handler/static detectors and 12 browser detectors). Some detectors exercise different consequences of one root cause, so this is not a claim of 40 independent root causes. Additional high-confidence source findings are separated below.

Scope: official rules as extracted in `Boop Instructions - Extracted Text.txt`; both game engines; local bot and tournament code; multiplayer rooms, lobby, credentials and handlers; React socket/bot/history hooks; current 3D renderer and animation integration; build/configuration. Not a proof that every bug has been found. No live Railway deployment, real MLFactory checkpoint, comprehensive mobile GPU matrix, or dependency security scan was tested.

Evidence labels:

- **D** — reproducible detector in `tools/audit/reproduce.ts`, exercising actual source with controlled fixtures, except explicitly marked static assertions.
- **B** — Chromium detector in `tools/audit/browser.cjs`, running actual React hooks/components via Vite. Socket acknowledgements and bot moves are controlled; most Game tests substitute the expensive 3D board, while the HDR failure test loads the real renderer.
- **S** — source-confirmed control-flow/interface defect, not independently reproduced in a live end-to-end game.

Severity: **Critical** = opponent impersonation or remotely triggerable server termination; **High** = incorrect winner, legal action missing, stuck/lost game or silent submission failure; **Medium** = incorrect search/history/animation or session lifecycle; **Low** = peripheral statistics/configuration defect.

## Fix these first

1. Remove reconnect secrets from public game state and validate socket payloads/optional acknowledgements before touching state.
2. Check wins before graduation and support all legal eight-piece graduation/retrieval choices.
3. Implement bot graduation choice; preserve complete game state in bot simulation.
4. Make room membership exclusive and reconnect slots truly reserved; preserve phase and inventory.
5. Add session-generation cancellation for queued network updates and delayed bot actions.
6. Make errors visible, bound socket acknowledgements and AZ response-body timeouts, and provide a local 3D environment/fallback.
7. Record authoritative move IDs, mover/type, and graduation-resolution events rather than inferring them from turn flips or object identity.

## Reproduced findings

### Rules and move validation

- **R01 — High, D: Graduation removes a winning cat line before the win check.** `server/src/game/GameState.ts:223–244`, `client/src/bot/LocalGame.ts:537–546,615–635`. A valid move pushes a cat into a three-cat line adjacent to a kitten. The mixed triple is removed first, leaving no winner. Multiple graduation options can likewise defer an already-earned win behind a selection dialog. Check terminal conditions on the post-boop board before any graduation.
- **R02 — High, D: Opponent wins created by your boop are ignored.** `GameState.ts:240`, `LocalGame.ts:631`. A cat placement can boop the other player's cat into three cats in a row, yet only the mover is checked and play continues. Check both players after motion; document the simultaneous-win policy separately.
- **R03 — High, D: Eight-piece graduation does not allow player choice or cat retrieval.** `GameState.ts:327–349`, `LocalGame.ts:408–425`. It automatically retires the first row-major kitten. The rules allow choosing any kitten, or returning any cat to the pool instead. The current UI/engine exposes neither choice.
- **R04 — High, D: A triple plus eight pieces omits the alternative single-piece action.** `GameState.ts:327–354`, `LocalGame.ts:406–435`. Existing triples bypass the eight-piece branch entirely, even when the player is expressly entitled to choose which rule to activate.
- **V01 — High, D: Arbitrary piece types bypass inventory validation.** `GameState.ts:200–217`, analogous branches in `LocalGame.ts`. `pieceType='dragon'` is accepted with zero cats available, stores an invalid piece, decrements cats to -1 and boops like a cat. This can also break `/assets/models/boop-${piece.type}.glb` loading. Enforce the runtime enum.
- **V02 — Medium, D: Noninteger board coordinates can throw instead of being rejected.** `GameState.ts:160,191–195`, `LocalGame.ts:88,579`. Range checks accept fractions and numeric strings; a fractional row accesses an undefined board row. Require integer numbers, not coercible range comparisons.
- **V03 — Medium, D: Invalid graduation indices can throw.** `GameState.ts:455–464`, `useBotGame.ts:174–187`. Fractions, NaN or omitted indices bypass range checks and supply an undefined option to the loop. Require integer numbers before indexing.

### Credentials and multiplayer lifecycle

- **S01 — Critical, D: Opponent reconnect credentials are public.** `GameState.ts:627–630`, all handlers broadcasting/returning `getState()`. Both `playerToken` values are copied into client-facing state. A player can read the opponent's token without guessing.
- **S02 — Critical, D: Rejoin can replace a connected opponent's socket.** `RoomManager.ts:142–151`, `GameState.ts:145–155`. The disclosed token can claim an online seat, blocking the legitimate opponent and authorizing the attacker to act as that color. Secure token-based refresh can be supported, but must not expose the credential or leave stale socket membership behind.
- **M01 — High, D: Disconnected seats are not reserved during grace period.** `GameState.ts:49–83`, `RoomManager.ts:87–105`. Any new joiner knowing the room code replaces the disconnected player immediately, changes the seat token, and prevents its owner from rejoining.
- **M02 — High, D: Replacement joins overwrite game phase.** `GameState.ts:65–67,81–83`. Joining sets `playing` unconditionally when both seats connect, cancelling `selecting_graduation` or reopening a finished game. Pending options/winner remain, so later updates can become internally inconsistent.
- **M03 — High, D: Cleanup deletes a room before both players' reconnect grace expires.** `RoomManager.ts:250–262`, `server/src/index.ts:79–81`. `bothDisconnected` has no age/grace test. The five-minute periodic cleanup can run immediately after a shared network interruption and delete a recoverable match.
- **M04 — Medium, D: Grace-period expiry does not revoke rejoin authorization.** `RoomManager.ts:229–237,142–151`. Cleanup removes only the disconnected-record entry, not the token in the game seat. The fallback token lookup then permits rejoining indefinitely while another player keeps the room alive.
- **M05 — High, D: One socket can occupy both seats.** `RoomManager.ts:87–101`, `GameState.ts:49–83,608–611`. Joining the same room twice seats the socket twice. Color lookup always returns orange, so gray cannot move and the game is stuck.
- **M06 — High, D: Joining a second room leaves a connected ghost in the first.** `RoomManager.ts:98`. `playerRooms.set` overwrites only the lookup, without leaving/removing the previous membership. Disconnect cleans only the last room; the first opponent sees a player who never disconnects or moves. Handlers also leave old Socket.IO subscriptions active.
- **M07 — High, D: Explicit leave corrupts replacement inventory and leaves an unfinished game.** `GameState.ts:103–113,49–63`, `RoomManager.ts:198–221`. Removing a seat leaves its pieces, turn and phase on the board. A replacement receives a fresh pool of eight in addition to inherited board pieces. Without a replacement, the game can stall permanently on the departed player's turn. Define abandonment/replacement semantics explicitly.
- **M08 — High, D: Quick-match games cannot reconnect by token.** `handlers.ts:409,413`, `LobbyManager.ts:4–9`. Both match seats are joined without the token even though the client saves an active game and later uses token-based rejoin.
- **M09 — High, D: A player can quick-match against themselves.** `handlers.ts:389–414`. No `opponentId !== socket.id` guard; this creates the duplicate-seat failure. The normal waitlist hides self, but the wire endpoint accepts it.
- **M10 — Medium, D: Entering the lobby does not leave the old Socket.IO room or notify the opponent.** `handlers.ts:351–361`. The room-manager seat is removed but `socket.leave` and `player_left` are omitted. The old opponent keeps stale state; the lobby participant still receives broadcasts for the old game.
- **M11 — Critical, D: Omitted acknowledgement callbacks escape the catch and can terminate the server.** `handlers.ts:43–63` and analogous handlers. Socket.IO permits emitting events without an acknowledgement. The handler calls undefined `callback`; its catch calls it again, producing an uncaught exception. The in-process harness reproduces the escaping exception; no production server was deliberately crashed.
- **M12 — Medium, D: Socket replacement leaves the old room/token mappings and subscription behind.** `RoomManager.ts:132–134,148–150`. Rejoin updates the new socket but does not revoke the old socket mapping. The old socket still passes the room lookup and remains a state subscriber even though it no longer controls a seat. This also leaks mappings across repeated refreshes.

### Local bots and search

- **B01 — High, B: Local bot graduation choice deadlocks.** `useBotGame.ts:48–85,157–170`. When `executeMove` returns `selecting_graduation` for gray, the bot never selects an option; the human selector rejects gray's selection. Both sides are blocked.
- **B02 — Medium, D: Search simulations discard graduation choice.** `LocalGame.ts:406–435,537–556`, `BotAI.ts:473–510`. Multiple-option moves retain the pre-graduation board but expose neither pending options nor graduation status. Search treats them as ordinary turn changes, misses tactical graduation value, and evaluates an impossible successor position.
- **B03 — Medium, D: Search successor state loses inventory changes.** `BotAI.ts:473–510`. Opponent booped-off pieces are counted but never returned to their simulated pool. Moving-player `kittensRetired` also remains stale. Search omits legal replies and can suppress later eight-piece graduation; its state no longer matches either engine.
- **B04 — Medium, D: Defensive filtering is not a defense check.** `BotAI.ts:529–557` (similar graduation blocker at 575–603). It accepts moves occupying cells where the opponent could win without checking the resulting board. An orange cat played in a purported blocking cell can itself boop gray into the winning line. It also excludes genuine defenses at other cells before search begins.
- **B05 — Low, D/static assertion: Configured boop weights do nothing.** `bot/types.ts:44–45,70–71`, `BotAI.ts:413–469`. `ownPieceBoopedOff` and `oppPieceBoopedOff` are never read by BotAI. Tournament Aggressive variants advertise effects they cannot have. Move ordering uses a hardcoded 200 instead.
- **B06 — Medium, D: Clone drops graduation-selection metadata.** `LocalGame.ts:31–45`. A cloned state keeps `phase='selecting_graduation'` but loses both pending options and pending player. Current human selection separately saves the options before cloning, so that path avoids an immediate crash; the helper itself is not a valid clone of GameState.
- **B07 — High, B: Old bot actions overwrite a reset/new game.** `useBotGame.ts:56,92–106,148–150,238–251`. The animation-delay timer is not tracked; starting/resetting a game cancels neither it nor an existing thinking timer. A delayed callback holds the old board but reads the new bot instance and writes its old match into the new match. End-then-start quickly has the same hazard.
- **B08 — Medium, D: Evaluation configuration changes retain stale transposition scores.** `BotAI.ts:716–718`. `setConfig` updates scoring weights without clearing the persistent table. The next search can return scores computed under the previous configuration.

### Network client, history, renderer

- **A01 — High, B: AZ failures are silently ignored by the client.** `azGameRunner.ts:49–62,70–81,89–95`, no `az_error` listener in `useSocket.ts`. The pump returns with the turn still held by AZ; the user sees an endless opponent turn rather than the actual failure or retry path.
- **A02 — Medium, D: AZ schema accepts invalid coordinates/indices.** `azClient.ts:114–130`. Fractions, Infinity and NaN pass typeof/range validation. These reach the unsafe engine indexing rather than being classified as a malformed service response.
- **C01 — High, B: Active-game expiry is measured from join, not disconnect.** `useSocket.ts:46–62,183–229`. A match played for more than five minutes loses its recovery record even when disconnecting seconds ago. Automatic rejoin does not refresh the saved timestamp either.
- **C02 — Medium, B: Game-over handling bypasses queued winning-move animation.** `useSocket.ts:256–267`. Its delay includes only the currently applied update's deadline, not queued updates. When a fast opponent wins while the prior move animates, `game_over` writes the final state/banner before the queued winning move has completed; intermediate updates can later overwrite it.
- **C03 — High, B: Queued updates/timers survive leave.** `useSocket.ts:143–168,258–267,588–601`. Leave clears React state, but not updateQueue, deadlines or scheduled callbacks. An old match's update can resurrect state after leaving or overwrite a newly joined match. Snapshot/rejoin/unmount paths similarly do not invalidate queued work.
- **C04 — High, B: Successful auto-rejoin can leave the user on the menu.** `useSocket.ts:187–220`, `App.tsx:18,65–89,231–272`. The hook restores `roomInfo` and writes the hash, but never changes App's independent `gameMode`. When roomInfo is already present, App's hash/URL rejoin paths do not set online mode. Reproduced with a saved session and initially empty hash.
- **H01 — Medium, B: History start is overwritten with the live board.** `useGameHistory.ts:48–52`, `Game.tsx:93`. The hook receives `gameState.board` every move and resets its initialBoardRef whenever that board changes. “Go to start” shows current pieces rather than the starting board.
- **H02 — Medium, B: Pending-graduation moves are attributed to the opponent.** `Game.tsx:189–191`. It assumes every state update flips the turn. Selection states deliberately keep it on the mover, so the recorded mover is inverted. Local and server terminal states also differ in whether currentTurn flips.
- **H03 — Medium, B: Chosen graduations are missing from recorded history.** `Game.tsx:187–228`. The recording effect depends only on `lastMove`; resolving a selection retains that same cell object, so the entry remains pre-graduation with incorrect board/pools. Conversely, serialized network snapshots allocate a new lastMove object and can create a duplicate placement record for selection/reconnect/game_over.
- **H04 — Medium, B: Rematches retain the prior match's history.** `Game.tsx:93,187–228`, `useGameHistory.ts:123`. Rematch updates the same mounted Game component; clearHistory is never called and no session key remounts it. Old moves remain navigable alongside the new match.
- **U01 — High, B: External HDR failure crashes the game without fallback.** `FloatingBoard3D.tsx:183,195`, Drei `core/useEnvironment.js:9,21–24`. `Environment preset='apartment'` requires a raw.githack.com asset even for local/offline bot play. A failed fetch throws through the shared Suspense boundary; there is no error boundary, local environment, or playable fallback. The board and action UI disappear on failure.

## Additional source-confirmed findings (not included in the 40 detectors)

- **S03 — High, S: No runtime validation of names, tokens or other payload shapes.** `handlers.ts:43–63,139–174,178–205,355–369`; `RoomManager.ts:113–137`. TypeScript annotations do not validate network input. For example an object supplied as playerName to join_lobby is stored/broadcast, and QuickMatchLobby renders player.name directly as a React child, which throws. Nonstring room codes/tokens throw in `toUpperCase`/`slice`. Validate bounded strings, enums and required object fields at the boundary.
- **C05 — High, S: Socket actions have no acknowledgement deadline or disconnected guard.** `useSocket.ts:339–705`. They test socketRef existence, not `.connected`, and use bare emit callbacks. During outages, actions buffer indefinitely and Promises never resolve/reject; a stale placement/create/leave may later execute after reconnect. UI spinners have no bounded visible failure.
- **C06 — High, S: Quick-match lobby is not rejoined after transport reconnect.** `handlers.ts:465–474`, `useSocket.ts:183–230,302–330,605–635`. Server disconnect removes its waitlist entry, while the client keeps `inLobby=true`; connect only attempts room recovery. Heartbeats do not re-add the player. They see a lobby where nobody can select them. The matched opponent's heartbeat is also never stopped in match_started.
- **C07 — Medium, S: Rejoin does not restore opponent-disconnected or game-over state.** `useSocket.ts:212–217,522–527`. It always clears both flags and gameOver irrespective of returned players.connected/phase/winner. A restored finished match has no result banner; a missing opponent is shown as an ordinary turn until another event happens.
- **C08 — Medium, S: Joining/creating a room does not remove lobby membership.** `handlers.ts:43–174`, `LobbyManager.ts`. Only select_opponent explicitly removes entries. A socket can be in a game and still selectable in the lobby; another match then moves its authoritative room mapping. Client UI normally serializes these paths, but buffered requests/multiple tabs/raw events are not constrained server-side.
- **A03 — High, S: AZ timeout ends at headers, not at the completed JSON body.** `azClient.ts:73–87,104–110`. fetchWithTimeout clears the abort timer as soon as fetch returns a Response. The later res.text()/res.json() can hang forever if a server streams headers but stalls the body. The stated total timeout is not implemented; each retry also gets a separate full timer.
- **A04 — High, S: AZ creation errors are swallowed.** `App.tsx:129–146`, `Lobby.tsx:92–100`. A missing AZ_SERVICE_URL rejects the hook Promise; App only logs it and resets gameMode. It neither sets a visible error nor rethrows, while Lobby treats onPlayBot as synchronous and has no loading/error handling. No meaningful acknowledgement is shown. Dependency readiness is also never probed before creating the room.
- **B09 — High, S: High-depth bot search blocks the browser main thread.** `useBotGame.ts:56–63`, `BotAI.ts:123–143`, `Lobby.tsx:17–19`. Delaying a synchronous depth-5/6 search with setTimeout does not move it off-thread. Advertised 5–30-second searches freeze rendering, controls and Leave Game. There is no worker, cancellation or time/node budget.
- **B10 — Medium, S: Tournament helpers treat graduation selection as a draw.** `BotTournament.ts:126–142`, `BotVsBot.ts:35–62`. Both loops run only while phase is playing and stop when the bot generates pending graduation. These are unfinished matches, not draws, so recorded draw rates and rankings are contaminated.
- **B11 — Low, S: BotVsBot win-condition statistics are always zero.** `BotVsBot.ts:62,94–95`. Every actual winner returns winCondition='unknown', while counters look for the two real condition strings.
- **B12 — Low, S: Per-bot thinkingDelayMs configuration is ignored.** `useBotGame.ts:85`, `bot/types.ts:52`. The timer always uses DEFAULT_BOT_CONFIG instead of the chosen bot configuration.
- **H05 — Medium, S: Graduated placements lose their actual placed piece type.** `Game.tsx:197–199`, `useSocket.ts:158–160`. Game infers pieceType from the already-post-graduation board; an absent placed cat defaults to kitten. The socket's authoritative update.lastMove.pieceType is discarded by the hook. History therefore misreports cat placements participating in mixed graduation.
- **H06 — Medium, S: Before-board snapshots go stale while viewing history.** `Game.tsx:253–255,394–405`. The animation effect returns before advancing prevBoardRef when browsing history. A move recorded while browsing can use a previous turn's boardBefore; returning live can replay stale effects and produce wrong graduation restorations.
- **U02 — Medium, S: Graduation queue duration is shorter than the actual animation.** `useSocket.ts:20`, `Game.tsx:243–248,373–384`, `useBotGame.ts:10,148,231`. Graduation lasts 1100+800+600=2500ms, but online serialization waits 1900ms and local bot handoff waits 1200+800=2000ms (selection handoff only 800ms). The next state cancels old timers before removal/fly-to-pool clears, causing stale overlays or truncated animations. Even the flying transition is 700ms while cleanup is 600ms after it starts.
- **U03 — Medium, S: Graduation restores the wrong piece identity after booping.** `Game.tsx:306–313`. It looks up the destination cell on the *pre-boop* board, then defaults to a kitten. A cat booped into an initially empty graduation cell is displayed as a kitten. Reconstruct the post-boop/pre-graduation board from effects and authoritative placement, or transmit graduation piece data.
- **U04 — Medium, S: CatActor removal shrinks immediately instead of over the removal phase.** `FloatingBoard3D.tsx:68,73,92–95`. Scale uses elapsed since placement/boop began. Setting removing after roughly 1900ms does not reset born; `1-elapsed/.65` is already negative. Start a separate removal clock.
- **U05 — Medium, S: Boop animation clocks restart on unrelated scene rerenders.** `FloatingBoard3D.tsx:73,138–141,167,178`. boopTo and fallen boop props allocate fresh objects; CatActor's effect depends on that object identity. Hover/phase changes reset elapsed and can restart hops or hold pieces at their old positions.
- **U06 — Medium, S: Graduation fly-to origins are a fake 2D grid, not projected 3D cells.** `FloatingBoard3D.tsx:199–201`, `index.css:44`, `Game.tsx:342–354`. Orbit/zoom/floating motion changes the actual screen positions, but data-cell anchors remain a uniform fixed grid. Celebration pieces visibly launch from unrelated positions. Project each scene cell into screen coordinates.
- **U07 — Medium, S: 3D board accepts clicks regardless of enabled state or phase.** `FloatingBoard3D.tsx:122,158–162`, `Game.tsx:95,431–445,637`. enabled affects cursor/color only, while every quilt click calls onCellClick; Game checks only currentTurn. Clicking occupied cells or after terminal state can submit invalid actions. Local hooks return false instead of rejecting, and Game ignores that boolean, so some clicks fail silently.
- **U08 — Medium, S: 3D board has no keyboard/screen-reader playable cells.** `FloatingBoard3D.tsx:193–201`. Quilt cells are WebGL meshes; DOM anchors are aria-hidden and noninteractive. There is no accessible grid, focus target, coordinate label, or keyboard placement path. Pool buttons also have visual-only unlabeled icons. This prevents keyboard-only users from playing.
- **U09 — Low, S: History highlight prop is dropped by the new renderer.** `Game.tsx:645`, `FloatingBoard3D.tsx:160`. highlightedCell is passed but never used; Scene only highlights lastMove, which Game sets null during history. Selected history placements cannot be identified on the board as intended.
- **O01 — High for local multiplayer, S: Development socket endpoint is hardcoded to localhost:3001.** `useSocket.ts:5–7`, `vite.config.ts:8–15`. Client bypasses the relative Vite proxy. On a phone/LAN peer localhost points to that peer, not the game host; choosing another free backend port also breaks it. On this machine port 3001 is actually owned by ChessRTS, not Boop. No existing listener was modified. Use a configurable backend or same-origin proxy and verify ownership with devports.
- **O02 — Medium, S: Room cleanup uses creation age rather than last activity and does not sweep membership maps.** `RoomManager.ts:241–263`. A connected waiting host loses its room after 30 minutes regardless of activity; deleteRoom removes only rooms, leaving socket/token entries. The client receives no expiration notification, and synthetic AZ player mappings accumulate when such rooms are deleted. Finished abandoned AZ rooms also stay alive because the synthetic player is permanently connected; the general room age condition applies only to waiting games.

## Rule questions and non-bug risks

- The supplied rule text specifies choice for overlapping/connected triples, but is not explicit enough here to certify the treatment of two **disjoint** triples or simultaneous wins. Each player resolves at most one graduation group per move (the "choose which group of 3" rule), and both players are checked on the post-boop board (see the 2026-10-20 addendum). Any new tie/disjoint-line policy should be verified against the publisher's complete FAQ rather than guessed.
- Missing rate limits, unbounded room creation, lack of durable server state, open room-code discovery space and lack of a comprehensive test suite are important hardening/operational risks, but not counted above as independently demonstrated game defects.
- The eight-piece reserve condition double-counts retired kittens plus catsInPool. In a legal eight-on-board position catsInPool must be zero, so that predicate alone was **not** counted as a distinct reachable bug. Incorrect simulated retirement totals in B03 can make it consequential.
- Both engines' radial boop loop passes the simple reasoning check: outgoing rays do not collide with each other's adjacent/destination cells, so sequential processing alone is not evidence of a boop-order defect. Cats' immunity to kittens, blocked pushes, off-board returns, and no chain reaction are implemented in the expected branches.
- The build is verified locally, not deployed. No push or deployment performed.

## Reproducing the audit

From the repository root, engine/handler detectors use the existing server tsx installation:

```sh
server/node_modules/.bin/tsx tools/audit/reproduce.ts
```

The browser script uses Playwright and installed Chrome, without adding an undocumented application dependency. Set PLAYWRIGHT_MODULE to an existing documented installation (or install Playwright in your own QA environment); BOOP_AUDIT_URL must point to this repository's **verified Vite development server**. The script intercepts socket traffic, serves an in-memory React harness and intentionally aborts the external HDR asset. It does not submit games to production or need the multiplayer server. On this machine the QA installation is `/Users/nick/ActiveProjects/KillTony/node_modules/playwright`, per the machine tool registry.

Launch Vite using devports inside a registered pi-bg everlasting job, verify the listener, then execute the browser script in a bounded background job with those two environment variables. Stop the audit-only Vite listener afterward. See global devports/pi-bg rules for lifecycle commands.

**These scripts are defect detectors, not a green correctness suite.** Their assertions intentionally confirm broken current behavior. Once an issue is fixed, replace its detector with a positive rule/lifecycle regression rather than treating an assertion failure as a regression in the product. The B05 detector is an explicit source assertion; B08 checks cache invalidation behavior. Hydrated engine fixtures maintain legal eight-piece inventories; selection fixtures can contain preexisting lines to isolate the transition, not to claim a complete generated match replay.

Validation at original audit completion: production build passed, all 28 engine/handler/static detectors completed, all 12 browser detectors completed. The audit-only server was stopped. Application code was unchanged at that point.

## Repair addendum — phantom ungraduated kittens (2026-10-15)

Nick reported seeing three kittens in a row with no graduation. A controlled positive browser regression reproduced **three visible orange kittens while the authoritative LocalGame board held three empty cells and the player had already earned three cats**. A no-boop opponent response at about two seconds cancelled the previous 2500ms graduation cleanup timer; the next effect did not clear animatingGraduations, so displayBoard kept restoring them indefinitely. This proves a rendering cause matching the report, not inspection of Nick's particular live match.

Fixes:
- Game resets old overlays on every live update/history transition, even when the prior completion timer was cancelled. Both a plain reply and a boop-only reply must remove stale graduating pieces.
- One client timing contract now governs Game, socket serialization and local bot handoff: 2700ms for graduation, covering highlight, 650ms 3D removal, 700ms fly-to-pool and a buffer. Bot replies after selected graduation also wait for completion. This addresses U02 plus the newly reproduced stale-overlay consequence.
- The 3D actor has a separate removal-phase clock (U04) and keys its boop clock to source coordinates rather than transient prop-object identity (U05). Those two renderer changes are type/build checked; the positive overlay regression intercepts the renderer boundary and does not claim visual GPU validation of its scale curve.
- History viewing advances prevBoardRef while retiring overlays (the stale before-board component of H06). Returning from history may still replay an update's effects; the broader history audit findings remain open.

`tools/audit/graduation-regression.cjs` is a **positive correctness test**, unlike the original defect detectors. It checks normal three-kitten graduation and cat awards, interruption by both plain and boop-only updates, reset overlay isolation, and shared timing. It failed on the original stale display board and passes after the fix. Production build and the existing audit detectors were also rerun; their unrelated findings remain unresolved. No graduation-rule policy was changed and no deployment was performed.

## Repair addendum — rules correctness (2026-10-17)

Commit `a694a06` fixed the stale previous-game review board (a new game showed
an old board, e.g. two kittens, when rematch happened while parked in history
view): `Game` is now keyed per game identity and `useGameHistory` stops
accepting live-board "initial" updates after moves are recorded.

This addendum fixes the reproduced rules findings R01–R04, V01–V03 and B01 in
BOTH engines (`server/src/game/GameState.ts`, `client/src/bot/LocalGame.ts`):

- **R01**: the win check now runs on the post-boop board BEFORE graduation, so
  a `Cat Cat Cat Kitten` line wins instead of the graduation consuming two
  cats of the winning line. Graduation can no longer destroy a win.
- **R02**: the post-boop win check covers both players. A placement that boops
  the opponent's cats into a line ends the game with the opponent as winner.
  If both players complete a line on the same motion, the mover wins
  (active-player precedence) — a documented policy choice, per the
  rule-question note above.
- **R03/R04**: the all-8-on-board graduation now offers every on-board kitten
  as its own single-piece option, alongside any line options (the
  "choose which you would activate" rule), instead of force-retiring the
  first row-major kitten. Declining entirely is still not offered: with the
  pool empty the player would have no legal placement next turn.
- **Line of two (corrected 2026-10-20)**: the earlier interpretation
  incorrectly protected separated pieces anywhere along the push ray. This
  caused an adjacent kitten to remain still despite an empty destination.
  Both engines now block only an occupied destination; a separated pair is
  not protected. Color does not affect a kitten-to-kitten boop. Regressions
  cover adjacent pairs, separated pairs, and simultaneous own/opponent pushes.
- **V01–V03**: runtime piece-type enum and integer coordinate/option-index
  validation in both engines' move and graduation entry points.
- **B01**: the local bot resolves its own pending graduation choice
  (`applyBotGraduationChoice`, most kittens graduated first), and
  `cloneGameState` no longer drops `pendingGraduationOptions` /
  `pendingGraduationPlayer` — previously any clone of a
  `selecting_graduation` state lost the options.
- `simulateMove.wins` means "the mover wins"; opponent wins are surfaced as
  `opponentWins` so bot search does not chase moves that hand the opponent a
  line.

Regression tests: `server/tests/rules.test.ts` (10) and
`client/tests/rules.test.ts` (8), run with `npm test` in each package. All
pass; typecheck clean in both packages; appearance tests unchanged. The
remaining S/M/U findings are untouched. Not deployed.

## Repair addendum — graduation for the booped player (2026-10-20)

Nick reported that the bot booped his kittens into a row of three and they did
not graduate. Both engines only ran the graduation check for the player who
moved, even though the same post-boop board was already checked for the
opponent's winning cat line (R02). A boop that lines up the opponent's kittens
therefore left them in a three-in-a-row with no graduation.

Fixes, mirrored in `server/src/game/GameState.ts` and
`client/src/bot/LocalGame.ts`:

- After the boop, graduation is checked for BOTH players. Options are built on
  the post-boop board; the mover is resolved first, then the opponent (a
  graduation only removes that player's own pieces, so the order cannot change
  the other player's options).
- If the booped player has more than one group to choose from, the game
  enters `selecting_graduation` for them and the turn stays with the mover
  until the choice is made; the next turn always belongs to the player who did
  not move.
- The client bot game resolves a bot-side choice that a human move creates (and
  vice versa) through the shared `resolveGraduationChoice`, so no new state can
  deadlock. `simulateMove` models the opponent's auto-graduation so bot search
  sees the board the engine produces.

Regression tests: R05 (opponent line graduates for its owner), R06 (the booped
player chooses among several groups, turn held), R07 (one boop graduates both
players) in `server/tests/rules.test.ts` and `client/tests/rules.test.ts`.
Both suites pass and both packages typecheck. Not deployed.

## Repair addendum — presentation defects reported in play (2026-10-20)

All five were reported by Nick from playtesting after the graduation repair.

### 1. Three kittens of mixed colours were promoted

The graduation event carried only `{row, col}`. The client filled the removal
animation from `prevBoardRef` (the board *before* the move) and, when that cell
was empty, guessed the owner from a turn flip
(`currentTurn === 'orange' ? 'gray' : 'orange'`). A line made by a boop sits on
cells that were empty — or held the other player's piece — before the move, so
the promoted group could render in the wrong colour, and a single boop that
graduates both players stamped both groups with one player.

Fix: `graduatedPieces` is now `GraduatedCell[]` = `{row, col, piece}`, filled
where the piece leaves the board in both engines (`GraduatedCell` in
`server/src/game/types.ts`, `client/src/types.ts`). `Game.tsx` uses
`cell.piece` and does not consult a previous board. `useGameHistory` groups the
event by `piece.color`, so history attributes each group to its own player.
`resolveGraduationChoice` now calls the same `executeGraduationOption` as the
engine instead of duplicating the removal loop.

Regressions: R08 (a boop-formed line graduates only its owner and names the
piece; the cell it filled started empty) and R09 (one boop, both players, each
group keeps its own colour) in both suites, plus R06b for a resolved choice.

### 2. The glow started late and popped on

`GRADUATION_DELAY_MS` was a fixed 3.5 s (the whole boop budget), and the glow's
scale pulse and point light started at full amplitude on their first frame.
`graduationDelayMs(effects)` now starts the highlight when the last graduating
piece actually lands (boop landing, or the placement drop) plus a 120 ms settle,
and `CatActor` ramps the glow in over 220 ms and keeps it lit through the rise,
fading it as the piece ascends. A rise-time unit bug (milliseconds divided by
0.7 instead of 700) made the ascent a teleport; corrected.

### 3. Booped-off pieces stopped near the top of the screen

The trip ended in a 0.35 s look-up and a screen-space icon hop that hovered
above the box. The run now flows into a crouch and a leap that carries the
piece out of the frame (`LEAP_CROUCH_S`, `LEAP_RISE_S`, `LEAP_HEIGHT`), and the
DOM arrival starts above the top of the viewport and falls into the portrait
(`InventoryJump`), so nothing waits in view. `FALLEN_TRIP_MS` is 7.5 s to cover
the longer trip; it still does not extend the move budget.

### 4. The bed's side panels were tilted and the corners had gaps

The four hanging drapes were rotated 5.7° outward, which leaned the left and
right panels and opened a seam at every corner. They are now square, the end
panels run the full width and the side panels tuck into them
(`fabricHalf`/`fabricWidth` in `BedShell`). The same shared extent drives the
footboard and the headboard, which previously floated outside the bed and were
narrower than it, leaving an angled wedge of floor at each corner when the bed
was viewed from above; the rails that must meet the bedspread at a right angle
are plain boxes, because a rounded box curves away from the corner.

### 5. Three in a row reset the viewing angle

`FrameBoard` framed the camera from whatever position it found, so a rebuilt
canvas (a model finishing loading, a re-mount) came back at the default angle.
The chosen orbit is now remembered (`boop-board-view` in localStorage, read
through a module cache so a re-mount is instant) and restored on mount; only a
first-ever visit uses the default view.

### Audit detectors

`tools/audit/reproduce.ts` and `tools/audit/browser.cjs` still asserted the
pre-repair behaviour for defects fixed since the audit. R01–R04, V01–V03, B06
(engine) and H01, C02, C03, B01, U01 (browser) are now positive regressions for
the repaired behaviour; the remaining detectors still confirm the defects they
document (28 engine/static + 12 browser). `tools/sol-vision.mjs` is the screenshot describer used for these
visual checks (hosted Sol 6.1 via `PPQ_API_KEY`); the local vision model was
misreading the board.


## One-second search repair — 2026-10-21

**B02 and B03 are repaired in the active local search.** The bot no longer
constructs successors from the lossy `simulateMove` return value: it uses the
live `executeMove` and `resolveGraduationChoice` transitions. Both inventories,
retired kittens, opponent wins and pending choices are preserved. Choices are
searched for their actual owner. The exported simulator remains for historical
tournament/diagnostic consumers; this is not a claim to repair that API.

Local play also moved to a deadline-bounded Web Worker with stale-result
cancellation on reset/leave/unmount, replacing untracked animation timers and
main-thread minimax. See [the implemented plan and evidence](BOT_PLAN.md) and
`client/tests/bot.test.ts` / `client/tests/bot.browser.cjs`. This addendum does
not close unrelated multiplayer, history, or experimental AlphaZero findings.
