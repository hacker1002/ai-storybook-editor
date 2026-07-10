// stages-creative-space.tsx - Root container for stages creative space
// Manages selected stage key and active content tab; delegates to sidebar + content area.
//
// Collab (ADR-044 §Revision 2026-07-10 — per-entity HELD session): a USER click on a stage acquires
// ONE per-entity lock (step 2 / rtype 5, resource_id = stage key). Every entity write (name / location
// / variant add·edit·delete / attribute sections / sound add·edit·delete / generate·edit image)
// mutates the snapshot node and is persisted as the WHOLE entity node on release / switch. Mount does
// NOT auto-acquire (lock-on-click); the first stage is shown READ-ONLY until clicked.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { StagesSidebar } from './stages-sidebar';
import { StagesContentArea } from './stages-content-area';
import { useStageKeys, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useLocationActions } from '@/stores/location-store';
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
import type { StageContentTab } from './stages-content-area';

const log = createLogger('Editor', 'StagesCreativeSpace');

export function StagesCreativeSpace() {
  const bookId = useCurrentBookId();
  useCollabPersistSession(bookId);
  useContentSyncSession(bookId);

  const stageKeys = useStageKeys();
  const actions = useSnapshotActions();
  const { fetchLocations } = useLocationActions();
  const [userSelectedStageKey, setUserSelectedStageKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StageContentTab>('variants');
  // LOCK-ON-CLICK choke point: the stage the user CLICKED to edit → held lock target. null until click.
  const [lockedKey, setLockedKey] = useState<string | null>(null);

  // Fetch locations on mount
  useEffect(() => {
    log.info('StagesCreativeSpace', 'mount — fetching locations');
    fetchLocations();
  }, [fetchLocations]);

  // Derive DISPLAY stage: user choice if valid, else first available (read-only until locked).
  const selectedStageKey = useMemo(() => {
    if (userSelectedStageKey && stageKeys.includes(userSelectedStageKey)) {
      return userSelectedStageKey;
    }
    return stageKeys[0] ?? null;
  }, [stageKeys, userSelectedStageKey]);

  // ── Per-entity held session ──────────────────────────────────────────────────────────────────
  const lockTarget = useMemo<LockTarget | null>(
    () => (lockedKey ? { step: 2, resource_type: 5, resource_id: lockedKey, locale: null } : null),
    [lockedKey],
  );

  // Live read of the locked stage node — reads getState() by the closure `lockedKey` so a switch's
  // release-cleanup still sees the OLD key.
  const getNode = useCallback(
    () => (lockedKey ? useSnapshotStore.getState().stages.find((s) => s.key === lockedKey) ?? null : null),
    [lockedKey],
  );

  const buildPayload = useCallback(
    (node: unknown): SavePayload => ({ action_type: 3, patch: node, log: true }),
    [],
  );

  const handleLockBlocked = useCallback((holder: string) => {
    log.info('handleLockBlocked', 'stage held by another editor', { hasHolder: !!holder });
    toast.info('Another editor is editing this stage — your change was not saved.');
    setLockedKey(null);
  }, []);

  const handleLockLost = useCallback(
    (baseline: unknown) => {
      log.warn('handleLockLost', 'stage lock lost — revert + deselect', { hasBaseline: baseline != null });
      if (lockedKey && baseline != null) {
        actions.revertEntityNode('stage', lockedKey, baseline);
      }
      setLockedKey(null);
      toast.warning('You lost the edit lock for this stage — your changes were reverted.');
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

  const entityEditable = lockStatus === 'held' && lockedKey === selectedStageKey && lockedKey !== null;

  const handleStageSelect = useCallback((key: string) => {
    log.info('handleStageSelect', 'user selected stage — set held target', { key });
    setUserSelectedStageKey(key);
    setLockedKey(key);
  }, []);

  const handleEntityDeleted = useCallback((key: string) => {
    log.info('handleEntityDeleted', 'held stage deleted — release lock', { key });
    setLockedKey((prev) => (prev === key ? null : prev));
    setUserSelectedStageKey((prev) => (prev === key ? null : prev));
  }, []);

  const handleTabChange = useCallback((tab: StageContentTab) => {
    log.debug('handleTabChange', 'tab changed', { tab });
    setActiveTab(tab);
  }, []);

  log.debug('render', 'StagesCreativeSpace', { stageCount: stageKeys.length, lockStatus, entityEditable });

  return (
    <div className="flex h-full" role="main" aria-label="Stages creative space">
      <StagesSidebar
        stageKeys={stageKeys}
        selectedStageKey={selectedStageKey}
        onStageSelect={handleStageSelect}
        editable={entityEditable}
        onEntityDeleted={handleEntityDeleted}
      />
      <div className="relative flex-1 overflow-hidden">
        <CollabEditBadge
          editable={entityEditable}
          status={lockStatus}
          idleLabel="Click a stage to edit"
        />
        {/* Per-entity undo/redo (ADR-045) — disabled until there's history for the held entity. */}
        <UndoRedoControls className="absolute top-3 right-3 z-10" />
        {selectedStageKey ? (
          <StagesContentArea
            key={lockedKey ?? selectedStageKey}
            selectedStageKey={selectedStageKey}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            editable={entityEditable}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a stage</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StagesCreativeSpace;
