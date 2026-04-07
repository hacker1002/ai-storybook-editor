// use-player-orientation.ts - Detect viewport orientation (portrait vs landscape) via matchMedia
import { useState, useEffect } from 'react';

export type PlayerOrientation = 'portrait' | 'landscape';

const PORTRAIT_QUERY = '(orientation: portrait)';

/**
 * Returns current viewport orientation. Updates on orientation change.
 * Only meaningful for share preview (mobile); caller decides whether to use.
 */
export function usePlayerOrientation(): PlayerOrientation {
  const [orientation, setOrientation] = useState<PlayerOrientation>(() =>
    typeof window !== 'undefined' && window.matchMedia(PORTRAIT_QUERY).matches
      ? 'portrait'
      : 'landscape'
  );

  useEffect(() => {
    const mql = window.matchMedia(PORTRAIT_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      setOrientation(e.matches ? 'portrait' : 'landscape');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return orientation;
}
