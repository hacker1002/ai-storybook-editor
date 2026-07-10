// spreads-creative-space.tsx - Root container for illustration spreads creative space
"use client";

import { useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { Users, Lock } from "lucide-react";
import { SpreadsMainView } from "./spreads-main-view";
import { SpreadsSidebar } from "./spreads-sidebar";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";
import { useCurrentBookId } from "@/stores/book-store";
import { useCollabPersistSession } from "@/features/editor/hooks/use-collab-persist-session";
import { useContentSyncSession } from "@/features/editor/hooks/use-content-sync-session";
import { useHeldResourceSession } from "@/features/editor/hooks/use-held-resource-session";
import { SCENE_OWNED_KEYS } from "@/stores/snapshot-store/slices/collab-owned-subtree";
import { useEditHistoryStore } from "@/stores/edit-history-store";
import { buildItemKey } from "@/stores/edit-history-store/item-key";
import { UndoRedoControls } from "@/features/editor/components/shared-components/undo-redo-controls";
import type { LockTarget, SavePayload } from "@/stores/resource-lock-store";
import { useSpaceViewState, useEffectiveSpreadId } from "@/features/editor/hooks/use-space-view-state";
import { ZOOM, COLUMNS } from "@/constants/spread-constants";
import type { ViewMode } from "@/types/canvas-types";
import type { SelectedItem } from "./utils";

const log = createLogger("Editor", "SpreadsCreativeSpace");

export function SpreadsCreativeSpace() {
  const bookId = useCurrentBookId();
  // Collab: SCENE space is collab-LIVE. ADR-044 §Revision 2026-07-10 (per-spread held session): a
  // click on a spread acquires ONE per-spread SCENE lock (step 2 / rtype 6); every IN-SPREAD scene
  // write (raw_images / raw_textboxes / manuscript / pages / branch_setting / tiny_sketch_media_url)
  // mutates the snapshot node and is persisted as ONE owned-key sub-tree on release / saveNow —
  // replacing the former per-node fire-and-forget saves. SPREAD-level collection ops (create / delete
  // / reorder a whole spread) keep their explicit saves. `useContentSyncSession` reconciles the
  // realtime winner's version back into the store.
  useCollabPersistSession(bookId);
  useContentSyncSession(bookId);

  const actions = useSnapshotActions();

  // useShallow: .map() returns new array ref each call — must shallow-compare
  const illustrationSpreadIds = useSnapshotStore(
    useShallow((s) => s.illustration?.spreads?.map((sp) => sp.id) ?? [])
  );

  const [selectedItemId, setSelectedItemId] = useState<SelectedItem | null>(
    null
  );
  // LOCK-ON-CLICK choke point (ADR-044): the spread the user CLICKED to edit → the SCENE held-lock
  // target. Stays null until a genuine user click (never auto-selected) so the lock never
  // auto-acquires on the auto-select / view-restore path.
  const [lockedSpreadId, setLockedSpreadId] = useState<string | null>(null);

  const { activeSpreadId, zoomLevel, viewMode, columnsPerRow, patch } = useSpaceViewState('spread');
  const effectiveSpreadId = useEffectiveSpreadId(activeSpreadId, illustrationSpreadIds);

  // ── SCENE per-spread held session (ADR-044 §Revision 2026-07-10) ─────────────────────────────

  // Lock target — null until a USER click sets `lockedSpreadId`. Keyed on the STRING id only
  // (React-19: no object dep churn).
  const sceneLockTarget = useMemo<LockTarget | null>(
    () =>
      lockedSpreadId
        ? { step: 2, resource_type: 6, resource_id: lockedSpreadId, locale: null }
        : null,
    [lockedSpreadId],
  );

  // Live (non-reactive) read of the locked spread node — baseline + dirty-diff source. Reads
  // getState() by the closure `lockedSpreadId` so a switch's release-cleanup still sees the OLD id.
  const getSceneNode = useCallback(
    () =>
      lockedSpreadId
        ? useSnapshotStore.getState().illustration.spreads.find((s) => s.id === lockedSpreadId) ?? null
        : null,
    [lockedSpreadId],
  );

  // Owned sub-tree → gateway save payload (backend contract: action_type 3 edit, patch = SCENE
  // owned-key sub-object, log:true). step/rtype/id/locale come from the LockTarget.
  const buildScenePayload = useCallback(
    (subtree: unknown): SavePayload => ({ action_type: 3, patch: subtree, log: true }),
    [],
  );

  // 409 on acquire → another editor holds this spread's scene sub-tree. Toast + drop the click
  // (target → null → idle) so a re-click can retry.
  const handleSceneLockBlocked = useCallback(
    (holder: string) => {
      log.info("handleSceneLockBlocked", "spread scene held by another editor", { hasHolder: !!holder });
      toast.info("Another editor is editing this spread — your change was not saved.");
      setLockedSpreadId(null);
      setSelectedItemId(null);
    },
    [],
  );

  // Heartbeat 409 → lock stolen mid-edit. Revert the SCENE owned sub-tree to the pre-edit baseline
  // (drop un-saved local edits), deselect, and drop the lock.
  const handleSceneLockLost = useCallback(
    (baseline: unknown) => {
      log.warn("handleSceneLockLost", "scene lock lost — revert + deselect", {
        hasBaseline: baseline != null,
      });
      if (lockedSpreadId && baseline != null) {
        actions.revertSceneOwnedSubtree(lockedSpreadId, baseline);
      }
      setLockedSpreadId(null);
      setSelectedItemId(null);
      toast.warning("You lost the edit lock for this spread — your changes were reverted.");
    },
    [lockedSpreadId, actions],
  );

  // ── Undo/redo nexus (ADR-045) — begin/endSession tie 1:1 to the held-session lifecycle.
  // Share the ONE baseline clone the hook already made (no re-clone). onReleased fires on
  // release / switch / unmount / lock-LOST (the hook calls it in all those paths).
  const beginSession = useEditHistoryStore((s) => s.beginSession);
  const endSession = useEditHistoryStore((s) => s.endSession);
  const handleSceneAcquired = useCallback(
    (target: LockTarget, baseline: unknown) => {
      beginSession(buildItemKey("illustration-scene", target), baseline, "illustration-scene");
    },
    [beginSession],
  );
  const handleSceneReleased = useCallback(
    (target: LockTarget) => {
      endSession(buildItemKey("illustration-scene", target));
    },
    [endSession],
  );

  const { status: sceneLockStatus, saveNow: sceneSaveNow } = useHeldResourceSession({
    target: sceneLockTarget,
    getNode: getSceneNode,
    ownedKeys: SCENE_OWNED_KEYS,
    buildPayload: buildScenePayload,
    onBlocked: handleSceneLockBlocked,
    onLost: handleSceneLockLost,
    onAcquired: handleSceneAcquired,
    onReleased: handleSceneReleased,
  });

  // The active spread is editable only while THIS editor holds its SCENE lock (grey-out otherwise).
  const spreadEditable = sceneLockStatus === "held" && lockedSpreadId === effectiveSpreadId;

  // USER-initiated spread click → acquire (switch = release-then-acquire, handled by the hook when
  // the target string key changes). NEVER called from the programmatic auto-select path.
  const handleSpreadUserSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadUserSelect", "user selected spread — set held target", { spreadId });
    setLockedSpreadId(spreadId);
  }, []);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadSelect", "spread selected", { spreadId });
    patch({ activeSpreadId: spreadId });
    setSelectedItemId(null);
  }, [patch]);

  const handleViewModeChange = useCallback((mode: ViewMode) => { patch({ viewMode: mode }); }, [patch]);
  const handleZoomChange = useCallback((level: number) => { patch({ zoomLevel: level }); }, [patch]);
  const handleColumnsChange = useCallback((columns: number) => { patch({ columnsPerRow: columns }); }, [patch]);

  const handleItemSelect = useCallback(
    (item: SelectedItem | null) => {
      log.debug("handleItemSelect", "item selection changed", { item });
      setSelectedItemId(item);
    },
    []
  );

  return (
    <div
      className="flex h-full"
      role="main"
      aria-label="Spreads creative space"
    >
      <SpreadsSidebar
        selectedSpreadId={effectiveSpreadId ?? ""}
        selectedItemId={selectedItemId}
        onItemSelect={handleItemSelect}
        isEditable={spreadEditable}
      />
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Collab lock affordance (ADR-044 per-spread held session). NEVER hidden — 2-state
            (active/disabled): held → "Editing" (this editor owns the spread's scene lock); not held
            → greyed "Click a spread to edit" (lock-on-click). The canvas + sidebar are greyed via
            isEditable=false so in-spread content is non-editable until held. */}
        {spreadEditable ? (
          <div
            className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground select-none"
            title="You are editing this spread"
          >
            <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Editing</span>
          </div>
        ) : (
          <div
            className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground select-none"
            title="This spread is locked — click it to start editing"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{sceneLockStatus === "acquiring" ? "Locking…" : "Click a spread to edit"}</span>
          </div>
        )}

        {/* Per-spread SCENE undo/redo (ADR-045) — disabled until there's history for the held spread. */}
        <UndoRedoControls className="absolute top-3 right-3 z-10" />

        <SpreadsMainView
          selectedSpreadId={effectiveSpreadId ?? ""}
          selectedItemId={selectedItemId}
          onSpreadSelect={handleSpreadSelect}
          onSpreadUserSelect={handleSpreadUserSelect}
          onItemSelect={handleItemSelect}
          spreadEditable={spreadEditable}
          onCommitSave={sceneSaveNow}
          viewMode={viewMode ?? 'edit'}
          zoomLevel={zoomLevel ?? ZOOM.DEFAULT}
          columnsPerRow={columnsPerRow ?? COLUMNS.DEFAULT}
          onViewModeChange={handleViewModeChange}
          onZoomChange={handleZoomChange}
          onColumnsChange={handleColumnsChange}
        />
      </div>
    </div>
  );
}

export default SpreadsCreativeSpace;
