// Motion policy for the 3D scene. The board is a game, but a player who asks
// their OS for reduced motion should not be shown arcs, tumbles or shakes.
let reduced = false;
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = query.matches;
  const update = (event: MediaQueryListEvent) => { reduced = event.matches; };
  if (typeof query.addEventListener === 'function') query.addEventListener('change', update);
  else query.addListener?.(update);
}

export const prefersReducedMotion = () => reduced;
