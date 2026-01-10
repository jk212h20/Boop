import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WaitingPlayer, PlayerColor } from '../types';

// Bot difficulty options (with smart pruning - much faster at higher depths!)
export const BOT_DIFFICULTIES = [
  { id: 'easy', name: 'Easy', description: 'Depth 1 - Instant, beginner friendly', depth: 1 },
  { id: 'normal', name: 'Normal', description: 'Depth 2 - Fast & balanced', depth: 2 },
  { id: 'hard', name: 'Hard', description: 'Depth 3 - Strong (~0.5s/move)', depth: 3 },
  { id: 'expert', name: 'Expert', description: 'Depth 4 - Very strong (~2s/move)', depth: 4 },
  { id: 'master', name: 'Master', description: 'Depth 5 - Elite (~5-10s/move)', depth: 5 },
  { id: 'grandmaster', name: 'Grandmaster', description: 'Depth 6 - Maximum (~15-30s/move)', depth: 6 },
] as const;

export type BotDifficulty = typeof BOT_DIFFICULTIES[number]['id'];

interface LobbyProps {
  onCreateGame: (playerName: string) => Promise<void>;
  onJoinGame: (roomCode: string, playerName: string) => Promise<void>;
  onPlayBot: (playerName: string, difficulty: BotDifficulty) => void;
  onJoinLobby: (playerName: string) => Promise<void>;
  connecting: boolean;
  error: string | null;
  savedPlayerName?: string | null;
  activeGame?: { roomCode: string; playerColor: PlayerColor } | null;
  onRejoinGame?: (roomCode: string) => Promise<void>;
}

export function Lobby({ 
  onCreateGame, 
  onJoinGame, 
  onPlayBot, 
  onJoinLobby, 
  connecting, 
  error,
  savedPlayerName,
  activeGame,
  onRejoinGame,
}: LobbyProps) {
  const [playerName, setPlayerName] = useState(savedPlayerName || '');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join' | 'bot' | 'quickmatch'>('menu');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');

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
    onPlayBot(playerName.trim(), botDifficulty);
  };

  const handleQuickMatch = async () => {
    if (!playerName.trim()) {
      setLocalError('Please enter your name');
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      await onJoinLobby(playerName.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to join lobby');
      setLoading(false);
    }
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
            {/* Rejoin banner if there's an active game */}
            {activeGame && onRejoinGame && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 mb-2"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🔄</span>
                  <div>
                    <p className="font-bold text-blue-800">Game in progress!</p>
                    <p className="text-sm text-blue-600">
                      Room: <span className="font-mono">{activeGame.roomCode}</span> • 
                      Playing as <span className="capitalize">{activeGame.playerColor}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setLoading(true);
                    onRejoinGame(activeGame.roomCode).finally(() => setLoading(false));
                  }}
                  disabled={loading}
                  className="btn-primary w-full bg-blue-500 hover:bg-blue-600"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="spinner w-5 h-5"></div>
                      Rejoining...
                    </span>
                  ) : (
                    '🔙 Rejoin Game'
                  )}
                </button>
              </motion.div>
            )}

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
            <button
              onClick={() => setMode('quickmatch')}
              className="btn-secondary w-full text-xl bg-purple-100 hover:bg-purple-200 border-purple-300 text-purple-700"
            >
              🎲 Quick Match
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

            <div>
              <label className="block text-gray-700 font-medium mb-2">Bot Difficulty</label>
              <select
                value={botDifficulty}
                onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                className="input w-full"
              >
                {BOT_DIFFICULTIES.map((diff) => (
                  <option key={diff.id} value={diff.id}>
                    {diff.name} - {diff.description}
                  </option>
                ))}
              </select>
              {(botDifficulty === 'expert' || botDifficulty === 'master' || botDifficulty === 'grandmaster') && (
                <p className="text-amber-600 text-xs mt-1">
                  ⚠️ {botDifficulty === 'grandmaster' ? 'Grandmaster' : botDifficulty === 'master' ? 'Master' : 'Expert'} mode may take {botDifficulty === 'grandmaster' ? '15-30' : botDifficulty === 'master' ? '5-10' : 'a few'} seconds per move
                </p>
              )}
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

        {mode === 'quickmatch' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="text-center mb-4">
              <span className="text-4xl">🎲</span>
              <h3 className="font-display text-xl font-bold text-gray-700 mt-2">Quick Match</h3>
              <p className="text-gray-500 text-sm">Find an opponent from the lobby!</p>
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
              onClick={handleQuickMatch}
              disabled={loading}
              className="btn-primary w-full bg-purple-500 hover:bg-purple-600"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner w-5 h-5"></div>
                  Joining Lobby...
                </span>
              ) : (
                '🎲 Enter Lobby'
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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyCode = async () => {
    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
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

// Quick Match Lobby - shows list of waiting players
interface QuickMatchLobbyProps {
  players: WaitingPlayer[];
  onSelectOpponent: (opponentId: string) => Promise<void>;
  onLeave: () => void;
}

export function QuickMatchLobby({ players, onSelectOpponent, onLeave }: QuickMatchLobbyProps) {
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPlayer = async (playerId: string) => {
    setSelecting(playerId);
    setError(null);
    try {
      await onSelectOpponent(playerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
      setSelecting(null);
    }
  };

  const formatWaitTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card max-w-md w-full"
      >
        <div className="text-center mb-6">
          <span className="text-4xl">🎲</span>
          <h2 className="font-display text-2xl font-bold text-gray-800 mt-2">
            Quick Match Lobby
          </h2>
          <p className="text-gray-500 text-sm">
            Click on a player to start a game!
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4"
          >
            {error}
          </motion.div>
        )}

        {/* Player list */}
        <div className="bg-purple-50 rounded-xl p-4 mb-6 min-h-[200px] max-h-[300px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {players.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-[180px] text-gray-500"
              >
                <div className="spinner w-8 h-8 mb-3"></div>
                <p className="text-center">
                  Waiting for players to join...
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  You're the first one here!
                </p>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {players.map((player, index) => (
                  <motion.button
                    key={player.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleSelectPlayer(player.id)}
                    disabled={selecting !== null}
                    className={`w-full p-3 rounded-lg flex items-center justify-between transition-all ${
                      selecting === player.id
                        ? 'bg-purple-500 text-white'
                        : 'bg-white hover:bg-purple-100 hover:shadow-md'
                    } ${selecting !== null && selecting !== player.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">😺</span>
                      <div className="text-left">
                        <p className={`font-medium ${selecting === player.id ? 'text-white' : 'text-gray-800'}`}>
                          {player.name}
                        </p>
                        <p className={`text-xs ${selecting === player.id ? 'text-purple-200' : 'text-gray-400'}`}>
                          Waiting {formatWaitTime(player.waitingFor)}
                        </p>
                      </div>
                    </div>
                    {selecting === player.id ? (
                      <div className="spinner w-5 h-5 border-white border-t-transparent"></div>
                    ) : (
                      <span className="text-purple-500 font-medium">Play →</span>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center text-gray-400 text-sm mb-4">
          {players.length} player{players.length !== 1 ? 's' : ''} waiting
        </div>

        <button
          onClick={onLeave}
          className="w-full text-gray-500 hover:text-gray-700"
        >
          ← Leave Lobby
        </button>
      </motion.div>
    </div>
  );
}
