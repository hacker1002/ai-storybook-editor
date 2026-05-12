// use-before-unload-warning.ts — Warn user when closing tab with unsaved dirty form.

import { useEffect } from 'react';

export function useBeforeUnloadWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom strings but still gate on returnValue.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
