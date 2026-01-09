import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, PlayerColor, PieceType, GameUpdate, GameOverInfo, RoomInfo, WaitingPlayer } from '../types';

const SOCKET_URL = import.meta.env.PROD 
  ? window.location.origin 
  : 'http://localhost:3001';

interface UseSocketReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  gameState: GameState | null;
  playerColor: PlayerColor | null;
  roomInfo: RoomInfo | null;
  gameOver: GameOverInfo | null;
  opponentDisconnected: boolean;
  
  // Lobby state
  inLobby: boolean;
  lobbyPlayers: WaitingPlayer[];
  
  createRoom: (playerName: string) => Promise<RoomInfo>;
  joinRoom: (roomCode: string, playerName: string) => Promise<RoomInfo>;
  placePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  selectGraduation: (optionIndex: number) => Promise<boolean>;
  leaveRoom: () => void;
  
  // Lobby functions
  joinLobby: (playerName: string) => Promise<WaitingPlayer[]>;
  leaveLobby: () => void;
  selectOpponent: (opponentId: string) => Promise<RoomInfo>;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  
  // Lobby state
  const [inLobby, setInLobby] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<WaitingPlayer[]>([]);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      setConnecting(false);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to server');
      setConnecting(false);
    });

    // Game events
    socket.on('player_joined', (data: { playerColor: string; playerName: string; gameState: GameState }) => {
      console.log('Player joined:', data.playerName);
      setGameState(data.gameState);
    });

    socket.on('game_update', (data: GameUpdate) => {
      setGameState(data.gameState);
    });

    socket.on('game_over', (data: GameOverInfo) => {
      setGameOver(data);
      setGameState(data.gameState);
    });

    socket.on('player_disconnected', (data: { playerColor: string }) => {
      console.log('Player disconnected:', data.playerColor);
      setOpponentDisconnected(true);
    });

    socket.on('player_left', (data: { playerColor: string }) => {
      console.log('Player left:', data.playerColor);
      setOpponentDisconnected(true);
    });

    // Lobby events
    socket.on('lobby_update', (data: { players: WaitingPlayer[] }) => {
      setLobbyPlayers(data.players);
    });

    socket.on('match_started', (data: {
      roomCode: string;
      roomId: string;
      playerColor: PlayerColor;
      opponentName: string;
      gameState: GameState;
    }) => {
      console.log('Match started! Opponent:', data.opponentName);
      // Clear lobby state
      setInLobby(false);
      setLobbyPlayers([]);
      
      // Set game state
      const info: RoomInfo = {
        roomCode: data.roomCode,
        roomId: data.roomId,
        playerColor: data.playerColor,
      };
      setRoomInfo(info);
      setPlayerColor(data.playerColor);
      setGameState(data.gameState);
      setGameOver(null);
      setOpponentDisconnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Create a new room
  const createRoom = useCallback((playerName: string): Promise<RoomInfo> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('create_room', { playerName }, (response: {
        success: boolean;
        roomCode?: string;
        roomId?: string;
        playerColor?: PlayerColor;
        gameState?: GameState;
        error?: string;
      }) => {
        if (response.success && response.roomCode && response.roomId && response.playerColor) {
          const info: RoomInfo = {
            roomCode: response.roomCode,
            roomId: response.roomId,
            playerColor: response.playerColor,
          };
          setRoomInfo(info);
          setPlayerColor(response.playerColor);
          setGameState(response.gameState || null);
          setGameOver(null);
          setOpponentDisconnected(false);
          resolve(info);
        } else {
          reject(new Error(response.error || 'Failed to create room'));
        }
      });
    });
  }, []);

  // Join an existing room
  const joinRoom = useCallback((roomCode: string, playerName: string): Promise<RoomInfo> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('join_room', { roomCode, playerName }, (response: {
        success: boolean;
        roomCode?: string;
        roomId?: string;
        playerColor?: PlayerColor;
        gameState?: GameState;
        error?: string;
      }) => {
        if (response.success && response.roomCode && response.roomId && response.playerColor) {
          const info: RoomInfo = {
            roomCode: response.roomCode,
            roomId: response.roomId,
            playerColor: response.playerColor,
          };
          setRoomInfo(info);
          setPlayerColor(response.playerColor);
          setGameState(response.gameState || null);
          setGameOver(null);
          setOpponentDisconnected(false);
          resolve(info);
        } else {
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  }, []);

  // Place a piece
  const placePiece = useCallback((row: number, col: number, pieceType: PieceType): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('place_piece', { row, col, pieceType }, (response: {
        success: boolean;
        error?: string;
      }) => {
        if (response.success) {
          resolve(true);
        } else {
          reject(new Error(response.error || 'Failed to place piece'));
        }
      });
    });
  }, []);

  // Select graduation option (when multiple 3-in-a-row choices are available)
  const selectGraduation = useCallback((optionIndex: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('select_graduation', { optionIndex }, (response: {
        success: boolean;
        error?: string;
      }) => {
        if (response.success) {
          resolve(true);
        } else {
          reject(new Error(response.error || 'Failed to select graduation'));
        }
      });
    });
  }, []);

  // Leave the current room
  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave_room', () => {
        setRoomInfo(null);
        setPlayerColor(null);
        setGameState(null);
        setGameOver(null);
        setOpponentDisconnected(false);
      });
    }
  }, []);

  // Join the lobby waitlist
  const joinLobby = useCallback((playerName: string): Promise<WaitingPlayer[]> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('join_lobby', { playerName }, (response: {
        success: boolean;
        players?: WaitingPlayer[];
        error?: string;
      }) => {
        if (response.success) {
          setInLobby(true);
          setLobbyPlayers(response.players || []);
          
          // Start heartbeat to keep player active
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
          }
          heartbeatRef.current = setInterval(() => {
            socketRef.current?.emit('lobby_heartbeat');
          }, 10000); // Every 10 seconds
          
          resolve(response.players || []);
        } else {
          reject(new Error(response.error || 'Failed to join lobby'));
        }
      });
    });
  }, []);

  // Leave the lobby
  const leaveLobby = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave_lobby', () => {
        setInLobby(false);
        setLobbyPlayers([]);
        
        // Stop heartbeat
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      });
    }
  }, []);

  // Select an opponent from the lobby to start a game
  const selectOpponent = useCallback((opponentId: string): Promise<RoomInfo> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('select_opponent', { opponentId }, (response: {
        success: boolean;
        roomCode?: string;
        roomId?: string;
        playerColor?: PlayerColor;
        gameState?: GameState;
        error?: string;
      }) => {
        if (response.success && response.roomCode && response.roomId && response.playerColor) {
          // Stop heartbeat
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
          }
          
          // Clear lobby state
          setInLobby(false);
          setLobbyPlayers([]);
          
          // Set game state
          const info: RoomInfo = {
            roomCode: response.roomCode,
            roomId: response.roomId,
            playerColor: response.playerColor,
          };
          setRoomInfo(info);
          setPlayerColor(response.playerColor);
          setGameState(response.gameState || null);
          setGameOver(null);
          setOpponentDisconnected(false);
          resolve(info);
        } else {
          reject(new Error(response.error || 'Failed to start match'));
        }
      });
    });
  }, []);

  return {
    connected,
    connecting,
    error,
    gameState,
    playerColor,
    roomInfo,
    gameOver,
    opponentDisconnected,
    inLobby,
    lobbyPlayers,
    createRoom,
    joinRoom,
    placePiece,
    selectGraduation,
    leaveRoom,
    joinLobby,
    leaveLobby,
    selectOpponent,
  };
}
