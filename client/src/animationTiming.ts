// One timing contract for the live board, network queue, and local bot handoff.
// A newly placed piece drops straight down onto its square and settles, and a
// booped cat performs a full crouch→air→land jump.
export const PLACEMENT_DROP_MS = 700;
// How long the board waits before a boop starts: the drop has landed by then.
export const DROP_DURATION_MS = 400;
export const BOOP_DELAY_MS = DROP_DURATION_MS + 100;
// The 3D hop is .8s: crouch, airborne arc, landing absorb. A graduation is
// detected the moment the last piece lands on its square — not after the whole
// move budget has elapsed.
export const BOOP_LAND_MS = BOOP_DELAY_MS + 800;
export const BOOP_DURATION_MS = 2900;
// A cat pushed off the bed lands, trots to the box it belongs in, leaps out of
// frame and drops back into the box from above. That trip is purely cosmetic:
// it runs on its own timer and never extends the move budget. The allowance
// covers landing, a long carpet run, the leap and the drop — a slow trip must
// not be cut off mid-run.
export const FALLEN_TRIP_MS = 12000;
// A breath after the last piece settles before the glow starts.
export const GRADUATION_SETTLE_MS = 120;
export const GRADUATION_HIGHLIGHT_MS = 800;
// 700ms ascent followed by staggered cats jumping down into the reserve.
export const GRADUATION_REMOVAL_MS = 2100;

// A meow is for the cats that actually leave the bed: a boop that slides a
// piece along the quilt should not yowl. Two at most, so a double boop is a
// small chorus instead of a pile-up.
export const MEOW_LIMIT = 2;
export function offBoardBoops<T extends { to: unknown }>(booped: readonly T[]): T[] {
  return booped.filter(effect => effect.to === null).slice(0, MEOW_LIMIT);
}

export interface TimingEffects {
  graduatedPieces?: readonly { row: number; col: number }[];
  boopedPieces?: readonly { to: { row: number; col: number } | null }[];
  lastMove?: { row: number; col: number } | null;
}

/**
 * When the graduation glow begins: as soon as every graduating piece is on its
 * square. A piece booped into the line arrives after the hop; the piece that
 * was just placed arrives after its drop; anything already settled has already
 * landed. The old fixed delay also waited out the full boop budget, which left
 * a long dead pause between the pieces landing and the glow starting.
 */
export function graduationDelayMs(effects: TimingEffects): number {
  let landed = 0;
  for (const piece of effects.graduatedPieces ?? []) {
    const boopedIn = (effects.boopedPieces ?? []).some(
      effect => effect.to && effect.to.row === piece.row && effect.to.col === piece.col
    );
    const placed = !!effects.lastMove &&
      effects.lastMove.row === piece.row && effects.lastMove.col === piece.col;
    landed = Math.max(landed, boopedIn ? BOOP_LAND_MS : placed ? DROP_DURATION_MS : 0);
  }
  return landed + GRADUATION_SETTLE_MS;
}

export function animationDurationMs(effects: TimingEffects): number {
  if (effects.graduatedPieces?.length) {
    return graduationDelayMs(effects) + GRADUATION_HIGHLIGHT_MS + GRADUATION_REMOVAL_MS + 100;
  }
  // A returned-to-box trip deliberately adds nothing here.
  if (effects.boopedPieces?.length) return BOOP_DELAY_MS + BOOP_DURATION_MS + 200;
  return PLACEMENT_DROP_MS + 100;
}
