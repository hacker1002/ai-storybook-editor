// characters-creative-space.tsx - Root container for characters creative space
// Manages selected character key and active content tab; delegates to sidebar + content area.
//
// Collab (ADR-044 §Revision 2026-07-10 — per-entity HELD session): a USER click on a character in
// the list acquires ONE per-entity lock (step 2 / rtype 3, resource_id = character key). Every entity
// write (name / basic_info / personality / variant add·edit·delete / voice / generate·edit image)
// mutates the snapshot node and is persisted as the WHOLE entity node on release / switch — replacing
// the former per-mutation fire-and-forget saves. Mount does NOT auto-acquire (lock-on-click); the
// first character is shown READ-ONLY until clicked. `useContentSyncSession` reconciles the realtime
// winner's node back into the store.

import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { CharactersSidebar } from './characters-sidebar';
import { CharactersContentArea, type CharacterContentTab } from './characters-content-area';
import { useCharacterKeys, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { createLogger } from '@/utils/logger';
import { useCurrentBookId } from '@/stores/book-store';
import { useCollabPersistSession } from '@/features/editor/hooks/use-collab-persist-session';
import { useContentSyncSession } from '@/features/editor/hooks/use-content-sync-session';
import { useHeldResourceSession } from '@/features/editor/hooks/use-held-resource-session';
import { useEditHistoryStore } from '@/stores/edit-history-store';
import { buildItemKey } from '@/stores/edit-history-store/item-key';
import type { LockTarget, SavePayload } from '@/stores/resource-lock-store';
import { CollabEditBadge } from '@/features/editor/components/shared-components/collab-edit-badge';
import { UndoRedoControls } from '@/features/editor/components/shared-components/undo-redo-controls';

const log = createLogger('Editor', 'CharactersCreativeSpace');

const DEFAULT_CHARACTER_TAB: CharacterContentTab = 'variants';

export function CharactersCreativeSpace() {
  const bookId = useCurrentBookId();
  useCollabPersistSession(bookId);
  useContentSyncSession(bookId);

  const characterKeys = useCharacterKeys();
  const actions = useSnapshotActions();
  const [userSelectedCharacterKey, setUserSelectedCharacterKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CharacterContentTab>(DEFAULT_CHARACTER_TAB);
  // LOCK-ON-CLICK choke point: the character the user CLICKED to edit → the held lock target. Stays
  // null until a genuine user click (never auto-selected) so the lock never auto-acquires on mount.
  const [lockedKey, setLockedKey] = useState<string | null>(null);

  // Derive DISPLAY character: user choice if valid, else first available (read-only until locked).
  const selectedCharacterKey = useMemo(() => {
    if (userSelectedCharacterKey && characterKeys.includes(userSelectedCharacterKey)) {
      return userSelectedCharacterKey;
    }
    return characterKeys[0] ?? null;
  }, [characterKeys, userSelectedCharacterKey]);

  // ── Per-entity held session ──────────────────────────────────────────────────────────────────
  // Lock target — null until a USER click sets `lockedKey`. Keyed on the STRING key only (React-19).
  const lockTarget = useMemo<LockTarget | null>(
    () => (lockedKey ? { step: 2, resource_type: 3, resource_id: lockedKey, locale: null } : null),
    [lockedKey],
  );

  // Live (non-reactive) read of the locked character node — baseline + dirty-diff source. Reads
  // getState() by the closure `lockedKey` so a switch's release-cleanup still sees the OLD key.
  const getNode = useCallback(
    () => (lockedKey ? useSnapshotStore.getState().characters.find((c) => c.key === lockedKey) ?? null : null),
    [lockedKey],
  );

  // Whole entity node → gateway save payload (backend contract: action_type 3, patch = whole node).
  const buildPayload = useCallback(
    (node: unknown): SavePayload => ({ action_type: 3, patch: node, log: true }),
    [],
  );

  // 409 on acquire → another editor holds this character. Toast + drop the click (idle) so a re-click
  // can retry. `useContentSyncSession` will still reflect their edits.
  const handleLockBlocked = useCallback((holder: string) => {
    log.info('handleLockBlocked', 'character held by another editor', { hasHolder: !!holder });
    toast.info('Another editor is editing this character — your change was not saved.');
    setLockedKey(null);
  }, []);

  // Heartbeat 409 → lock stolen mid-edit. Revert the whole entity node to the pre-edit baseline
  // (drop un-saved local edits), deselect the lock, and toast.
  const handleLockLost = useCallback(
    (baseline: unknown) => {
      log.warn('handleLockLost', 'character lock lost — revert + deselect', { hasBaseline: baseline != null });
      if (lockedKey && baseline != null) {
        actions.revertEntityNode('character', lockedKey, baseline);
      }
      setLockedKey(null);
      toast.warning('You lost the edit lock for this character — your changes were reverted.');
    },
    [lockedKey, actions],
  );

  // ── Undo/redo nexus (ADR-045) — per-entity WHOLE-node history; shares the held baseline clone.
  const beginSession = useEditHistoryStore((s) => s.beginSession);
  const endSession = useEditHistoryStore((s) => s.endSession);
  const handleAcquired = useCallback(
    (target: LockTarget, baseline: unknown) => {
      beginSession(buildItemKey('illustration-entity', target), baseline, 'illustration-entity');
    },
    [beginSession],
  );
  const handleReleased = useCallback(
    (target: LockTarget) => {
      endSession(buildItemKey('illustration-entity', target));
    },
    [endSession],
  );

  const { status: lockStatus } = useHeldResourceSession({
    target: lockTarget,
    getNode,
    ownedKeys: undefined, // entity = per-entity grain → baseline/dirty/save on the WHOLE node
    buildPayload,
    onBlocked: handleLockBlocked,
    onLost: handleLockLost,
    onAcquired: handleAcquired,
    onReleased: handleReleased,
  });

  // Editable only while THIS editor holds the lock for the character on screen (grey-out otherwise).
  const entityEditable = lockStatus === 'held' && lockedKey === selectedCharacterKey && lockedKey !== null;

  // USER-initiated select → set BOTH the display key and the held lock target (lock-on-click). The
  // held session release-saves the OLD character then acquires the new one when the key changes.
  const handleCharacterSelect = useCallback((key: string) => {
    log.info('handleCharacterSelect', 'user selected character — set held target', { key });
    setUserSelectedCharacterKey(key);
    setLockedKey(key);
  }, []);

  // Delete of the currently-held character → drop the lock so the held session release-saves the
  // (now removed) node. Only ever called for the held character (delete is gated on entityEditable).
  const handleEntityDeleted = useCallback((key: string) => {
    log.info('handleEntityDeleted', 'held character deleted — release lock', { key });
    setLockedKey((prev) => (prev === key ? null : prev));
    setUserSelectedCharacterKey((prev) => (prev === key ? null : prev));
  }, []);

  const handleTabChange = useCallback((tab: CharacterContentTab) => {
    log.debug('handleTabChange', 'tab changed', { tab });
    setActiveTab(tab);
  }, []);

  log.debug('render', 'CharactersCreativeSpace', {
    characterCount: characterKeys.length,
    lockStatus,
    entityEditable,
  });

  return (
    <div className="flex h-full" role="main" aria-label="Characters creative space">
      <CharactersSidebar
        characterKeys={characterKeys}
        selectedCharacterKey={selectedCharacterKey}
        onCharacterSelect={handleCharacterSelect}
        editable={entityEditable}
        onEntityDeleted={handleEntityDeleted}
      />
      <div className="relative flex-1 overflow-hidden">
        {/* Collab lock affordance — NEVER hidden (2-state: Editing / click-to-edit). */}
        <CollabEditBadge
          editable={entityEditable}
          status={lockStatus}
          idleLabel="Click a character to edit"
        />
        {/* Per-entity undo/redo (ADR-045) — disabled until there's history for the held entity. */}
        <UndoRedoControls className="absolute top-3 right-3 z-10" />
        {selectedCharacterKey ? (
          <CharactersContentArea
            // key={lockedKey ?? selectedCharacterKey} resets per-entity panel state on switch via
            // remount (NOT setState-in-effect). Falls back to the display key while unlocked.
            key={lockedKey ?? selectedCharacterKey}
            selectedCharacterKey={selectedCharacterKey}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            editable={entityEditable}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No character selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
