import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, PlayerColor, PieceType, GameUpdate, GameOverInfo, RoomInfo, WaitingPlayer } from '../types';

const SOCKET_URL = import.meta.env.PROD 
  ? window.location.origin 
  : 'http://localhost:3001';

// Storage keys
const PLAYER_TOKEN_KEY = 'boop_player_token';
const ACTIVE_GAME_KEY = 'boop_active_game';
const PLAYER_NAME_KEY = 'boop_player_name';

// Generate a unique player token
function generatePlayerToken(): string {
  return 'pt_' + crypto.randomUUID();
}

// Get or create player token from localStorage
function getPlayerToken(): string {
  let token = localStorage.getItem(PLAYER_TOKEN_KEY);
  if (!token) {
    token = generatePlayerToken();
    localStorage.setItem(PLAYER_TOKEN_KEY, token);
  }
  return token;
}

// Save active game info
function saveActiveGame(roomCode: string, roomId: string, playerColor: PlayerColor, playerName: string): void {
  const data = { roomCode, roomId, playerColor, playerName, savedAt: Date.now() };
  localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(data));
}

// Get active game info
function getActiveGame(): { roomCode: string; roomId: string; playerColor: PlayerColor; playerName: string; savedAt: number } | null {
  const data = localStorage.getItem(ACTIVE_GAME_KEY);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    // Check if game is less than 5 minutes old
    if (Date.now() - parsed.savedAt > 5 * 60 * 1000) {
      clearActiveGame();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Clear active game info
function clearActiveGame(): void {
  localStorage.removeItem(ACTIVE_GAME_KEY);
}

// Save player name
function savePlayerName(name: string): void {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

// Get saved player name
function getSavedPlayerName(): string | null {
  return localStorage.getItem(PLAYER_NAME_KEY);
}

interface UseSocketReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  gameState: GameState | null;
  playerColor: PlayerColor | null;
  roomInfo: RoomInfo | null;
  gameOver: GameOverInfo | null;
  opponentDisconnected: boolean;
  opponentMayReconnect: boolean;
  
  // Lobby state
  inLobby: boolean;
  lobbyPlayers: WaitingPlayer[];
  
  // Saved player name
  savedPlayerName: string | null;
  
  createRoom: (playerName: string) => Promise<RoomInfo>;
  joinRoom: (roomCode: string, playerName: string) => Promise<RoomInfo>;
  rejoinRoom: (roomCode: string) => Promise<RoomInfo>;
  placePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  selectGraduation: (optionIndex: number) => Promise<boolean>;
  leaveRoom: () => void;
  
  // Lobby functions
  joinLobby: (playerName: string) => Promise<WaitingPlayer[]>;
  leaveLobby: () => void;
  selectOpponent: (opponentId: string) => Promise<RoomInfo>;
  
  // Check for active game to rejoin
  checkForActiveGame: () => { roomCode: string; playerColor: PlayerColor } | null;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const playerTokenRef = useRef<string>(getPlayerToken());
  
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [opponentMayReconnect, setOpponentMayReconnect] = useState(false);
  
  // Lobby state
  const [inLobby, setInLobby] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<WaitingPlayer[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [savedPlayerName] = useState<string | null>(getSavedPlayerName());

  // Initialize socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      setConnecting(false);
      setError(null);
      
      // Check if we have an active game to rejoin
      const activeGame = getActiveGame();
      if (activeGame && !roomInfo) {
        console.log('Found active game, attempting rejoin:', activeGame.roomCode);
        // Attempt auto-rejoin
        socket.emit('rejoin_room', { 
          roomCode: activeGame.roomCode, 
          playerToken: playerTokenRef.current 
        }, (response: {
          success: boolean;
          roomCode?: string;
          roomId?: string;
          playerColor?: PlayerColor;
          gameState?: GameState;
          error?: string;
        }) => {
          if (response.success && response.roomCode && response.roomId && response.playerColor) {
            console.log('Auto-rejoin successful!');
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
            setOpponentMayReconnect(false);
            // Update URL
            window.location.hash = `/game/${response.roomCode}`;
          } else {
            console.log('Auto-rejoin failed:', response.error);
            clearActiveGame();
            // Clear URL if it has a game code
            if (window.location.hash.startsWith('#/game/')) {
              window.location.hash = '';
            }
          }
        });
      }
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
      setOpponentDisconnected(false);
      setOpponentMayReconnect(false);
    });

    socket.on('game_update', (data: GameUpdate) => {
      setGameState(data.gameState);
    });

    socket.on('game_over', (data: GameOverInfo) => {
      setGameOver(data);
      setGameState(data.gameState);
      // Game is over, clear active game
      clearActiveGame();
    });

    socket.on('player_disconnected', (data: { playerColor: string; canRejoin?: boolean }) => {
      console.log('Player disconnected:', data.playerColor, 'can rejoin:', data.canRejoin);
      setOpponentDisconnected(true);
      setOpponentMayReconnect(data.canRejoin || false);
    });

    socket.on('player_reconnected', (data: { playerColor: string; gameState: GameState }) => {
      console.log('Player reconnected:', data.playerColor);
      setOpponentDisconnected(false);
      setOpponentMayReconnect(false);
      setGameState(data.gameState);
    });

    socket.on('player_left', (data: { playerColor: string }) => {
      console.log('Player left:', data.playerColor);
      setOpponentDisconnected(true);
      setOpponentMayReconnect(false);
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
      setOpponentMayReconnect(false);
      
      // Save active game
      const savedName = getSavedPlayerName();
      if (savedName) {
        saveActiveGame(data.roomCode, data.roomId, data.playerColor, savedName);
      }
      
      // Update URL
      window.location.hash = `/game/${data.roomCode}`;
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

      savePlayerName(playerName);

      socketRef.current.emit('create_room', { 
        playerName,
        playerToken: playerTokenRef.current
      }, (response: {
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
          setOpponentMayReconnect(false);
          
          // Save active game
          saveActiveGame(response.roomCode, response.roomId, response.playerColor, playerName);
          
          // Update URL
          window.location.hash = `/game/${response.roomCode}`;
          
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

      savePlayerName(playerName);

      socketRef.current.emit('join_room', { 
        roomCode, 
        playerName,
        playerToken: playerTokenRef.current
      }, (response: {
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
          setOpponentMayReconnect(false);
          
          // Save active game
          saveActiveGame(response.roomCode, response.roomId, response.playerColor, playerName);
          
          // Update URL
          window.location.hash = `/game/${response.roomCode}`;
          
          resolve(info);
        } else {
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  }, []);

  // Rejoin a room using player token
  const rejoinRoom = useCallback((roomCode: string): Promise<RoomInfo> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('rejoin_room', { 
        roomCode, 
        playerToken: playerTokenRef.current
      }, (response: {
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
          setOpponentMayReconnect(false);
          
          // Update active game timestamp
          const savedName = getSavedPlayerName() || 'Player';
          saveActiveGame(response.roomCode, response.roomId, response.playerColor, savedName);
          
          // Update URL
          window.location.hash = `/game/${response.roomCode}`;
          
          resolve(info);
        } else {
          clearActiveGame();
          reject(new Error(response.error || 'Failed to rejoin room'));
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
        setOpponentMayReconnect(false);
        clearActiveGame();
        window.location.hash = '';
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

      savePlayerName(playerName);

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
          setOpponentMayReconnect(false);
          
          // Save active game
          const savedName = getSavedPlayerName() || 'Player';
          saveActiveGame(response.roomCode, response.roomId, response.playerColor, savedName);
          
          // Update URL
          window.location.hash = `/game/${response.roomCode}`;
          
          resolve(info);
        } else {
          reject(new Error(response.error || 'Failed to start match'));
        }
      });
    });
  }, []);

  // Check for active game that can be rejoined
  const checkForActiveGame = useCallback((): { roomCode: string; playerColor: PlayerColor } | null => {
    const activeGame = getActiveGame();
    if (activeGame) {
      return { roomCode: activeGame.roomCode, playerColor: activeGame.playerColor };
    }
    return null;
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
    opponentMayReconnect,
    inLobby,
    lobbyPlayers,
    savedPlayerName,
    createRoom,
    joinRoom,
    rejoinRoom,
    placePiece,
    selectGraduation,
    leaveRoom,
    joinLobby,
    leaveLobby,
    selectOpponent,
    checkForActiveGame,
  };
}
