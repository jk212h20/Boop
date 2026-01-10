import { useState, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import { useBotGame } from './hooks/useBotGame';
import { Lobby, WaitingRoom, QuickMatchLobby, BotDifficulty, BOT_DIFFICULTIES } from './components/Lobby';
import { Game } from './components/Game';
import { GameMode } from './types';

function App() {
  const [gameMode, setGameMode] = useState<GameMode>(null);

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
    inLobby,
    lobbyPlayers,
    createRoom,
    joinRoom,
    placePiece: onlinePlacePiece,
    selectGraduation: onlineSelectGraduation,
    leaveRoom,
    joinLobby,
    leaveLobby,
    selectOpponent,
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

  // Handlers for starting different game modes
  const handleCreateGame = useCallback(async (name: string) => {
    setGameMode('online');
    await createRoom(name);
  }, [createRoom]);

  const handleJoinGame = useCallback(async (code: string, name: string) => {
    setGameMode('online');
    await joinRoom(code, name);
  }, [joinRoom]);

  const handlePlayBot = useCallback((name: string, difficulty: BotDifficulty) => {
    const diffConfig = BOT_DIFFICULTIES.find(d => d.id === difficulty);
    const searchDepth = diffConfig?.depth ?? 2;
    setGameMode('bot');
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
        error={error}
      />
    );
  };

  return (
    <div className="min-h-screen">
      {getScreen()}
      
      {/* Connection status indicator */}
      {!connecting && !connected && gameMode !== 'bot' && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm shadow-lg">
          ⚠️ Disconnected
        </div>
      )}
    </div>
  );
}

export default App;
