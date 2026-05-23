import { useEffect } from 'react';
import { useSnapshotActions } from '@/stores/snapshot-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useFlushOnHidden');

/**
 * Flush dirty snapshot when the page becomes hidden (tab switch, minimize,
 * mobile background, reload, tab close). `visibilitychange → hidden` is the
 * most reliable "page may disappear" signal — fires earlier than beforeunload
 * and works on mobile Safari (which barely fires beforeunload).
 *
 * Fire-and-forget: autoSaveSnapshot() self-guards on !isDirty/isSaving, so
 * redundant fires (frequent tab switching) no-op. Best-effort only — an async
 * save can still be cut short on abrupt tab kill; not a hard guarantee.
 *
 * Must be called exactly ONCE per editor session.
 */
export function useFlushOnHidden(): void {
  const { autoSaveSnapshot } = useSnapshotActions();

  useEffect(() => {
    const flush = (reason: string) => {
      if (document.visibilityState !== 'hidden') return;
      log.info('useFlushOnHidden', 'page hidden, flushing snapshot', { reason });
      autoSaveSnapshot();
    };

    const onVisibilityChange = () => flush('visibilitychange');
    // pagehide covers actual teardown (incl. bfcache) as a last-line backstop.
    const onPageHide = () => flush('pagehide');

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [autoSaveSnapshot]);
}
