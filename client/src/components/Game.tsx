import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, PlayerColor, PieceType, GameOverInfo, Cell, Piece, BoopEffect } from '../types';
import { PlayerPool, calculateFallenPosition, GraduatingPiece, FallenPiece } from './Board';
import { FloatingBoard3D } from './FloatingBoard3D';
import { useSound } from '../hooks/useSound';
import { useWinSound } from '../hooks/useWinSound';
import { usePageVisible } from '../hooks/usePageVisible';
import { optionsAt, promotionLabel } from '../graduationChoices';
import { useGameHistory } from '../hooks/useGameHistory';
import { HistorySlider } from './HistorySlider';
import {
  BOOP_DELAY_MS, FALLEN_TRIP_MS, GRADUATION_HIGHLIGHT_MS, offBoardBoops,
  animationDurationMs, graduationDelayMs,
} from '../animationTiming';

// Ghost piece data to show where pieces were before being booped
interface GhostPiece {
  row: number;
  col: number;
  piece: Piece;
}

interface GameProps {
  gameState: GameState;
  playerColor: PlayerColor;
  roomCode: string;
  onPlacePiece: (row: number, col: number, pieceType: PieceType) => Promise<boolean>;
  onSelectGraduation?: (optionIndex: number) => Promise<boolean>;
  onLeave: () => void;
  gameOver: GameOverInfo | null;
  opponentDisconnected: boolean;
  opponentMayReconnect?: boolean;
  // Bot game specific props
  isBotGame?: boolean;
  botThinking?: boolean;
  onRematch?: () => void;
}

export function Game({ 
  gameState, 
  playerColor, 
  roomCode, 
  onPlacePiece, 
  onSelectGraduation,
  onLeave,
  gameOver,
  opponentDisconnected,
  opponentMayReconnect = false,
  isBotGame = false,
  botThinking = false,
  onRematch,
}: GameProps) {
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType>('kitten');
  const [error, setError] = useState<string | null>(null);
  const [promotionBusy, setPromotionBusy] = useState(false);
  const promotionLock = useRef(false);
  const [ambiguousCell, setAmbiguousCell] = useState<Cell | null>(null);
  const [promotionReady, setPromotionReady] = useState(false);
  const [highlightedOption, setHighlightedOption] = useState<number | null>(null);
  
  // Animation state - tracks the current move's effects for animation
  const [animatingBoops, setAnimatingBoops] = useState<BoopEffect[]>([]);
  const [animatingGraduations, setAnimatingGraduations] = useState<GraduatingPiece[]>([]);
  // 'visible' = graduating pieces are on the board and not yet reacting;
  // 'highlighting' = they play the sparkle+scale keyframes in-place;
  // 'removing' = they fade out and scale away, then get cleared.
  // null = no graduation in progress.
  const [graduationPhase, setGraduationPhase] = useState<
    'visible' | 'highlighting' | 'removing' | null
  >(null);
  const [ghostPieces, setGhostPieces] = useState<GhostPiece[]>([]);
  // Returning cats carry their own clock. Their trip is cosmetic, so it must
  // not extend the move budget or be cancelled by the next turn: each piece is
  // stamped with an id and retired by its own timer.
  const [fallenPieces, setFallenPieces] = useState<FallenPiece[]>([]);
  const fallenIdRef = useRef(0);
  const fallenTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearFallen = () => {
    fallenTimersRef.current.forEach(clearTimeout);
    fallenTimersRef.current = [];
    setFallenPieces([]);
  };
  useEffect(() => () => {
    fallenTimersRef.current.forEach(clearTimeout);
    fallenTimersRef.current = [];
  }, []);
  const [animationKey, setAnimationKey] = useState(0);
  const [animatedMove, setAnimatedMove] = useState<Cell | null>(null);
  const pageVisible = usePageVisible();
  const hiddenBoard = useRef<GameState['board'] | null>(null);
  const [settledAfterHide, setSettledAfterHide] = useState(!pageVisible);
  
  // Track previous board state to get piece data for ghosts
  const prevBoardRef = useRef(gameState.board);
  
  // Track previous player states for history recording
  const prevPlayersRef = useRef({
    orange: { kittensInPool: gameState.players.orange?.kittensInPool ?? 8, catsInPool: gameState.players.orange?.catsInPool ?? 0 },
    gray: { kittensInPool: gameState.players.gray?.kittensInPool ?? 8, catsInPool: gameState.players.gray?.catsInPool ?? 0 }
  });
  
  // Sound system
  const { playSound } = useSound();
  
  // Game history for reviewing past moves
  const gameHistory = useGameHistory(gameState.board);

  const isMyTurn = !gameOver && gameState.phase !== 'finished' && gameState.currentTurn === playerColor;
  const myPlayer = gameState.players[playerColor];
  const opponentColor: PlayerColor = playerColor === 'orange' ? 'gray' : 'orange';
  const opponent = gameState.players[opponentColor];
  
  // Check if we're in graduation selection phase
  const isSelectingGraduation = gameState.phase === 'selecting_graduation' && 
    gameState.pendingGraduationPlayer === playerColor;
  const graduationOptions = gameState.pendingGraduationOptions || [];

  // Determine what to display based on history viewing.
  //
  // During graduation animation we overlay the graduating pieces back onto
  // their cells so they're visible and can be highlighted before being
  // removed. Without this the cells blank the instant gameState.board
  // arrives from the server (which already has the cells empty), leading
  // to the "flash of already-removed pieces" bug. Board.tsx's render
  // handles the actual removal animation once we clear animatingGraduations.
  const displayBoard = useMemo(() => {
    if (gameHistory.isViewingHistory) return gameHistory.viewingBoard;
    if (animatingGraduations.length === 0) return gameState.board;
    // Copy the board and restore each graduating cell.
    const merged = gameState.board.map(row => row.slice());
    for (const gp of animatingGraduations) {
      // Only restore if currently empty (don't clobber pieces that landed
      // there since — shouldn't happen but be defensive).
      if (!merged[gp.row][gp.col]) {
        merged[gp.row][gp.col] = gp.piece;
      }
    }
    return merged;
  }, [gameHistory.isViewingHistory, gameHistory.viewingBoard, gameState.board, animatingGraduations]);
  
  // Get historical player pools if viewing history
  const displayPools = useMemo(() => {
    if (gameHistory.isViewingHistory && gameHistory.viewingMove) {
      return gameHistory.viewingMove.playersAfter;
    }
    const pools = {
      orange: { kittensInPool: gameState.players.orange?.kittensInPool ?? 0, catsInPool: gameState.players.orange?.catsInPool ?? 0 },
      gray: { kittensInPool: gameState.players.gray?.kittensInPool ?? 0, catsInPool: gameState.players.gray?.catsInPool ?? 0 }
    };
    // Returned stock appears only after the actor joins its inventory portrait.
    fallenPieces.forEach(({piece}) => {
      const key = piece.type === 'kitten' ? 'kittensInPool' : 'catsInPool';
      pools[piece.color][key] = Math.max(0, pools[piece.color][key] - 1);
    });
    return pools;
  }, [gameHistory.isViewingHistory, gameHistory.viewingMove, gameState.players, fallenPieces]);

  // Get highlighted cell (the placed piece) when viewing history
  const historyHighlightedCell = useMemo(() => {
    if (gameHistory.isViewingHistory && gameHistory.viewingMove) {
      return {
        row: gameHistory.viewingMove.placement.row,
        col: gameHistory.viewingMove.placement.col
      };
    }
    return null;
  }, [gameHistory.isViewingHistory, gameHistory.viewingMove]);

  // Animation data for history view - show boops and fallen pieces with animations
  const historyAnimationData = useMemo(() => {
    if (gameHistory.isViewingHistory && gameHistory.viewingMove) {
      const boops = gameHistory.viewingMove.boops;
      const placement = gameHistory.viewingMove.placement;
      const fallen: FallenPiece[] = [];
      const ghosts: GhostPiece[] = [];
      
      for (const boop of boops) {
        // Create ghost at original position
        ghosts.push({
          row: boop.from.row,
          col: boop.from.col,
          piece: boop.piece
        });
        
        // Calculate fallen position for pieces booped off
        // Use the placement position as the push source for correct direction
        if (boop.to === null) {
          const fp = calculateFallenPosition(boop.from, boop.piece, { row: placement.row, col: placement.col });
          if (fp) fallen.push(fp);
        }
      }
      
      return { boops, fallen, ghosts };
    }
    return { boops: animatingBoops, fallen: fallenPieces, ghosts: ghostPieces };
  }, [gameHistory.isViewingHistory, gameHistory.viewingMove, animatingBoops, fallenPieces, ghostPieces]);

  // Trigger animation when history move changes
  useEffect(() => {
    if (gameHistory.isViewingHistory) {
      // Increment animation key to trigger new animations instantly (abort any current)
      setAnimationKey(prev => prev + 1);
    }
  }, [gameHistory.currentMoveIndex, gameHistory.isViewingHistory]);

  // Record moves to history when game state changes
  useEffect(() => {
    if (gameState.lastMove) {
      const lastPlayer: PlayerColor = gameState.currentTurn === 'orange' ? 'gray' : 'orange';
      const boopEffects: BoopEffect[] = (gameState.boopedPieces || []).map(bp => ({
        from: bp.from,
        to: bp.to,
        piece: bp.piece || prevBoardRef.current[bp.from.row]?.[bp.from.col] || { color: lastPlayer, type: 'kitten' as PieceType }
      }));
      
      // Get piece type from the placed piece on the board
      const placedPiece = gameState.board[gameState.lastMove.row][gameState.lastMove.col];
      const pieceType: PieceType = placedPiece?.type || 'kitten';
      
      const orangePlayer = gameState.players.orange;
      const grayPlayer = gameState.players.gray;
      
      gameHistory.recordMove(
        prevBoardRef.current,
        gameState.board,
        lastPlayer,
        { 
          row: gameState.lastMove.row, 
          col: gameState.lastMove.col, 
          pieceType
        },
        boopEffects,
        gameState.graduatedPieces || [],
        prevPlayersRef.current,
        { 
          orange: { kittensInPool: orangePlayer?.kittensInPool ?? 0, catsInPool: orangePlayer?.catsInPool ?? 0 }, 
          gray: { kittensInPool: grayPlayer?.kittensInPool ?? 0, catsInPool: grayPlayer?.catsInPool ?? 0 }
        }
      );
      
      // Update previous players ref
      prevPlayersRef.current = {
        orange: { kittensInPool: orangePlayer?.kittensInPool ?? 0, catsInPool: orangePlayer?.catsInPool ?? 0 },
        gray: { kittensInPool: grayPlayer?.kittensInPool ?? 0, catsInPool: grayPlayer?.catsInPool ?? 0 }
      };
    }
  }, [gameState.lastMove]);

  // Animation timing (must match the 3D board).
  //
  // Timeline for a move that both boops and graduates:
  //   t=0               move arrives; pieces visible in pre-graduation position
  //                     (displayBoard overlays graduating pieces back onto their cells).
  //   0..DROP_DURATION  newly-placed piece drops in.
  //   BOOP_DELAY        booped pieces start hopping.
  //   IMPACT            the last graduating piece lands on its square, so the
  //                     sparkle+glow highlight starts on that impact rather
  //                     than after the whole boop budget.
  //   +GRADUATION_HIGHLIGHT_DURATION  highlight ends; the rise begins.
  //   +GRADUATION_REMOVAL_DURATION    removal (ascent + reserve arrival) ends.
  // Cells are cleared from displayBoard only after the final phase ends,
  // so the visual order is: move, boop, glow, rise.
  const BOOP_DELAY = BOOP_DELAY_MS;
  const GRADUATION_HIGHLIGHT_DURATION = GRADUATION_HIGHLIGHT_MS;

  // Commit the new board and its effects before any frame can see the old
  // move's overlays attached to the new board.
  useLayoutEffect(() => {
    // Retire every overlay belonging to the previous update, even when its
    // timer was cancelled by a fast reply, history navigation, or a reset.
    // Otherwise displayBoard restores already-graduated kittens indefinitely.
    setAnimatingBoops([]);
    setAnimatingGraduations([]);
    setGraduationPhase(null);
    setGhostPieces([]);
    setAnimatedMove(null);
    // Fallen pieces are deliberately not cleared here: a cat still walking
    // home belongs to its own trip, not to this update.

    // Never replay a hidden move or the interrupted move on tab return.
    // Visibility is a dependency so hiding also cancels every phase timer.
    const alreadyConsumed = hiddenBoard.current === gameState.board;
    if (!pageVisible || alreadyConsumed) {
      hiddenBoard.current = gameState.board;
      clearFallen();
      setSettledAfterHide(true);
      prevBoardRef.current = gameState.board;
      return;
    }
    hiddenBoard.current = null;
    setSettledAfterHide(false);
    // Don't animate during history viewing - that's handled separately
    if (gameHistory.isViewingHistory) {
      clearFallen();
      prevBoardRef.current = gameState.board;
      return;
    }
    
    const booped = gameState.boopedPieces || [];
    const graduated = gameState.graduatedPieces || [];
    
    setAnimatedMove(gameState.lastMove);
    // Increment animation key for new animations
    setAnimationKey(prev => prev + 1);
    
    // Only animate if there are new boops or graduations
    if (booped.length > 0 || graduated.length > 0) {
      // Create ghost pieces from the previous board state
      const newGhosts: GhostPiece[] = [];
      const newFallen: FallenPiece[] = [];
      
      for (const bp of booped) {
        // Use embedded piece data if available (from server/bot), fallback to board lookup
        const piece = bp.piece || prevBoardRef.current[bp.from.row]?.[bp.from.col];
        if (piece) {
          // Calculate fallen position for pieces booped off
          // Use lastMove as the pusher position to get correct direction
          if (bp.to === null) {
            // Piece fell off - add to fallen, don't show ghost (the fallen piece animates)
            const fp = calculateFallenPosition(bp.from, piece, gameState.lastMove || undefined);
            if (fp) newFallen.push(fp);
          } else {
            // Piece moved to new board position - show ghost at original position
            newGhosts.push({
              row: bp.from.row,
              col: bp.from.col,
              piece: { ...piece }
            });
          }
        }
      }
      
      // Set animation state - boops, ghosts, and fallen pieces immediately
      // (Board.tsx animation handles the delay timing)
      setAnimatingBoops(booped);
      setGhostPieces(newGhosts);
      if (newFallen.length > 0) {
        const stamped: FallenPiece[] = newFallen.map(piece => ({ ...piece, id: ++fallenIdRef.current }));
        const ids = new Set(stamped.map(piece => piece.id));
        setFallenPieces(previous => [...previous, ...stamped]);
        fallenTimersRef.current.push(setTimeout(() => {
          setFallenPieces(previous => previous.filter(piece => !ids.has(piece.id)));
        }, FALLEN_TRIP_MS));
      }
      
      // Graduation: keep the pieces on the board (via displayBoard merge)
      // and step through three phases:
      //   1. 'visible' — pieces are just there, no special rendering.
      //      This covers the placement-drop and boop phases.
      //   2. 'highlighting' — triggered the moment the last graduating piece
      //      lands. The 3D actor eases the glow in from zero so the pulse and
      //      point light never pop on, and keeps it lit into the rise.
      //   3. 'removing' — triggered after the highlight finishes: the piece
      //      ascends while the glow fades out.
      // Finally we clear animatingGraduations, displayBoard snaps to the
      // post-graduation state, and the cells become empty.
      const timers: ReturnType<typeof setTimeout>[] = [];
      const graduationDelay = graduationDelayMs({
        graduatedPieces: graduated,
        boopedPieces: booped,
        lastMove: gameState.lastMove,
      });
      if (graduated.length > 0) {
        // The piece comes with the event. Reading it from prevBoardRef used to
        // guess: a line made by a boop sits on cells that were empty — or held
        // the other player's piece — before the move, which surfaced
        // mixed-colour kittens in the removal animation.
        const graduatingWithPieces: GraduatingPiece[] = graduated.map(cell => ({
          row: cell.row,
          col: cell.col,
          piece: { ...cell.piece },
        }));
        // Set the full graduation list immediately so displayBoard keeps
        // the pieces visible from t=0.
        setAnimatingGraduations(graduatingWithPieces);
        setGraduationPhase('visible');

        timers.push(setTimeout(() => {
          setGraduationPhase('highlighting');
          playSound('graduate');
        }, graduationDelay));

        timers.push(setTimeout(() => {
          setGraduationPhase('removing');


        }, graduationDelay + GRADUATION_HIGHLIGHT_DURATION));
      }
      
      // Play sounds with proper timing
      if (gameState.lastMove) {
        playSound('place');
      }
      
      if (booped.length > 0) {
        timers.push(setTimeout(() => playSound('boop'), BOOP_DELAY));
      }

      // A cat that gets shoved off the bed yowls on the way down, staggered so
      // two of them sound like two cats rather than one louder cat.
      offBoardBoops(booped).forEach((_, index) => {
        timers.push(setTimeout(() => playSound('meow'), BOOP_DELAY + 430 + index * 240));
      });
      
      // Clear animation state after all animations complete
      const totalAnimationTime = animationDurationMs({
        graduatedPieces: graduated,
        boopedPieces: booped,
        lastMove: gameState.lastMove,
      });

      timers.push(setTimeout(() => {
        setAnimatedMove(null);
        setAnimatingBoops([]);
        setAnimatingGraduations([]);
        setGraduationPhase(null);
        setGhostPieces([]);
      }, totalAnimationTime));

      // Update previous board reference. Must happen on every effect run —
      // including the boop/graduation branch — otherwise `prevBoardRef`
      // stays stuck on a stale board for all future turns. When a later
      // move graduates a piece at a cell whose *stale* occupant was the
      // opposite color, the graduation restore logic (see `displayBoard`
      // above and the `prevBoardRef.current[cell.row]?.[cell.col]` lookup
      // a few lines up) would surface that stale piece, producing a
      // one-frame flash in the wrong color during the highlight animation.
      prevBoardRef.current = gameState.board;

      return () => timers.forEach(clearTimeout);
    } else if (gameState.lastMove) {
      // Just a placement with no boops
      playSound('place');
      setGhostPieces([]);
      prevBoardRef.current = gameState.board;
      const timer = setTimeout(() => setAnimatedMove(null), animationDurationMs(gameState));
      return () => clearTimeout(timer);
    }

    // Update previous board reference (no-boop / no-graduation path).
    prevBoardRef.current = gameState.board;
  }, [gameState.board, gameState.lastMove, gameState.boopedPieces, gameState.graduatedPieces, playSound, gameHistory.isViewingHistory, pageVisible]);

  useWinSound(gameOver?.winner, playSound);

  // Auto-select available piece type
  useEffect(() => {
    if (!myPlayer) return;
    
    if (selectedPieceType === 'kitten' && myPlayer.kittensInPool === 0 && myPlayer.catsInPool > 0) {
      setSelectedPieceType('cat');
    } else if (selectedPieceType === 'cat' && myPlayer.catsInPool === 0 && myPlayer.kittensInPool > 0) {
      setSelectedPieceType('kitten');
    }
  }, [myPlayer, selectedPieceType]);

  useEffect(() => {
    setPromotionReady(false);
    setAmbiguousCell(null);
    setHighlightedOption(null);
    if (!isSelectingGraduation || !pageVisible) return;
    // A pending choice is already known, but let its preceding move land.
    const timer = setTimeout(() => setPromotionReady(true), animationDurationMs(gameState));
    return () => clearTimeout(timer);
  }, [gameState.board, isSelectingGraduation, pageVisible]);

  const selectPromotion = async (index: number) => {
    if (!promotionReady || promotionLock.current || !onSelectGraduation) return;
    promotionLock.current = true;
    setPromotionBusy(true);
    setError(null);
    try {
      const accepted = await onSelectGraduation(index);
      if (!accepted) throw new Error('Promotion was not accepted. Please try again.');
      setAmbiguousCell(null);
      setHighlightedOption(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select promotion');
    } finally {
      promotionLock.current = false;
      setPromotionBusy(false);
    }
  };

  const handleCellClick = async (row: number, col: number) => {
    // If viewing history, return to current game
    if (gameHistory.isViewingHistory) {
      gameHistory.goToEnd();
      return;
    }
    
    if (gameState.phase === 'selecting_graduation') {
      if (!isSelectingGraduation || !promotionReady || promotionBusy) return;
      const choices = optionsAt(graduationOptions, row, col);
      if (choices.length === 1) await selectPromotion(choices[0]);
      else if (choices.length > 1) setAmbiguousCell({row, col});
      return;
    }
    if (!isMyTurn) return;
    
    setError(null);
    try {
      await onPlacePiece(row, col, selectedPieceType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place piece');
    }
  };

  const handleSelectPiece = (type: PieceType) => {
    setSelectedPieceType(type);
    setError(null);
  };

  return (
    <div className="min-h-screen py-4 px-2">
      {/* Flying graduation pieces overlay.
          Rendered as fixed-position elements on top of everything so the
          animation from board cell -> pool isn't clipped by container
          overflow or ancestor transforms. Each piece arcs slightly
          upward mid-flight via a keyframe y-offset, decays to 0.5 scale
          (to fit the pool slot), and fades out on arrival. */}


      <div className={`game-page${gameOver ? ' game-finished' : ''}`}>
        {/* Header */}
        <div className="game-header flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold text-boop-orange-600">
              🐱 Boop!
            </span>
            <span className="text-sm text-gray-500 room-code bg-white/50 px-2 py-1 rounded">
              {roomCode}
            </span>
          </div>
          <button
            onClick={onLeave}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Leave Game
          </button>
        </div>

        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-xl mb-4 text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Opponent disconnected warning */}
        <AnimatePresence>
          {opponentDisconnected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`px-4 py-2 rounded-xl mb-4 text-center ${
                opponentMayReconnect 
                  ? 'bg-blue-100 border border-blue-300 text-blue-800'
                  : 'bg-yellow-100 border border-yellow-300 text-yellow-800'
              }`}
            >
              {opponentMayReconnect ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                  <span>Opponent disconnected - waiting for them to reconnect...</span>
                </div>
              ) : (
                <span>⚠️ Your opponent has left the game</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Turn indicator - above board (fixed height container to prevent board jumping) */}
        {!gameHistory.isViewingHistory && !gameOver && (
          <div className="text-center mb-1 h-8 flex items-center justify-center">
            {!isMyTurn ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-full shadow"
              >
                {botThinking ? (
                  <>
                    <div className="spinner w-4 h-4"></div>
                    <span className="text-gray-700 font-medium">🤖 Bot is thinking...</span>
                  </>
                ) : (
                  <span className="text-gray-600 font-medium">Opponent's turn...</span>
                )}
              </motion.div>
            ) : (
              <span className="text-boop-orange-600 font-medium">Your turn!</span>
            )}
          </div>
        )}

        {/* Out-of-flow status never moves the bed or inventories. */}
        <AnimatePresence>
          {gameOver && (
            <motion.div className="game-win-status" role="status"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <strong>{gameOver.winner === playerColor ? 'You win!' : 'Opponent wins'}</strong>
              <span>{gameOver.winCondition === 'three_cats_in_row' ? 'Three cats in a row' : 'Eight cats on the bed'}</span>
              {isBotGame && onRematch && <button onClick={onRematch}>Rematch</button>}
              <button onClick={onLeave}>Menu</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game layout */}
        <div className="game-layout">
          {/* Opponent's pool (top/left) */}
          {opponent && (
            <div className="game-pool-opponent">
              <PlayerPool
                color={opponentColor}
                kittensInPool={displayPools[opponentColor].kittensInPool}
                catsInPool={displayPools[opponentColor].catsInPool}
                isMyTurn={!gameOver && !isMyTurn && !gameHistory.isViewingHistory}
                selectedPieceType={null}
                onSelectPiece={() => {}}
                playerName={opponent.name}
                isCurrentPlayer={false}
              />
            </div>
          )}

          {/* Board */}
          <div className="game-board">
            <FloatingBoard3D
              board={displayBoard}
              winningColor={gameOver && !gameHistory.isViewingHistory ? gameOver.winner : undefined}
              onCellClick={handleCellClick}
              isMyTurn={isMyTurn && gameState.phase !== 'selecting_graduation' && !gameHistory.isViewingHistory}
              promotionOptions={isSelectingGraduation && !gameHistory.isViewingHistory ? graduationOptions : []}
              promotionEnabled={promotionReady && !promotionBusy}
              promotionHighlight={highlightedOption}
              onPromotionHighlight={setHighlightedOption}
              onPromotionSelect={selectPromotion}
              promotionCell={ambiguousCell}
              onPromotionDismiss={() => setAmbiguousCell(null)}
              lastMove={gameHistory.isViewingHistory || settledAfterHide || !pageVisible ? null : animatedMove}
              selectedPieceType={isMyTurn && !gameHistory.isViewingHistory ? selectedPieceType : null}
              myColor={playerColor}
              boopedPieces={historyAnimationData.boops}
              graduatingPieces={gameHistory.isViewingHistory ? [] : animatingGraduations}
              graduationPhase={gameHistory.isViewingHistory ? null : graduationPhase}
              highlightedCell={historyHighlightedCell}
              isViewingHistory={gameHistory.isViewingHistory}
              fallenPieces={historyAnimationData.fallen}
              animationKey={animationKey}
            />
            {gameState.phase === 'selecting_graduation' && !gameHistory.isViewingHistory && (
              <section className="promotion-strip" aria-label="Promotion choices" aria-busy={promotionBusy}>
                <p role="status">{!isSelectingGraduation ? 'Opponent choosing a promotion…' : promotionBusy ? 'Promoting…' : !promotionReady ? 'Letting the pieces settle…' : graduationOptions.some(o => o.length === 1) && graduationOptions.some(o => o.length === 3) ? 'Choose a kitten to promote, or a line of three.' : graduationOptions.some(o => o.length === 3) ? 'Choose a line of three to promote.' : 'Choose a kitten to promote.'}</p>
                {isSelectingGraduation && <div className="promotion-choices">{graduationOptions.map((cells, index) => (
                  <button key={index} type="button" disabled={!promotionReady || promotionBusy}
                    className={highlightedOption === index ? 'selected' : ''}
                    onFocus={() => setHighlightedOption(index)} onBlur={() => setHighlightedOption(null)}
                    onMouseEnter={() => setHighlightedOption(index)} onMouseLeave={() => setHighlightedOption(null)}
                    onClick={() => selectPromotion(index)}>{promotionLabel(cells)}</button>
                ))}</div>}
                {error && <p role="alert">{error}</p>}
              </section>
            )}
          </div>

          {/* My pool (bottom/right) */}
          {myPlayer && (
            <div className="game-pool-self">
              <PlayerPool
                color={playerColor}
                kittensInPool={displayPools[playerColor].kittensInPool}
                catsInPool={displayPools[playerColor].catsInPool}
                isMyTurn={isMyTurn && !gameHistory.isViewingHistory}
                selectedPieceType={isMyTurn && !gameHistory.isViewingHistory ? selectedPieceType : null}
                onSelectPiece={handleSelectPiece}
                playerName={myPlayer.name}
                isCurrentPlayer={true}
              />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="game-instructions">
          {gameHistory.isViewingHistory ? (
            <p className="text-blue-600">📜 Viewing move history - click board or "Return to game" to continue playing</p>
          ) : gameOver ? (
            <p>Game complete — start a rematch when you’re ready.</p>
          ) : gameState.phase === 'selecting_graduation' ? (
            <p>{isSelectingGraduation ? 'Choose on the board, or use the promotion buttons above.' : 'Waiting for the opponent’s promotion choice.'}</p>
          ) : isMyTurn ? (
            <p>
              Select a piece from your pool, then click an empty cell to place it.
              <br />
              <span className="text-boop-orange-600 font-medium">
                {selectedPieceType === 'kitten' ? '🐱 Placing Kitten' : '😼 Placing Cat'}
              </span>
            </p>
          ) : botThinking ? (
            <div className="flex items-center justify-center gap-2">
              <div className="spinner w-4 h-4"></div>
              <span>🤖 Bot is thinking...</span>
            </div>
          ) : (
            <p>Waiting for opponent's move...</p>
          )}
        </div>

        {/* History Slider */}
        <HistorySlider
          history={gameHistory.history}
          currentMoveIndex={gameHistory.currentMoveIndex}
          onGoToMove={gameHistory.goToMove}
          onGoToStart={gameHistory.goToStart}
          onGoToEnd={gameHistory.goToEnd}
          onGoBack={gameHistory.goBack}
          onGoForward={gameHistory.goForward}
          isViewingHistory={gameHistory.isViewingHistory}
        />
      </div>

    </div>
  );
}
