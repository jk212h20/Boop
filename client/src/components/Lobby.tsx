import { useState } from 'react';
import { motion } from 'framer-motion';

interface LobbyProps {
  onCreateGame: (playerName: string) => Promise<void>;
  onJoinGame: (roomCode: string, playerName: string) => Promise<void>;
  onPlayBot: (playerName: string) => void;
  connecting: boolean;
  error: string | null;
}

export function Lobby({ onCreateGame, onJoinGame, onPlayBot, connecting, error }: LobbyProps) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join' | 'bot'>('menu');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      setLocalError('Please enter your name');
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      await onCreateGame(playerName.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setLocalError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setLocalError('Please enter the room code');
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      await onJoinGame(roomCode.trim().toUpperCase(), playerName.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayBot = () => {
    if (!playerName.trim()) {
      setLocalError('Please enter your name');
      return;
    }
    setLocalError(null);
    onPlayBot(playerName.trim());
  };

  const displayError = localError || error;

  if (connecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-600">Connecting to server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card max-w-md w-full"
      >
        {/* Title */}
        <div className="text-center mb-8">
          <motion.h1 
            className="font-display text-5xl font-bold text-boop-orange-600 mb-2"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            🐱 Boop! 🐱
          </motion.h1>
          <p className="text-gray-600 font-medium">
            Deceptively cute, deceivingly challenging!
          </p>
        </div>

        {/* Error display */}
        {displayError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4"
          >
            {displayError}
          </motion.div>
        )}

        {mode === 'menu' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <button
              onClick={() => setMode('create')}
              className="btn-primary w-full text-xl"
            >
              🎮 Create Game
            </button>
            <button
              onClick={() => setMode('join')}
              className="btn-secondary w-full text-xl"
            >
              🔗 Join Game
            </button>
            <button
              onClick={() => setMode('bot')}
              className="btn-secondary w-full text-xl bg-gray-100 hover:bg-gray-200 border-gray-300"
            >
              🤖 Play vs Bot
            </button>

            <div className="mt-8 p-4 bg-amber-50 rounded-xl">
              <h3 className="font-display font-bold text-amber-800 mb-2">How to Play</h3>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>🐱 Place kittens to "boop" pieces away</li>
                <li>✨ Line up 3 kittens → graduate to cats</li>
                <li>🏆 Line up 3 cats to win!</li>
              </ul>
            </div>
          </motion.div>
        )}

        {mode === 'create' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-gray-700 font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                maxLength={20}
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner w-5 h-5"></div>
                  Creating...
                </span>
              ) : (
                'Create Game'
              )}
            </button>

            <button
              onClick={() => { setMode('menu'); setLocalError(null); }}
              className="w-full text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-gray-700 font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2">Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="BOOP-XXXX"
                className="input room-code text-center text-xl tracking-wider"
                maxLength={9}
              />
            </div>

            <button
              onClick={handleJoin}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner w-5 h-5"></div>
                  Joining...
                </span>
              ) : (
                'Join Game'
              )}
            </button>

            <button
              onClick={() => { setMode('menu'); setLocalError(null); }}
              className="w-full text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </motion.div>
        )}

        {mode === 'bot' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="text-center mb-4">
              <span className="text-4xl">🤖</span>
              <h3 className="font-display text-xl font-bold text-gray-700 mt-2">Play vs Bot</h3>
              <p className="text-gray-500 text-sm">Practice against our AI opponent!</p>
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                maxLength={20}
              />
            </div>

            <button
              onClick={handlePlayBot}
              className="btn-primary w-full"
            >
              🎮 Start Game
            </button>

            <button
              onClick={() => { setMode('menu'); setLocalError(null); }}
              className="w-full text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

interface WaitingRoomProps {
  roomCode: string;
  playerName: string;
  onLeave: () => void;
}

export function WaitingRoom({ roomCode, playerName, onLeave }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card max-w-md w-full text-center"
      >
        <h2 className="font-display text-2xl font-bold text-gray-800 mb-2">
          Waiting for opponent...
        </h2>
        <p className="text-gray-600 mb-6">
          Share this code with a friend to play!
        </p>

        <motion.div
          className="bg-amber-100 rounded-xl p-4 mb-6"
          whileHover={{ scale: 1.02 }}
        >
          <p className="text-sm text-gray-500 mb-1">Room Code</p>
          <p className="room-code text-3xl font-bold text-amber-800">{roomCode}</p>
        </motion.div>

        <button
          onClick={copyCode}
          className="btn-primary w-full mb-4"
        >
          {copied ? '✓ Copied!' : '📋 Copy Code'}
        </button>

        <div className="flex items-center justify-center gap-2 text-gray-500 mb-6">
          <div className="spinner w-4 h-4"></div>
          <span>Waiting for {playerName === 'orange' ? 'gray' : 'orange'} player...</span>
        </div>

        <button
          onClick={onLeave}
          className="text-gray-500 hover:text-gray-700"
        >
          Leave Game
        </button>
      </motion.div>
    </div>
  );
}
