import { useEffect } from 'react';
import { useIsDirty, useSnapshotActions } from '@/stores/snapshot-store';
import { useResourceLockStore } from '@/stores/resource-lock-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useAutoSave');

const AUTO_SAVE_DELAY_MS = 60_000;

/**
 * Registers a single auto-save timer in EditorPage.
 * - isDirty → true: starts 60s countdown
 * - isDirty → false (manual save cleared it): cancels timer
 * - Timer fires → autoSaveSnapshot()
 * - collabPersist → true (inside a sketch collab space): NEVER schedules — every
 *   flush is delegated to the gateway `releaseAndSave` (write-path §7 / ADR-043).
 *   Read reactively so entering/leaving a sketch space re-runs this effect and
 *   cancels any pending timer.
 * Must be called exactly ONCE per editor session.
 */
export function useAutoSave(): void {
  const isDirty = useIsDirty();
  const collabPersist = useResourceLockStore((s) => s.collabPersist);
  const { autoSaveSnapshot } = useSnapshotActions();

  useEffect(() => {
    if (collabPersist) {
      log.debug('useAutoSave', 'collabPersist active — owner-direct autoSave suppressed (gateway routes flush)');
      return;
    }
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
  }, [isDirty, collabPersist, autoSaveSnapshot]);
}
