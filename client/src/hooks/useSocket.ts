import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, PlayerColor, PieceType, GameUpdate, GameOverInfo, RoomInfo } from '../types';

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
  
  createRoom: (playerName: string) => Promise<RoomInfo>;
  joinRoom: (roomCode: string, playerName: string) => Promise<RoomInfo>;
  placePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  leaveRoom: () => void;
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

  return {
    connected,
    connecting,
    error,
    gameState,
    playerColor,
    roomInfo,
    gameOver,
    opponentDisconnected,
    createRoom,
    joinRoom,
    placePiece,
    leaveRoom,
  };
}
