// edit-session-status-store — global UI status for the collab HELD edit session (ADR-044/045).
// Decouples the header save-label from the 60s snapshot auto-save loop: while any collab creative
// space is mounted, the header shows Unsaved (holding lock) → Saving… (release-save in flight) →
// Saved, and NEVER "Auto-saved". Written ONLY by useHeldResourceSession (single choke point — DRY);
// read by EditorPage which folds it into the header SaveStatus. `mountCount` ref-counts mounted
// collab spaces (>0 ⇒ collab UI active) so it survives StrictMode's mount/unmount/mount. Every
// exported selector returns a PRIMITIVE → no useShallow footgun.

import { useEffect } from 'react';
import { create } from 'zustand';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'EditSessionStatusStore');

/** Save lifecycle of the most-recent held session release. `idle` = fresh/holding (label driven by
 *  the active-history key instead), `saving` = release-save in flight, `saved` = persisted. */
export type CollabSavePhase = 'idle' | 'saving' | 'saved';

interface EditSessionStatusState {
  /** Ref-count of mounted collab creative spaces (0 outside them; normally 0 or 1). */
  mountCount: number;
  savePhase: CollabSavePhase;
  /** Commit-now hook for the active collab space: releases its held lock (→ save + unlock). Set by
   *  the mounted space; called by the header "Unsaved" button. Null when no collab space is active. */
  commitFn: (() => void) | null;
  /** A collab space mounted (its held-session hook ran) → switch the header into collab-label mode. */
  enter: () => void;
  /** A collab space unmounted → fall back to snapshot-derived status when count hits 0. */
  leave: () => void;
  /** Release-save started (dirty). */
  markSaving: () => void;
  /** Release-save finished (or nothing to save) → terminal "Saved". */
  markSaved: () => void;
  /** New session acquired → clear a stale terminal phase (the active-history key drives the label). */
  resetPhase: () => void;
  /** The active space registers its commit-now callback (idempotent-safe: last registrant wins). */
  registerCommit: (fn: () => void) => void;
  /** Unregister on unmount — guarded so a late cleanup can't clobber the next space's registration. */
  clearCommit: (fn: () => void) => void;
}

export const useEditSessionStatusStore = create<EditSessionStatusState>((set) => ({
  mountCount: 0,
  savePhase: 'idle',
  commitFn: null,
  enter: () => set((s) => ({ mountCount: s.mountCount + 1 })),
  leave: () => set((s) => ({ mountCount: Math.max(0, s.mountCount - 1) })),
  markSaving: () => {
    log.debug('markSaving', 'release-save in flight');
    set({ savePhase: 'saving' });
  },
  markSaved: () => {
    log.debug('markSaved', 'release-save settled');
    set({ savePhase: 'saved' });
  },
  resetPhase: () => set({ savePhase: 'idle' }),
  registerCommit: (fn) => set({ commitFn: fn }),
  clearCommit: (fn) => set((s) => (s.commitFn === fn ? { commitFn: null } : s)),
}));

/**
 * Register the active collab space's "commit now" callback (release the held lock → save + unlock)
 * so the global header "Unsaved" button can trigger it. `commit` MUST be stable (wrap in useCallback
 * with stable setter deps). One collab space is mounted at a time → single-slot registry is safe.
 */
export function useRegisterEditCommit(commit: () => void): void {
  useEffect(() => {
    useEditSessionStatusStore.getState().registerCommit(commit);
    return () => useEditSessionStatusStore.getState().clearCommit(commit);
  }, [commit]);
}

/** True while ≥1 collab creative space is mounted → header uses the session-driven save label. */
export const useCollabUiActive = (): boolean =>
  useEditSessionStatusStore((s) => s.mountCount > 0);

/** Current release-save phase for the header label. */
export const useCollabSavePhase = (): CollabSavePhase =>
  useEditSessionStatusStore((s) => s.savePhase);
