import { useEffect, useRef } from 'react';
import type { SoundName } from './useSound';

/** Celebrate either player's win once; returning to play arms the next game. */
export function useWinSound(winner: string | undefined, playSound: (name: SoundName) => void) {
  const announced = useRef(false);
  useEffect(() => {
    if (!winner) { announced.current = false; return; }
    if (announced.current) return;
    const timer = setTimeout(() => {
      announced.current = true;
      playSound('winVoice');
    }, 500);
    return () => clearTimeout(timer);
  }, [winner, playSound]);
}
