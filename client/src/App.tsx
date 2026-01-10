import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useBotGame } from './hooks/useBotGame';
import { Lobby, WaitingRoom, QuickMatchLobby, BotDifficulty, BOT_DIFFICULTIES } from './components/Lobby';
import { Game } from './components/Game';
import { GameMode } from './types';

// Parse game code from URL hash
function getGameCodeFromHash(): string | null {
  const hash = window.location.hash;
  // Match #/game/BOOP-XXXX pattern
  const match = hash.match(/^#\/game\/(BOOP-[A-Z0-9]+)$/i);
  return match ? match[1].toUpperCase() : null;
}

function App() {
  const [gameMode, setGameMode] = useState<GameMode>(null);
  const [attemptingRejoin, setAttemptingRejoin] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  // Online multiplayer hook
  const {
    connected,
    connecting,
    error,
    gameState: onlineGameState,
    playerColor: onlinePlayerColor,
    roomInfo,
    gameOver: onlineGameOver,
    opponentDisconnected,
    opponentMayReconnect,
    inLobby,
    lobbyPlayers,
    savedPlayerName,
    createRoom,
    joinRoom,
    rejoinRoom,
    placePiece: onlinePlacePiece,
    selectGraduation: onlineSelectGraduation,
    leaveRoom,
    joinLobby,
    leaveLobby,
    selectOpponent,
    checkForActiveGame,
  } = useSocket();

  // Bot game hook
  const {
    gameState: botGameState,
    playerColor: botPlayerColor,
    gameOver: botGameOver,
    botThinking,
    startBotGame,
    placePiece: botPlacePiece,
    selectGraduation: botSelectGraduation,
    resetGame: resetBotGame,
    endBotGame,
  } = useBotGame();

  // Handle URL-based rejoin on app load
  useEffect(() => {
    if (connected && !roomInfo && !attemptingRejoin) {
      const gameCodeFromUrl = getGameCodeFromHash();
      
      if (gameCodeFromUrl) {
        // Try to rejoin from URL
        setAttemptingRejoin(true);
        setRejoinError(null);
        setGameMode('online');
        
        rejoinRoom(gameCodeFromUrl)
          .then(() => {
            console.log('Rejoined game from URL');
            setAttemptingRejoin(false);
          })
          .catch((err) => {
            console.log('Could not rejoin from URL:', err.message);
            setRejoinError('Could not rejoin game. It may have expired.');
            setAttemptingRejoin(false);
            // Clear the URL
            window.location.hash = '';
            setGameMode(null);
          });
      }
    }
  }, [connected, roomInfo, attemptingRejoin, rejoinRoom]);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const gameCode = getGameCodeFromHash();
      if (!gameCode && roomInfo) {
        // User navigated away from game
        // Don't automatically leave - let them use the leave button
      } else if (gameCode && !roomInfo && connected) {
        // User navigated to a game URL
        setAttemptingRejoin(true);
        setGameMode('online');
        rejoinRoom(gameCode)
          .then(() => setAttemptingRejoin(false))
          .catch(() => {
            setAttemptingRejoin(false);
            window.location.hash = '';
            setGameMode(null);
          });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [connected, roomInfo, rejoinRoom]);

  // Handlers for starting different game modes
  const handleCreateGame = useCallback(async (name: string) => {
    setGameMode('online');
    setRejoinError(null);
    await createRoom(name);
  }, [createRoom]);

  const handleJoinGame = useCallback(async (code: string, name: string) => {
    setGameMode('online');
    setRejoinError(null);
    await joinRoom(code, name);
  }, [joinRoom]);

  const handlePlayBot = useCallback((name: string, difficulty: BotDifficulty) => {
    const diffConfig = BOT_DIFFICULTIES.find(d => d.id === difficulty);
    const searchDepth = diffConfig?.depth ?? 2;
    setGameMode('bot');
    setRejoinError(null);
    startBotGame(name, { searchDepth });
  }, [startBotGame]);

  const handleLeaveOnlineGame = useCallback(() => {
    leaveRoom();
    setGameMode(null);
  }, [leaveRoom]);

  const handleLeaveBotGame = useCallback(() => {
    endBotGame();
    setGameMode(null);
  }, [endBotGame]);

  // Lobby handlers
  const handleJoinLobby = useCallback(async (name: string) => {
    setGameMode('online');
    setRejoinError(null);
    await joinLobby(name);
  }, [joinLobby]);

  const handleLeaveLobby = useCallback(() => {
    leaveLobby();
    setGameMode(null);
  }, [leaveLobby]);

  const handleSelectOpponent = useCallback(async (opponentId: string) => {
    await selectOpponent(opponentId);
  }, [selectOpponent]);


  // Determine which screen to show
  const getScreen = () => {
    // Show loading/rejoining state
    if (attemptingRejoin) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Reconnecting to Game...</h2>
            <p className="text-gray-600">Please wait while we restore your session</p>
          </div>
        </div>
      );
    }

    // Bot game mode
    if (gameMode === 'bot' && botGameState) {
      return (
        <Game
          gameState={botGameState}
          playerColor={botPlayerColor}
          roomCode="vs Bot"
          onPlacePiece={botPlacePiece}
          onSelectGraduation={botSelectGraduation}
          onLeave={handleLeaveBotGame}
          gameOver={botGameOver}
          opponentDisconnected={false}
          isBotGame={true}
          botThinking={botThinking}
          onRematch={resetBotGame}
        />
      );
    }

    // Online game mode
    if (gameMode === 'online') {
      // In the quick match lobby (waiting to select opponent)
      if (inLobby) {
        return (
          <QuickMatchLobby
            players={lobbyPlayers}
            onSelectOpponent={handleSelectOpponent}
            onLeave={handleLeaveLobby}
          />
        );
      }

      // In a room but game hasn't started (waiting for opponent)
      if (roomInfo && onlinePlayerColor && (!onlineGameState || onlineGameState.phase === 'waiting')) {
        return (
          <WaitingRoom
            roomCode={roomInfo.roomCode}
            playerName={onlinePlayerColor}
            onLeave={handleLeaveOnlineGame}
          />
        );
      }

      // Game in progress or finished
      if (roomInfo && onlinePlayerColor && onlineGameState) {
        return (
          <Game
            gameState={onlineGameState}
            playerColor={onlinePlayerColor}
            roomCode={roomInfo.roomCode}
            onPlacePiece={onlinePlacePiece}
            onSelectGraduation={onlineSelectGraduation}
            onLeave={handleLeaveOnlineGame}
            gameOver={onlineGameOver}
            opponentDisconnected={opponentDisconnected}
            opponentMayReconnect={opponentMayReconnect}
          />
        );
      }
    }

    // Default: show lobby
    return (
      <Lobby
        onCreateGame={handleCreateGame}
        onJoinGame={handleJoinGame}
        onPlayBot={handlePlayBot}
        onJoinLobby={handleJoinLobby}
        connecting={connecting}
        error={rejoinError || error}
        savedPlayerName={savedPlayerName}
        activeGame={checkForActiveGame()}
        onRejoinGame={async (code) => {
          setGameMode('online');
          setRejoinError(null);
          try {
            await rejoinRoom(code);
          } catch (err) {
            setRejoinError('Could not rejoin game');
            setGameMode(null);
          }
        }}
      />
    );
  };

  return (
    <div className="min-h-screen">
      {getScreen()}
      
      {/* Connection status indicator */}
      {!connecting && !connected && gameMode !== 'bot' && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm shadow-lg">
          ⚠️ Disconnected - Reconnecting...
        </div>
      )}
    </div>
  );
}

export default App;
