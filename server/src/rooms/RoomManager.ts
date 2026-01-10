import { BoopGame } from '../game/GameState';
import { v4 as uuidv4 } from 'uuid';

export interface Room {
  id: string;
  code: string;
  game: BoopGame;
  createdAt: Date;
  lastActivity: Date;
}

// Track disconnected players for rejoin within grace period
interface DisconnectedPlayer {
  roomId: string;
  playerToken: string;
  color: 'orange' | 'gray';
  disconnectedAt: Date;
}

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // socketId -> roomId
  private playerTokens: Map<string, string> = new Map(); // socketId -> playerToken
  private disconnectedPlayers: Map<string, DisconnectedPlayer> = new Map(); // playerToken -> disconnect info

  // Generate a friendly room code
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `BOOP-${code}`;
  }

  // Create a new room
  createRoom(): Room {
    const id = uuidv4();
    let code = this.generateRoomCode();
    
    // Ensure code is unique
    while (this.findRoomByCode(code)) {
      code = this.generateRoomCode();
    }

    const now = new Date();
    const room: Room = {
      id,
      code,
      game: new BoopGame(),
      createdAt: now,
      lastActivity: now
    };

    this.rooms.set(id, room);
    console.log(`Room created: ${code} (${id})`);
    return room;
  }

  // Find room by code
  findRoomByCode(code: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.code.toUpperCase() === code.toUpperCase()) {
        return room;
      }
    }
    return undefined;
  }

  // Find room by ID
  findRoomById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  // Get room for a player
  getPlayerRoom(socketId: string): Room | undefined {
    const roomId = this.playerRooms.get(socketId);
    if (roomId) {
      return this.rooms.get(roomId);
    }
    return undefined;
  }

  // Join a player to a room (with optional player token for rejoin support)
  joinRoom(roomId: string, socketId: string, playerName: string, playerToken?: string): { success: boolean; color?: string; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const color = room.game.addPlayer(socketId, playerName, playerToken);
    if (!color) {
      return { success: false, error: 'Room is full' };
    }

    this.playerRooms.set(socketId, roomId);
    if (playerToken) {
      this.playerTokens.set(socketId, playerToken);
      // Clear any disconnected state for this token
      this.disconnectedPlayers.delete(playerToken);
    }
    room.lastActivity = new Date();
    console.log(`Player ${playerName} joined room ${room.code} as ${color}`);
    return { success: true, color };
  }

  // Rejoin a room using player token
  rejoinRoom(roomCode: string, socketId: string, playerToken: string): { 
    success: boolean; 
    color?: string; 
    roomId?: string;
    error?: string 
  } {
    const room = this.findRoomByCode(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Check if this token has a disconnected player in this room
    const disconnected = this.disconnectedPlayers.get(playerToken);
    const now = new Date();

    if (disconnected && disconnected.roomId === room.id) {
      // Check if still within grace period
      const elapsed = now.getTime() - disconnected.disconnectedAt.getTime();
      if (elapsed < GRACE_PERIOD_MS) {
        // Rejoin as the same color
        const success = room.game.rejoinPlayer(socketId, playerToken, disconnected.color);
        if (success) {
          this.playerRooms.set(socketId, room.id);
          this.playerTokens.set(socketId, playerToken);
          this.disconnectedPlayers.delete(playerToken);
          room.lastActivity = now;
          console.log(`Player rejoined room ${room.code} as ${disconnected.color} (token: ${playerToken.slice(0, 8)}...)`);
          return { success: true, color: disconnected.color, roomId: room.id };
        }
      }
    }

    // Check if player token matches a currently connected player in the room
    const existingColor = room.game.getPlayerColorByToken(playerToken);
    if (existingColor) {
      // Already in the game - just update socket ID
      const success = room.game.updatePlayerSocket(playerToken, socketId);
      if (success) {
        this.playerRooms.set(socketId, room.id);
        this.playerTokens.set(socketId, playerToken);
        room.lastActivity = now;
        console.log(`Player reconnected to room ${room.code} as ${existingColor}`);
        return { success: true, color: existingColor, roomId: room.id };
      }
    }

    return { success: false, error: 'Cannot rejoin - session expired or slot taken' };
  }

  // Soft disconnect - mark player as disconnected but keep their slot reserved
  softDisconnect(socketId: string): { roomId: string; color: string; playerToken?: string } | null {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      this.playerTokens.delete(socketId);
      return null;
    }

    const playerToken = this.playerTokens.get(socketId);
    const color = room.game.disconnectPlayer(socketId);
    
    this.playerRooms.delete(socketId);
    this.playerTokens.delete(socketId);

    if (color && playerToken) {
      // Store disconnected player info for potential rejoin
      this.disconnectedPlayers.set(playerToken, {
        roomId,
        playerToken,
        color: color as 'orange' | 'gray',
        disconnectedAt: new Date()
      });
      console.log(`Player soft-disconnected from room ${room.code} (was ${color}, can rejoin for 5 min)`);
      return { roomId, color, playerToken };
    }

    if (color) {
      console.log(`Player disconnected from room ${room.code} (was ${color}, no token for rejoin)`);
      return { roomId, color };
    }

    return null;
  }

  // Hard leave - fully remove player from room (explicit leave, not disconnect)
  leaveRoom(socketId: string): { roomId: string; color: string } | null {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      this.playerTokens.delete(socketId);
      return null;
    }

    const playerToken = this.playerTokens.get(socketId);
    const color = room.game.removePlayer(socketId);
    
    this.playerRooms.delete(socketId);
    this.playerTokens.delete(socketId);
    
    // Clear any disconnected state for this token (they explicitly left)
    if (playerToken) {
      this.disconnectedPlayers.delete(playerToken);
    }

    if (color) {
      console.log(`Player left room ${room.code} (was ${color})`);
      return { roomId, color };
    }

    return null;
  }

  // Clean up expired disconnected players
  cleanupDisconnectedPlayers(): void {
    const now = new Date();
    for (const [token, info] of this.disconnectedPlayers) {
      const elapsed = now.getTime() - info.disconnectedAt.getTime();
      if (elapsed >= GRACE_PERIOD_MS) {
        console.log(`Grace period expired for token ${token.slice(0, 8)}... in room`);
        this.disconnectedPlayers.delete(token);
      }
    }
  }

  // Delete a room
  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      console.log(`Room deleted: ${room.code}`);
      this.rooms.delete(roomId);
    }
  }

  // Clean up old empty rooms (call periodically)
  cleanupEmptyRooms(maxAgeMinutes: number = 30): void {
    const now = new Date();
    for (const [id, room] of this.rooms) {
      const ageMinutes = (now.getTime() - room.createdAt.getTime()) / 1000 / 60;
      const state = room.game.getState();
      
      // Delete if old and not playing, or if both players disconnected
      const bothDisconnected = 
        (!state.players.orange || !state.players.orange.connected) &&
        (!state.players.gray || !state.players.gray.connected);
      
      if ((ageMinutes > maxAgeMinutes && state.phase === 'waiting') || bothDisconnected) {
        this.deleteRoom(id);
      }
    }
  }

  // Get room count
  getRoomCount(): number {
    return this.rooms.size;
  }

  // Get all active rooms (for debugging)
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
