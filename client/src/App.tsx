import { useSocket } from './hooks/useSocket';
import { Lobby, WaitingRoom } from './components/Lobby';
import { Game } from './components/Game';

function App() {
  const {
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
  } = useSocket();

  // Determine which screen to show
  const getScreen = () => {
    // Not in a room yet - show lobby
    if (!roomInfo || !playerColor) {
      return (
        <Lobby
          onCreateGame={async (name) => { await createRoom(name); }}
          onJoinGame={async (code, name) => { await joinRoom(code, name); }}
          connecting={connecting}
          error={error}
        />
      );
    }

    // In a room but game hasn't started (waiting for opponent)
    if (!gameState || gameState.phase === 'waiting') {
      return (
        <WaitingRoom
          roomCode={roomInfo.roomCode}
          playerName={playerColor}
          onLeave={leaveRoom}
        />
      );
    }

    // Game in progress or finished
    return (
      <Game
        gameState={gameState}
        playerColor={playerColor}
        roomCode={roomInfo.roomCode}
        onPlacePiece={placePiece}
        onLeave={leaveRoom}
        gameOver={gameOver}
        opponentDisconnected={opponentDisconnected}
      />
    );
  };

  return (
    <div className="min-h-screen">
      {getScreen()}
      
      {/* Connection status indicator */}
      {!connecting && !connected && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm shadow-lg">
          ⚠️ Disconnected
        </div>
      )}
    </div>
  );
}

export default App;
