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
returned stock is held back until the return animation finishes. The transparent
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
