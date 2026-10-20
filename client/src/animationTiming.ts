// One timing contract for the live board, network queue, and local bot handoff.
// A newly placed kitten WALKS onto the quilt (no more teleport-drop), and a
// booped cat performs a full crouch→air→land jump.
export const WALK_IN_MS = 1100;
export const DROP_DURATION_MS = 400;
export const BOOP_DELAY_MS = DROP_DURATION_MS + 100;
export const BOOP_DURATION_MS = 2900;
// A cat pushed off the bed lands, trots to the inventory box and looks up
// before it hops in. That trip is purely cosmetic: it runs on its own timer and
// never extends the move budget, so it cannot hold up the next turn.
export const FALLEN_TRIP_MS = 4200;
export const GRADUATION_DELAY_MS = BOOP_DELAY_MS + BOOP_DURATION_MS + 100;
export const GRADUATION_HIGHLIGHT_MS = 800;
// 700ms ascent followed by staggered cats jumping down into the reserve.
export const GRADUATION_REMOVAL_MS = 2100;

export function animationDurationMs(effects: {
  graduatedPieces?: readonly unknown[];
  boopedPieces?: readonly unknown[];
}): number {
  if (effects.graduatedPieces?.length) {
    return GRADUATION_DELAY_MS + GRADUATION_HIGHLIGHT_MS + GRADUATION_REMOVAL_MS + 100;
  }
  // A returned-to-box trip deliberately adds nothing here.
  if (effects.boopedPieces?.length) return BOOP_DELAY_MS + BOOP_DURATION_MS + 200;
  return WALK_IN_MS + 100;
}
