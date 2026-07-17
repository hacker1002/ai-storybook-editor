// sketch-consent-store.ts — UI-session state for the sketch-normalize consent modal (ADR-047
// phase-03). The modal's ROW LIST derives from snapshot-store's `sketchDegraded` (single source);
// this store only remembers which rows the user DISMISSED this session (refuse is session-only —
// D11: never persisted, every reload re-asks) and hosts the accept/dismiss actions.
//
// Import direction: this store imports snapshot-store — NEVER the reverse (loadSketch stays
// unaware of the modal; the host component reacts to state instead), so no module cycle exists.

import { create } from 'zustand';
import { createLogger } from '@/utils/logger';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { SketchDegradedEntry } from '@/stores/snapshot-store/slices/sketch-normalize';
import { consentKey, writeAccepted } from '@/utils/sketch-consent-storage';

const log = createLogger('Store', 'SketchConsentStore');

/** Session-dismiss identity of one degraded entry (resource + blob signature). */
export function dismissKeyOf(entry: Pick<SketchDegradedEntry, 'resource' | 'sig'>): string {
  return `${entry.resource}|${entry.sig}`;
}

interface SketchConsentState {
  /** Entries the user chose to LEAVE degraded this session ("Để nguyên" / ESC). A new anomaly
   *  (different resource or sig) is never in here → the modal re-opens for it. */
  dismissedKeys: string[];
  /** User closed the modal without consenting → remember every listed row for this session. */
  dismiss: (keys: string[]) => void;
  /** User consented to reset these resources: persist the accept decisions (localStorage,
   *  keyed per snapshot+resource+sig) and lift the degraded/save-block state. The empty
   *  placeholder reaches the DB only at the next NORMAL save (D4). */
  accept: (resources: string[]) => void;
  /** Re-open the modal for everything still degraded (banner "Xem lại lựa chọn"). */
  reopen: () => void;
}

export const useSketchConsentStore = create<SketchConsentState>()((set, get) => ({
  dismissedKeys: [],

  dismiss: (keys) => {
    if (keys.length === 0) return;
    log.info('dismiss', 'user kept resources degraded (read-only, save blocked)', { count: keys.length });
    const next = new Set([...get().dismissedKeys, ...keys]);
    set({ dismissedKeys: Array.from(next) });
  },

  accept: (resources) => {
    if (resources.length === 0) return;
    const snap = useSnapshotStore.getState();
    const entries = snap.sketchDegraded.filter((e) => resources.includes(e.resource));
    log.info('accept', 'consent granted — reset will persist at the next normal save', {
      resources,
      matched: entries.length,
    });
    for (const e of entries) {
      writeAccepted(consentKey(snap.meta.id, e.resource, e.sig));
    }
    snap.resolveSketchDegraded(resources);
  },

  reopen: () => {
    log.info('reopen', 'clearing session dismissals — modal re-opens for degraded resources');
    set({ dismissedKeys: [] });
  },
}));
