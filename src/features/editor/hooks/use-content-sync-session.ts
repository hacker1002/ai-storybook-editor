// use-content-sync-session — mounts the realtime CONTENT-sync channel for a sketch
// creative space. Sibling of `use-collab-persist-session` (which mounts the edit-LOCK
// channel + collabPersist flag). Both are mounted together by the 2 sketch spaces.
//
// On enter (per bookId): opens the ONE content-sync channel on
// `collaboration_activity_logs`, so a peer's save/reorder/generate INSERTs a
// `metadata.sync` row that this client refetches (INVOKER RPC) and merges into the
// snapshot store — B sees fresh content without a manual refresh (ADR-043 follow-up).
// On leave: tears the channel down.
//
// Imperative store access (getState) — this hook drives an external system (a realtime
// channel); it does NOT render off store state (no set-state-in-effect / ref-in-render).

import { useEffect } from 'react';
import { useContentSyncStore } from '@/stores/content-sync-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useContentSyncSession');

/**
 * @param bookId  the open book (null → no channel; effect is a no-op until it lands).
 */
export function useContentSyncSession(bookId: string | null): void {
  useEffect(() => {
    if (!bookId) return;
    log.info('enter', 'enter sketch space — connect content-sync', { bookId });
    useContentSyncStore.getState().connect(bookId);

    return () => {
      log.info('leave', 'leave sketch space — disconnect content-sync', { bookId });
      useContentSyncStore.getState().disconnect();
    };
  }, [bookId]); // deps = STRING bookId; drives an external system, not React state.
}
