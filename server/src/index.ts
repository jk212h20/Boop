import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { RoomManager } from './rooms/RoomManager';
import { setupSocketHandlers } from './socket/handlers';

const app = express();
const httpServer = createServer(app);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Serve static files from client build (for production)
const clientPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientPath));

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Room manager instance
const roomManager = new RoomManager();

// Setup socket handlers
setupSocketHandlers(io, roomManager);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rooms: roomManager.getRoomCount()
  });
});

// API to get room info (for debugging)
app.get('/api/rooms', (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    const rooms = roomManager.getAllRooms().map(room => ({
      code: room.code,
      createdAt: room.createdAt,
      phase: room.game.getState().phase
    }));
    res.json({ rooms });
  } else {
    res.status(403).json({ error: 'Not available in production' });
  }
});

// Serve client for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Cleanup old rooms every 5 minutes
setInterval(() => {
  roomManager.cleanupEmptyRooms(30);
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
  🐱 Boop Server Started!
  ━━━━━━━━━━━━━━━━━━━━━━━
  Port: ${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  
  Ready to boop some kittens! 🐾
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
