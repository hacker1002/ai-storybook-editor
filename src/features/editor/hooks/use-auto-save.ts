import { useEffect } from 'react';
import { useIsDirty, useSnapshotActions } from '@/stores/snapshot-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useAutoSave');

const AUTO_SAVE_DELAY_MS = 60_000;

/**
 * Registers a single auto-save timer in EditorPage.
 * - isDirty → true: starts 60s countdown
 * - isDirty → false (manual save cleared it): cancels timer
 * - Timer fires → autoSaveSnapshot()
 * Must be called exactly ONCE per editor session.
 */
export function useAutoSave(): void {
  const isDirty = useIsDirty();
  const { autoSaveSnapshot } = useSnapshotActions();

  useEffect(() => {
    if (!isDirty) {
      log.debug('useAutoSave', 'not dirty, timer not started');
      return;
    }

    log.debug('useAutoSave', 'dirty detected, scheduling auto-save', { delayMs: AUTO_SAVE_DELAY_MS });
    const timer = setTimeout(() => {
      log.info('useAutoSave', 'timer fired, triggering auto-save');
      autoSaveSnapshot();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      log.debug('useAutoSave', 'cleanup timer');
      clearTimeout(timer);
    };
  }, [isDirty, autoSaveSnapshot]);
}
