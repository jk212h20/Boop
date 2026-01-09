import { BoopGame } from '../game/GameState';
import { v4 as uuidv4 } from 'uuid';

export interface Room {
  id: string;
  code: string;
  game: BoopGame;
  createdAt: Date;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // socketId -> roomId

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

    const room: Room = {
      id,
      code,
      game: new BoopGame(),
      createdAt: new Date()
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

  // Join a player to a room
  joinRoom(roomId: string, socketId: string, playerName: string): { success: boolean; color?: string; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const color = room.game.addPlayer(socketId, playerName);
    if (!color) {
      return { success: false, error: 'Room is full' };
    }

    this.playerRooms.set(socketId, roomId);
    console.log(`Player ${playerName} joined room ${room.code} as ${color}`);
    return { success: true, color };
  }

  // Remove a player from their room
  leaveRoom(socketId: string): { roomId: string; color: string } | null {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      return null;
    }

    const color = room.game.removePlayer(socketId);
    this.playerRooms.delete(socketId);

    if (color) {
      console.log(`Player left room ${room.code} (was ${color})`);
      return { roomId, color };
    }

    return null;
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
