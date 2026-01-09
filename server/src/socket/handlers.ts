import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import { PieceType } from '../game/types';

export function setupSocketHandlers(io: Server, roomManager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new game room
    socket.on('create_room', (data: { playerName: string }, callback) => {
      try {
        const room = roomManager.createRoom();
        const result = roomManager.joinRoom(room.id, socket.id, data.playerName);
        
        if (result.success) {
          socket.join(room.id);
          callback({
            success: true,
            roomCode: room.code,
            roomId: room.id,
            playerColor: result.color,
            gameState: room.game.getState()
          });
        } else {
          callback({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error creating room:', error);
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    // Join an existing room
    socket.on('join_room', (data: { roomCode: string; playerName: string }, callback) => {
      try {
        const room = roomManager.findRoomByCode(data.roomCode);
        
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const result = roomManager.joinRoom(room.id, socket.id, data.playerName);
        
        if (result.success) {
          socket.join(room.id);
          
          // Notify the other player
          socket.to(room.id).emit('player_joined', {
            playerColor: result.color,
            playerName: data.playerName,
            gameState: room.game.getState()
          });

          callback({
            success: true,
            roomCode: room.code,
            roomId: room.id,
            playerColor: result.color,
            gameState: room.game.getState()
          });
        } else {
          callback({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error joining room:', error);
        callback({ success: false, error: 'Failed to join room' });
      }
    });

    // Place a piece
    socket.on('place_piece', (data: { row: number; col: number; pieceType: PieceType }, callback) => {
      try {
        const room = roomManager.getPlayerRoom(socket.id);
        
        if (!room) {
          callback({ success: false, error: 'Not in a room' });
          return;
        }

        const result = room.game.placePiece(socket.id, data.row, data.col, data.pieceType);
        
        if (result.valid) {
          const gameState = room.game.getState();
          
          // Broadcast the move to all players in the room
          io.to(room.id).emit('game_update', {
            gameState,
            lastMove: { row: data.row, col: data.col, pieceType: data.pieceType },
            boopedPieces: result.boopedPieces,
            graduatedPieces: result.graduatedPieces,
            newCatsEarned: result.newCatsEarned
          });

          // Check for winner
          if (result.winner) {
            io.to(room.id).emit('game_over', {
              winner: result.winner,
              winCondition: result.winCondition,
              gameState
            });
          }

          callback({ success: true });
        } else {
          callback({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error placing piece:', error);
        callback({ success: false, error: 'Failed to place piece' });
      }
    });

    // Request current game state
    socket.on('get_state', (callback) => {
      try {
        const room = roomManager.getPlayerRoom(socket.id);
        
        if (!room) {
          callback({ success: false, error: 'Not in a room' });
          return;
        }

        callback({
          success: true,
          gameState: room.game.getState(),
          playerColor: room.game.getPlayerColor(socket.id)
        });
      } catch (error) {
        console.error('Error getting state:', error);
        callback({ success: false, error: 'Failed to get state' });
      }
    });

    // Leave room
    socket.on('leave_room', (callback) => {
      try {
        const result = roomManager.leaveRoom(socket.id);
        
        if (result) {
          socket.leave(result.roomId);
          
          // Notify remaining player
          socket.to(result.roomId).emit('player_left', {
            playerColor: result.color
          });
        }

        callback({ success: true });
      } catch (error) {
        console.error('Error leaving room:', error);
        callback({ success: false, error: 'Failed to leave room' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      const result = roomManager.leaveRoom(socket.id);
      
      if (result) {
        // Notify remaining player
        socket.to(result.roomId).emit('player_disconnected', {
          playerColor: result.color
        });
      }
    });

    // Ping for connection health
    socket.on('ping', (callback) => {
      callback({ pong: true, timestamp: Date.now() });
    });
  });
}
