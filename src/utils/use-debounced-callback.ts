// use-debounced-callback.ts
// Tiny debounce hook — no npm dep (YAGNI/KISS).
// Returns a stable callback that delays invoking `fn` until `delayMs` has elapsed
// since the last call. Latest `fn` is read via ref so callers don't need to memoize it.
// Pending timer is cleared on unmount.

import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest fn without retriggering the stable callback below.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  // Clear any pending timer when unmounted.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
