// One timing contract for the live board, network queue, and local bot handoff.
export const DROP_DURATION_MS = 400;
export const BOOP_DELAY_MS = DROP_DURATION_MS + 100;
export const BOOP_DURATION_MS = 500;
export const GRADUATION_DELAY_MS = BOOP_DELAY_MS + BOOP_DURATION_MS + 100;
export const GRADUATION_HIGHLIGHT_MS = 800;
// Covers the 650ms 3D removal and the 700ms fly-to-pool transition.
export const GRADUATION_REMOVAL_MS = 700;

export function animationDurationMs(effects: {
  graduatedPieces?: readonly unknown[];
  boopedPieces?: readonly unknown[];
}): number {
  if (effects.graduatedPieces?.length) {
    return GRADUATION_DELAY_MS + GRADUATION_HIGHLIGHT_MS + GRADUATION_REMOVAL_MS + 100;
  }
  if (effects.boopedPieces?.length) return BOOP_DELAY_MS + BOOP_DURATION_MS + 200;
  return DROP_DURATION_MS + 100;
}
