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

The game board is rendered with React Three Fiber as a softly floating quilted
bed, with orbit/zoom controls, studio lighting, contact shadows, and responsive
framing. The kitten and grown-cat GLBs are authored locally in Blender and
recolored for each team at runtime. Their state-driven motion includes varied
idle breathing, placement drops, directional boop hops, landing squash, and
graduation glow/exit animation.

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
controls, reload persistence, reset, and mobile layout, and writes screenshots
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
