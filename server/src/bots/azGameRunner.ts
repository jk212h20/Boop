// Pump: when it's the AZ's turn in a given room, fetch its move from the
// AZ service and apply it to the game. Broadcast the resulting state
// via the provided socket.io emitter.
//
// This is called after every human move (and after the AZ's own
// graduation-option resolution) to handle the full "AZ plays until
// it's the human's turn again (or the game ends)" chain.

import { Server } from 'socket.io';
import { Room } from '../rooms/RoomManager';
import { PlayerColor } from '../game/types';
import { AzClient, AzServiceBadRequest, AzServiceUnavailable } from './azClient';

// Synthetic socket id used to represent the AZ player inside BoopGame.
// Matched to a per-room suffix so multiple rooms' AZ players don't alias.
export function azSocketId(roomId: string): string {
  return `az-bot:${roomId}`;
}

// Pump the AZ as many consecutive moves as it owes. Returns nothing.
// Emits `game_update` / `game_over` broadcasts as it goes, same shape
// as the human-move path.
export async function pumpAzMoves(
  io: Server,
  room: Room,
  client: AzClient,
  azColor: PlayerColor,
  maxMoves: number = 10
): Promise<void> {
  const azId = azSocketId(room.id);

  for (let i = 0; i < maxMoves; i++) {
    const state = room.game.getState();

    // Done?
    if (state.phase === 'finished') return;

    // Is it the AZ's turn to do _something_?
    // Two cases:
    //  1) phase=playing and currentTurn=azColor -> place a piece
    //  2) phase=selecting_graduation and pendingGraduationPlayer=azColor -> pick an option
    const playing = state.phase === 'playing' && state.currentTurn === azColor;
    const selectingForAz =
      state.phase === 'selecting_graduation' && state.pendingGraduationPlayer === azColor;

    if (!playing && !selectingForAz) return;

    let move;
    try {
      move = await client.requestMove(state, azColor);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[az] requestMove failed in room ${room.code}: ${msg}`);
      io.to(room.id).emit('az_error', {
        error:
          err instanceof AzServiceBadRequest
            ? `AZ rejected the request: ${msg}`
            : err instanceof AzServiceUnavailable
              ? `AZ service is unavailable: ${msg}`
              : `AZ failed: ${msg}`,
      });
      return;
    }

    if (move.kind === 'place') {
      if (!playing) {
        console.error(
          `[az] AZ returned a 'place' move but phase=${state.phase}; aborting pump`
        );
        io.to(room.id).emit('az_error', {
          error: 'AZ returned the wrong move type for current phase',
        });
        return;
      }
      const row = move.row!;
      const col = move.col!;
      const pieceType = move.pieceType!;
      const result = room.game.placePiece(azId, row, col, pieceType);
      if (!result.valid) {
        console.error(`[az] placePiece rejected: ${result.error}`);
        io.to(room.id).emit('az_error', {
          error: `AZ move rejected by game engine: ${result.error}`,
        });
        return;
      }
      const updatedState = room.game.getState();
      io.to(room.id).emit('game_update', {
        gameState: updatedState,
        lastMove: { row, col, pieceType },
        boopedPieces: result.boopedPieces,
        graduatedPieces: result.graduatedPieces,
        newCatsEarned: result.newCatsEarned,
        requiresGraduationChoice: result.requiresGraduationChoice,
        pendingGraduationOptions: result.pendingGraduationOptions,
      });
      if (result.winner) {
        io.to(room.id).emit('game_over', {
          winner: result.winner,
          winCondition: result.winCondition,
          gameState: updatedState,
        });
        return;
      }
      room.lastActivity = new Date();
      continue;
    }

    // kind === 'graduation'
    if (!selectingForAz) {
      console.error(
        `[az] AZ returned a 'graduation' move but phase=${state.phase}; aborting pump`
      );
      io.to(room.id).emit('az_error', {
        error: 'AZ returned the wrong move type for current phase',
      });
      return;
    }
    const optionIndex = move.optionIndex!;
    const result = room.game.selectGraduation(azId, optionIndex);
    if (!result.valid) {
      console.error(`[az] selectGraduation rejected: ${result.error}`);
      io.to(room.id).emit('az_error', {
        error: `AZ graduation choice rejected: ${result.error}`,
      });
      return;
    }
    const updatedState = room.game.getState();
    io.to(room.id).emit('game_update', {
      gameState: updatedState,
      graduatedPieces: result.graduatedPieces,
      newCatsEarned: result.newCatsEarned,
    });
    if (result.winner) {
      io.to(room.id).emit('game_over', {
        winner: result.winner,
        winCondition: result.winCondition,
        gameState: updatedState,
      });
      return;
    }
    room.lastActivity = new Date();
    // Loop — after a graduation choice, the AZ may still be on the board
    // (rare but possible if multiple 3-in-a-row lines emerge).
  }

  console.warn(`[az] pumpAzMoves hit maxMoves=${maxMoves} guard in room ${room.code}`);
}
