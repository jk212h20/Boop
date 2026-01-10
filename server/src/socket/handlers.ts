import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import { LobbyManager } from '../lobby/LobbyManager';
import { PieceType, PlayerColor } from '../game/types';

export function setupSocketHandlers(io: Server, roomManager: RoomManager, lobbyManager: LobbyManager): void {
  // Helper to broadcast lobby updates to all players in the lobby
  const broadcastLobbyUpdate = () => {
    // Send personalized list to each player in lobby (excluding themselves)
    for (const player of lobbyManager.getWaitingPlayers()) {
      const waitlist = lobbyManager.getPublicWaitlist(player.socketId);
      io.to(player.socketId).emit('lobby_update', { players: waitlist });
    }
  };

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new game room
    socket.on('create_room', (data: { playerName: string; playerToken?: string }, callback) => {
      try {
        const room = roomManager.createRoom();
        const result = roomManager.joinRoom(room.id, socket.id, data.playerName, data.playerToken);
        
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
    socket.on('join_room', (data: { roomCode: string; playerName: string; playerToken?: string }, callback) => {
      try {
        const room = roomManager.findRoomByCode(data.roomCode);
        
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const result = roomManager.joinRoom(room.id, socket.id, data.playerName, data.playerToken);
        
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

    // Rejoin a room after disconnect (using player token)
    socket.on('rejoin_room', (data: { roomCode: string; playerToken: string }, callback) => {
      try {
        const result = roomManager.rejoinRoom(data.roomCode, socket.id, data.playerToken);
        
        if (result.success && result.roomId) {
          const room = roomManager.findRoomById(result.roomId);
          if (room) {
            socket.join(result.roomId);
            
            // Notify the other player that opponent reconnected
            socket.to(result.roomId).emit('player_reconnected', {
              playerColor: result.color,
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
            callback({ success: false, error: 'Room not found after rejoin' });
          }
        } else {
          callback({ success: false, error: result.error || 'Failed to rejoin' });
        }
      } catch (error) {
        console.error('Error rejoining room:', error);
        callback({ success: false, error: 'Failed to rejoin room' });
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
            newCatsEarned: result.newCatsEarned,
            requiresGraduationChoice: result.requiresGraduationChoice,
            pendingGraduationOptions: result.pendingGraduationOptions
          });

          // Check for winner
          if (result.winner) {
            io.to(room.id).emit('game_over', {
              winner: result.winner,
              winCondition: result.winCondition,
              gameState
            });
          }

          callback({ success: true, requiresGraduationChoice: result.requiresGraduationChoice });
        } else {
          callback({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error placing piece:', error);
        callback({ success: false, error: 'Failed to place piece' });
      }
    });

    // Select graduation option (when player needs to choose which 3 in a row to graduate)
    socket.on('select_graduation', (data: { optionIndex: number }, callback) => {
      try {
        const room = roomManager.getPlayerRoom(socket.id);
        
        if (!room) {
          callback({ success: false, error: 'Not in a room' });
          return;
        }

        const result = room.game.selectGraduation(socket.id, data.optionIndex);
        
        if (result.valid) {
          const gameState = room.game.getState();
          
          // Broadcast the graduation result to all players
          io.to(room.id).emit('game_update', {
            gameState,
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
        console.error('Error selecting graduation:', error);
        callback({ success: false, error: 'Failed to select graduation' });
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

    // ==================== LOBBY HANDLERS ====================

    // Join the lobby waitlist
    socket.on('join_lobby', (data: { playerName: string }, callback) => {
      try {
        // Remove from any existing room first
        const existingRoom = roomManager.getPlayerRoom(socket.id);
        if (existingRoom) {
          roomManager.leaveRoom(socket.id);
        }

        // Add to lobby
        const player = lobbyManager.addPlayer(socket.id, data.playerName);
        
        // Send initial lobby state to this player
        const waitlist = lobbyManager.getPublicWaitlist(socket.id);
        
        callback({
          success: true,
          players: waitlist,
        });

        // Broadcast update to all other lobby players
        broadcastLobbyUpdate();
      } catch (error) {
        console.error('Error joining lobby:', error);
        callback({ success: false, error: 'Failed to join lobby' });
      }
    });

    // Leave the lobby
    socket.on('leave_lobby', (callback) => {
      try {
        lobbyManager.removePlayer(socket.id);
        callback({ success: true });
        
        // Broadcast update to remaining lobby players
        broadcastLobbyUpdate();
      } catch (error) {
        console.error('Error leaving lobby:', error);
        callback({ success: false, error: 'Failed to leave lobby' });
      }
    });

    // Select a player to start a game with
    socket.on('select_opponent', (data: { opponentId: string }, callback) => {
      try {
        const challenger = lobbyManager.getPlayer(socket.id);
        const opponent = lobbyManager.getPlayer(data.opponentId);

        if (!challenger) {
          callback({ success: false, error: 'You are not in the lobby' });
          return;
        }

        if (!opponent) {
          callback({ success: false, error: 'Player not found or no longer waiting' });
          return;
        }

        // Remove both players from lobby
        lobbyManager.removePlayer(socket.id);
        lobbyManager.removePlayer(data.opponentId);

        // Create a new room
        const room = roomManager.createRoom();

        // Add challenger (orange - first player)
        const challengerResult = roomManager.joinRoom(room.id, socket.id, challenger.name);
        socket.join(room.id);

        // Add opponent (gray - second player)
        const opponentResult = roomManager.joinRoom(room.id, data.opponentId, opponent.name);
        const opponentSocket = io.sockets.sockets.get(data.opponentId);
        if (opponentSocket) {
          opponentSocket.join(room.id);
        }

        const gameState = room.game.getState();

        // Notify challenger
        callback({
          success: true,
          roomCode: room.code,
          roomId: room.id,
          playerColor: challengerResult.color,
          gameState,
        });

        // Notify opponent
        io.to(data.opponentId).emit('match_started', {
          roomCode: room.code,
          roomId: room.id,
          playerColor: opponentResult.color,
          opponentName: challenger.name,
          gameState,
        });

        // Broadcast lobby update to remaining players
        broadcastLobbyUpdate();

        console.log(`Match started: ${challenger.name} vs ${opponent.name} in room ${room.code}`);
      } catch (error) {
        console.error('Error selecting opponent:', error);
        callback({ success: false, error: 'Failed to start match' });
      }
    });

    // Heartbeat for lobby (keeps player active)
    socket.on('lobby_heartbeat', () => {
      lobbyManager.updateActivity(socket.id);
    });

    // ==================== END LOBBY HANDLERS ====================

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Remove from lobby if present
      const wasInLobby = lobbyManager.isInLobby(socket.id);
      if (wasInLobby) {
        lobbyManager.removePlayer(socket.id);
        broadcastLobbyUpdate();
      }
      
      // Soft disconnect from room (keeps slot reserved for rejoin)
      const result = roomManager.softDisconnect(socket.id);
      
      if (result) {
        // Notify remaining player - they can wait for reconnection
        socket.to(result.roomId).emit('player_disconnected', {
          playerColor: result.color,
          canRejoin: !!result.playerToken // Let client know opponent might reconnect
        });
      }
    });

    // Ping for connection health
    socket.on('ping', (callback) => {
      callback({ pong: true, timestamp: Date.now() });
    });
  });
}
