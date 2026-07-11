// use-collab-persist-session — mounts the collaborator edit-lock session for a
// sketch creative space. Shared by BOTH sketch spaces (spreads + variants) — DRY.
//
// On enter (per bookId): opens the ONE realtime lock channel for the book and flips
// `collabPersist` true, so snapshot-store suppresses the owner-direct `autoSaveSnapshot`
// and every flush is delegated to the gateway via `releaseAndSave` (write-path §7 /
// ADR-043). On leave: tears the channel down and clears the flag.
//
// Imperative store access (getState) — this hook drives an external system (realtime
// channel + a global mode flag), it does not render off store state.

import { useEffect } from 'react';
import { useResourceLockStore } from '@/stores/resource-lock-store';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useEditSessionStatusStore } from '@/stores/edit-session-status-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useCollabPersistSession');

/**
 * @param bookId  the open book (null → no channel; effect is a no-op until it lands).
 */
export function useCollabPersistSession(bookId: string | null): void {
  // Header save-label ownership (ADR-044/045) — the ONE choke point for ALL 6 collab spaces (the 5
  // held-session spaces AND both sketch spaces, which share this hook). A mounted collab space
  // switches the header off the snapshot auto-save label onto the session-driven Unsaved → Saving…
  // → Saved cycle (never "Auto-saved"). Ref-counted, so it survives StrictMode's mount/unmount/mount
  // and space→space transitions. Kept mount-scoped (empty deps) rather than bookId-scoped so the
  // signal matches the space lifetime, not the async book load.
  useEffect(() => {
    useEditSessionStatusStore.getState().enter();
    return () => useEditSessionStatusStore.getState().leave();
  }, []);

  useEffect(() => {
    if (!bookId) return;

    const store = useResourceLockStore.getState();
    // Whether the user carried pre-existing owner-direct unsaved work INTO the collab
    // space. If clean, everything edited here is gateway-persisted (gateway never
    // touches snapshot isDirty) → safe to clear on exit. If dirty, that non-collab work
    // still needs the legacy autosave flush, so we must NOT clear it (M1 mitigation).
    const enteredDirty = useSnapshotStore.getState().sync.isDirty;
    log.info('enter', 'enter sketch collab space — connect + collabPersist on', { bookId, enteredDirty });
    store.connect(bookId);
    store.setCollabPersist(true);

    return () => {
      const s = useResourceLockStore.getState();
      log.info('leave', 'leave sketch collab space — disconnect + collabPersist off', { bookId });
      s.disconnect();
      // disconnect() already resets collabPersist to false; call it explicitly as a
      // defense-in-depth guard against a future disconnect() that forgets to.
      s.setCollabPersist(false);
      // Clear the collab-introduced dirty flag so leaving to a NON-collab editor space
      // does not fire a stale owner-direct autosave/publish (ADR-043 / M1). Only when
      // we entered clean — otherwise preserve the pre-existing non-collab dirty state.
      if (!enteredDirty) {
        useSnapshotStore.getState().clearDirty();
      }
    };
  }, [bookId]);
}
