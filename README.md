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
