// history-creative-space.tsx - Root container: version list, snapshot preview, revert flow
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HistorySidebar } from "./history-sidebar";
import { HistoryMainView } from "./history-main-view";
import {
  fetchVersionList,
  fetchSnapshotForPreview,
  fetchFullSnapshot,
  revertToVersion,
} from "./history-api";
import {
  useSnapshotId,
  useSnapshotActions,
  useCanManualSave,
  useIsSaving,
} from "@/stores/snapshot-store/selectors";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { createLogger } from "@/utils/logger";
import type { SnapshotVersion, HistorySnapshotData } from "./history-types";

const log = createLogger("Editor", "HistoryCreativeSpace");

// Debounce delay for version selection → prevents rapid snapshot fetch spam
const DEBOUNCE_MS = 500;

export function HistoryCreativeSpace() {
  // Store selectors
  const bookId = useSnapshotStore((s) => s.meta.bookId);
  const currentVersionId = useSnapshotId();
  const canManualSave = useCanManualSave();
  const isSaving = useIsSaving();
  const { initSnapshot, setMeta, markClean, autoSaveSnapshot, saveSnapshot } = useSnapshotActions();

  // Version list state
  const [versions, setVersions] = useState<SnapshotVersion[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Selected version state
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<HistorySnapshotData | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  // Revert dialog state
  const [revertConfirmId, setRevertConfirmId] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Auto-save on mount state
  const [isAutoSavingOnMount, setIsAutoSavingOnMount] = useState(false);

  // Fetch version list on mount (with auto-save if dirty)
  useEffect(() => {
    if (!bookId) return;

    async function init() {
      // Auto-save if dirty — read directly from store to avoid dependency on reactive isDirty
      const isDirtyNow = useSnapshotStore.getState().sync.isDirty;
      if (isDirtyNow) {
        log.info("useEffect", "dirty on mount — auto-saving before fetch", { bookId });
        setIsAutoSavingOnMount(true);
        try {
          await autoSaveSnapshot();
        } finally {
          setIsAutoSavingOnMount(false);
        }
      }

      log.info("useEffect", "fetching version list", { bookId });
      setIsLoadingList(true);
      setListError(null);
      try {
        const result = await fetchVersionList(bookId!);
        setVersions(result);
        if (result.length > 0) {
          // Auto-select: prefer current version, fallback to most recent
          const snap = useSnapshotStore.getState();
          const autoSelect =
            result.find((v) => v.id === snap.meta.id)?.id ?? result[0].id;
          setSelectedVersionId(autoSelect);
          log.debug("useEffect", "auto-selected version", { autoSelect });
        }
      } catch (err) {
        log.error("useEffect", "version list fetch error", { error: String(err) });
        setListError("Failed to load versions");
      } finally {
        setIsLoadingList(false);
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Fetch snapshot preview when selectedVersionId changes (debounced via useEffect cleanup)
  useEffect(() => {
    if (!selectedVersionId) return;

    const timer = setTimeout(() => {
      log.info("useEffect", "fetching snapshot preview", { versionId: selectedVersionId });
      setIsLoadingSnapshot(true);
      setSnapshotError(null);

      fetchSnapshotForPreview(selectedVersionId)
        .then((snapshot) => {
          setSelectedSnapshot(snapshot);
          setIsLoadingSnapshot(false);
          if (!snapshot) {
            log.warn("useEffect", "snapshot preview not found", { versionId: selectedVersionId });
            setSnapshotError("Version not found");
          }
        })
        .catch((err) => {
          log.error("useEffect", "snapshot preview fetch error", { error: String(err) });
          setSnapshotError("Failed to load snapshot");
          setIsLoadingSnapshot(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [selectedVersionId]);

  const handleVersionSelect = useCallback((versionId: string) => {
    log.debug("handleVersionSelect", "selected", { versionId });
    setSelectedVersionId(versionId);
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!bookId) return;
    log.info("handleManualSave", "saving manual snapshot", { bookId });
    await saveSnapshot();
    // Re-fetch version list and auto-select newest version
    try {
      const result = await fetchVersionList(bookId);
      setVersions(result);
      if (result.length > 0) {
        setSelectedVersionId(result[0].id);
        log.debug("handleManualSave", "auto-selected newest version", { versionId: result[0].id });
      }
    } catch (err) {
      log.error("handleManualSave", "version list re-fetch error", { error: String(err) });
    }
  }, [bookId, saveSnapshot]);

  const handleRevert = useCallback((versionId: string) => {
    log.info("handleRevert", "open confirm dialog", { versionId });
    setRevertConfirmId(versionId);
  }, []);

  const handleRevertCancel = useCallback(() => {
    setRevertConfirmId(null);
  }, []);

  const handleRevertConfirm = useCallback(async () => {
    if (!revertConfirmId || !bookId) return;
    log.info("handleRevertConfirm", "start revert", { versionId: revertConfirmId, bookId });
    setIsReverting(true);

    try {
      // Step 1: Fetch all snapshot columns
      const fullData = await fetchFullSnapshot(revertConfirmId);
      if (!fullData) {
        log.error("handleRevertConfirm", "full snapshot fetch failed", { versionId: revertConfirmId });
        return;
      }

      // Step 2: UPDATE books.current_version (DB is source of truth)
      const { success } = await revertToVersion(bookId, revertConfirmId);
      if (!success) {
        log.error("handleRevertConfirm", "db update failed", { versionId: revertConfirmId });
        return;
      }

      // Step 3: Load all slices into SnapshotStore
      initSnapshot({
        docs: fullData.docs ?? undefined,
        dummies: fullData.dummies ?? undefined,
        illustration: fullData.illustration ?? undefined,
        props: fullData.props ?? undefined,
        characters: fullData.characters ?? undefined,
        stages: fullData.stages ?? undefined,
      });

      // Step 4: Update meta pointer
      setMeta({
        id: revertConfirmId,
        bookId,
        version: fullData.version,
        tag: fullData.tag,
        autoSaveId: fullData.save_type === 2 ? revertConfirmId : null,
      });

      // Step 5: Clear dirty state
      markClean();

      log.info("handleRevertConfirm", "revert complete", { versionId: revertConfirmId });
    } catch (err) {
      log.error("handleRevertConfirm", "unexpected error", { error: String(err) });
    } finally {
      setIsReverting(false);
      setRevertConfirmId(null);
    }
  }, [revertConfirmId, bookId, initSnapshot, setMeta, markClean]);

  return (
    <div className="flex h-full" role="main" aria-label="Version history">
      {/* Left: version list sidebar */}
      <HistorySidebar
        versions={versions}
        selectedVersionId={selectedVersionId}
        currentVersionId={currentVersionId ?? null}
        isLoading={isLoadingList || isAutoSavingOnMount}
        canManualSave={canManualSave}
        isSavingManual={isSaving}
        onVersionSelect={handleVersionSelect}
        onRevert={handleRevert}
        onManualSave={handleManualSave}
      />

      {/* Right: snapshot preview or state messages */}
      <div
        className="flex-1 overflow-hidden"
        role="region"
        aria-label="Snapshot viewer"
      >
        {listError ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-destructive">{listError}</p>
          </div>
        ) : isLoadingSnapshot ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : snapshotError ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">{snapshotError}</p>
          </div>
        ) : selectedSnapshot && selectedSnapshot.illustration ? (
          <HistoryMainView snapshot={selectedSnapshot} />
        ) : selectedSnapshot && !selectedSnapshot.illustration ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No illustration data for this version</p>
          </div>
        ) : !isLoadingList && versions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No versions available</p>
          </div>
        ) : null}
      </div>

      {/* Revert confirmation dialog */}
      <AlertDialog
        open={revertConfirmId !== null}
        onOpenChange={(open) => { if (!open) handleRevertCancel(); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will switch to the selected version. Your current unsaved
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleRevertCancel}
              disabled={isReverting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevertConfirm}
              disabled={isReverting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isReverting ? "Reverting..." : "Revert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default HistoryCreativeSpace;
