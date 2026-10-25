# 🐱 Boop! - Online Multiplayer Game

A web-based implementation of the adorable board game **Boop** by Smirk & Dagger Games. Play online with friends!

## 🎮 How to Play

1. **Create or Join a Game**: One player creates a game and shares the room code
2. **Place Kittens**: Take turns placing kittens on the 6x6 quilted board
3. **Boop!**: Each piece placed pushes adjacent pieces one space away
4. **Graduate**: Line up 3 kittens in a row to graduate them into cats
5. **Win**: Get 3 cats in a row to win! (Or have all 8 cats on the board)

### Key Rules
- 🐱 **Kittens** can be booped by both kittens and cats
- 😼 **Cats** can only be booped by other cats
- Pieces can be pushed off the board (returned to your pool)
- Two pieces in a line cannot be pushed into each other

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+ 
- npm

### Setup

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies  
cd ../client
npm install
```

### Run Development Mode

Terminal 1 - Server:
```bash
cd server
npm run dev
```

Terminal 2 - Client:
```bash
cd client
npm run dev
```

Open http://localhost:5173 in your browser!

## 🌐 Deployment to Railway.app

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit - Boop game"
git remote add origin https://github.com/YOUR_USERNAME/boop-game.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to [Railway.app](https://railway.app) and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your Boop repository
4. Railway will auto-detect the configuration

### 3. Configure Environment Variables

In Railway dashboard, add:
- `NODE_ENV`: `production`
- `ALLOWED_ORIGINS`: Your Railway app URL (e.g., `https://boop-production.up.railway.app`)

### 4. Build the Client

Before deploying, build the client:
```bash
cd client
npm run build
```

The server will serve the built client from `client/dist`.

## 🎨 Real-time 3D presentation

The game board is rendered with React Three Fiber as a grounded oak-framed quilted
bed, with drag-to-orbit (zoom is deliberately off: the bed is framed to fill its
shell), a shadow-casting key light, a self-contained environment map (no CDN
fetch at runtime), a royal blue woven rug with contact occlusion, a bedside
table and its mirror across the bed, and responsive framing. The quilt is a
fixed palette of four light pastels — mint, butter, blush and sky — laid on the
diagonals so `row + col` picks the colour and no neighbour matches; the squares
run out to the bedspread's rim (there is no colour control). The kitten and grown-cat GLBs are authored locally in Blender and
recolored for each team at runtime. Kittens have enlarged baby heads; adults are visibly larger. The bed has an
upholstered headboard, side rails, legs, and a floor beneath it. Booped pieces
hop off the edge, land on the rug, trot to their team’s inventory selector at
close to full size, then hop into its portrait. That walk home is cosmetic and
runs on its own timer, so it never delays the next turn. No separate 3D reserve boxes are used. The bedside table carries a lamp you can switch on and the rules book; the
mirrored table opposite carries a box television whose screen opens the rules
explainer in a popup. A silver diamond-and-weave carpet begins just below the inventory selectors and extends
to the left, right, and bottom screen edges, not the top. Booped pieces
walk below their matching selector, then jump to its projected portrait center;
returned stock is available immediately when it leaves the bed; the return
walk and inventory flight never hold back the cat/kitten count. The transparent
canvas has no separate floor rectangle. On desktop the
scene spans beneath both inventories instead of being clipped to the board
column; soft white fill lighting replaces heavy cast/contact shadows. After a removed row ascends, three animated cats
jump down from above into the reserve box; single-piece graduations receive
one cat. The shared animation budget includes both ascent and arrivals.
The piece selectors render the same independently animated GLB models,
including their idle and blink clips. Their state-driven motion includes varied
idle breathing, placement drops, directional boop hops, landing squash, and
graduation glow and straight-up ascent. Both kitten and grown-cat models face toward the
initial camera. Cast-shadow strength is 0.5 and the under-board contact-shadow
opacity is 0.14 (half the original values), without dimming the scene lighting.

Player names have their own compact panel above two independent piece selectors.
Stocked selectors remain bright for both players, including while waiting for a
turn; only zero stock gets a gray empty state. Large counts and text labels show
availability, while selection remains restricted to your turn. Removed rows ascend vertically without a duplicate flying icon. The game uses a
1300px responsive grid with reserved 240px desktop pool columns; below 1280px
both pools sit above the board, and phone layouts put compact horizontal
selectors above/below it. The canvas follows its grid column rather than forcing
the player pools to shrink. Browser regressions check full-page geometry and
capture layouts from 320px through 1440px, including breakpoint transitions.

The placement cursor is a pale, translucent kitten labeled **Preview**, with no
cast shadow or pointer interception. Quilt squares use a procedural woven
albedo/bump texture, soft batting, and understated stitch lines; hover and
last-move cues preserve the fabric colors. **Quilt colors** below the board lets
you change both alternating fabrics (default: gray and muted sage). Changes are
instant, saved locally per browser, and can be restored with **Reset colors**;
they do not change game rules or the opponent's appearance preferences.

Appearance regressions:

```bash
npm --prefix client run test:appearance
```

For the browser regression, first verify a local Vite server with `devports`,
then set `BOOP_TEST_URL` to that server and run
`npm --prefix client run test:appearance:browser`. It uses the client's Playwright
dev dependency and installed Google Chrome, checks preview placement, both color
controls, reload persistence, reset, pool appearance/counts, and mobile layout, and writes screenshots
to `/tmp/boop-appearance-qa` (override with `BOOP_QA_DIR`).

Model source and rebuild instructions live in `tools/blender/README.md`.
Append `?preview3d` during local development to enter a deterministic bot game
for visual review without needing the multiplayer server.

## 📁 Project Structure

```
boop-game/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom hooks (socket)
│   │   └── types.ts        # TypeScript types
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── game/           # Game logic
│   │   ├── rooms/          # Room management
│   │   └── socket/         # WebSocket handlers
│   └── package.json
├── railway.toml            # Railway deployment config
└── README.md
```

### Stationary placement preview recovery

The board refreshes R3F hover while placement is enabled (at most ten times per
second), in addition to the immediate turn handoff refresh. A missed first
raycast or a departing actor must not leave the ghost absent until mouse movement.
This does not shorten the animation/input guard. Regression:
`client/tests/previewRecovery.browser.cjs`, with `BOOP_TEST_URL` set to the running
Vite origin; `BOOP_UNGUARDED=1` disables the recovery as a negative control.
It drops the first handoff refresh, holds the mouse still, checks recovery within
700 ms, persistence and clearing on exit across desktop/tablet/phone viewports.

## Versioned fixed-work AI

The default local opponent is now **Bot v4, standard**: a deterministic
30,000-transition-attempt search, not a wall-clock-limited opponent. Slower
machines finish the same work, even when that takes longer. Worker failure is
visible/retryable and never silently substitutes a weaker move. Source hashes,
weights, work definition, pair evaluation, golden replays, calibration and match
results are owned by [the v4 specification](docs/BOT_V4.md).
Post-v4 experiments and unfavorable results are recorded in
[search experiments](docs/BOT_SEARCH_EXPERIMENTS.md); candidates are not the default.
The [compact numeric backend](docs/BOT_COMPACT_ENGINE.md) reproduces v4 decisions
and enables measured larger-work experiments without changing the released bot.
[Capped-game analysis](docs/BOT_CAPPED_GAME_AUDIT.md) investigates exact loops and
experimental eight-cat progress valuation. The follow-up [durable progress plan](docs/BOT_PROGRESS_PLAN.md)
and [results](docs/BOT_PROGRESS_RESULTS.md) add an independent search oracle and
equal-work development/retention ablations.

The earlier timed-engine description below is historical, not the current contract.

### Previous one-second AI (historical)

The home screen's primary **Play vs Bot** button starts a game in one click,
using your saved name or “Player”; no server connection or setup form is needed.
**Bot settings** keeps the optional name/difficulty setup available, with
multiplayer as secondary actions.

Local bot play now defaults to **Grandmaster**, an adaptive alpha-beta search in
an independent Web Worker. It starts searching immediately (up to **850ms**) and shows its move once
search is ready, at least **400ms** have elapsed, and the preceding board animation
has finished. These waits overlap; no extra delay is added. It searches real rule transitions, including
both players' graduation choices, and keeps the board responsive. Other local
difficulties have smaller depth ceilings; experimental online AlphaZero is separate.

The new engine won **12/12 paired games against the previous Hard bot** in the
initial benchmark. This demonstrates improvement, not unbeatable play. See the
[implemented plan, measurements and test commands](docs/BOT_PLAN.md).

### Live move input and animation handoff

Logical turn ownership is not animation completion. `Game` keeps placement input
closed until the renderer acknowledges the current board's move, so a quick click
cannot replace the bot's drop/boops with the next human placement. The instruction
line acknowledges the short wait. Completion signals carry an animation epoch so
an old canvas frame cannot retire the incoming move. Placement unlock also
refreshes raycasting under a stationary pointer, restoring the cat preview without
requiring a mouse wiggle. Hidden-tab moves settle without replay on return.
The 400ms bot minimum is unchanged and is not used as proof of visible completion.

Browser regressions (against a devports-verified Vite server):

```bash
BOOP_TEST_URL=http://127.0.0.1:5173 BOOP_FAST_INPUT=1 node client/tests/botAnimation.browser.cjs
BOOP_TEST_URL=http://127.0.0.1:5173 node client/tests/eighthKitten.browser.cjs
BOOP_TEST_URL=http://127.0.0.1:5173 node client/tests/previewHandoff.browser.cjs
```

The first uses the real bot hook and rapid browser clicks, asserting every bot
placement has a full visible drop. `BOOP_UNGUARDED=1` removes the input guard only
in the test browser as a negative control. The second checks that an eighth kitten
with no cats automatically opens all eight promotion options without an extra
click, blocks the bot until selection, and produces one cat in the pool.

## Implementation audit

The [2026-10-15 audit](docs/AUDIT.md) documents reproduced rules, multiplayer,
bot, history, and renderer defects, with severity, source locations, evidence
scripts, and verification limits. Its repair addendum tracks the phantom-kitten
rendering fix; other findings remain open unless explicitly marked repaired.

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, Socket.io
- **Build**: Vite
- **Hosting**: Railway.app

## 🎨 Credits

- **Original Game Design**: Scott Brady
- **Publisher**: [Smirk & Dagger Games](https://smirkanddagger.com)
- **Web Implementation**: Built with ❤️

## 📄 License

This is a fan-made implementation for personal/educational use. 
Boop is © 2022 Smirk and Dagger Games. All Rights Reserved.

### Character polish (2026-10-21)

Both teams now use white/team-accent two-tone coats. Adults wear oversized
accent-framed sunglasses; kittens have open cartoon eyes and no glasses. Idles
include staggered curious glances, sleepy nods, ear flicks and eye-only blinks.
Tail poses are floor-safe across complete grounded animation loops. Three
winning cats dance in place after the move resolves; eight-cat victories
celebrate all winning adults. A compact top-center result replaces the old
layout-pushing banner, and finished games no longer invite placement.
Return hops end precisely on the matching inventory portrait, including mobile.
See `tools/blender/README.md` for implementation and regression entry points.

### Background tabs

Hiding the page cancels cosmetic phase timers and clears boop, graduation,
ghost, fallen-cat and inventory-flight overlays. Moves received while hidden
settle directly onto the canonical board; returning never replays those moves.
The 3D render loop stops while hidden, and idle rig motion uses bounded rendered
time rather than elapsed wall time. Game rules and bot state remain unchanged.
Regression: `client/tests/visibility.browser.cjs` with `BOOP_TEST_URL` set to a
devports-verified Vite server.

### Board-first promotion choices

Promotion selection leaves the board visible. Eligible kittens have gold rings;
line connectors select an entire three-piece group. Clicking a kitten/square
with multiple eligible options opens a small local chooser. The side card emphasizes collecting a completed line, with single-kitten choices
in a secondary disclosure. Keyboard focus previews its group; Enter selects.
Promotion resolution animates only the chosen graduation, never replaying the
preceding placement or boops even when state metadata retains them.
Choices appear only after the renderer acknowledges the full visible move budget,
reject duplicate submissions, and leave failures visible and retryable. Opponent
choices display a waiting status. Browser regression:
`client/tests/promotion.browser.cjs` with a verified `BOOP_TEST_URL`.

The browser regression `client/tests/stockAndDrop.browser.cjs` samples a real
worker bot's placement drop under a forced 700ms main-thread stall and verifies
both kitten and cat stock become
available while their cosmetic return walks are still running.

Live placement and boop clocks advance by rendered frames (at most 50ms per
frame), matching move settlement. Rendering stalls cannot consume the drop
before the player sees it; hidden-tab updates still settle without replay.
