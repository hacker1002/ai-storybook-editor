"use client";

// extract-image-modal.tsx — Root orchestrator for the full-screen "Extracting Image"
// workspace (design extract-image-modal/README.md). Owns ALL state + handlers + ILS
// registration; the regions (header / results-sidebar / canvas) + the per-tab ParamsPanel
// are presentational. Consolidates SegmentLayerModal + SplitImageModal:
//   • [+] (left sidebar)   → run the active tab's AI extract (segment append / layers replace).
//   • ⭐ Extract (canvas)  → upload every remaining result → onCreateImages(N) → close.
// Results are session-local (ephemeral API URLs); upload happens only on commit.

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useInteractionLayer } from "@/features/editor/contexts";
import { createLogger } from "@/utils/logger";
import type { SpreadImage } from "@/types/spread-types";
import { SWAP_MODAL_TOKENS, Z_INDEX, RIGHT_SIDEBAR_WIDTH_PX } from "./extract-image-modal-constants";
import {
  EXTRACT_TABS,
  DEFAULT_EXTRACT_TAB,
  type ExtractResult,
  type ExtractTabKey,
} from "./extract-image-modal-constants";
import {
  resolveSourceImageUrl,
  uploadEphemeralToStorage,
} from "./extract-image-modal-utils";
import { useSegmentTabState, type SegmentTabHandle } from "./segment-tab";
import { useLayersTabState, type LayersTabHandle } from "./layers-tab";
import { ExtractImageModalHeader } from "./extract-image-modal-header";
import { ExtractResultsSidebar } from "./extract-results-sidebar";
import { ExtractCanvas } from "./extract-canvas";

const log = createLogger("Editor", "ExtractImageModal");

/** Stable empty array so the per-tab fallback keeps a constant identity (no re-render churn). */
const EMPTY_RESULTS: ExtractResult[] = [];

export interface ExtractImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: SpreadImage;
  onCreateImages: (results: ExtractResult[]) => void;
  initialTab?: ExtractTabKey;
  yieldedFrom?: { parentId: string; onParentForcePop: () => void };
}

export function ExtractImageModal({
  open,
  onOpenChange,
  image,
  onCreateImages,
  initialTab,
  yieldedFrom,
}: ExtractImageModalProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ExtractTabKey>(initialTab ?? DEFAULT_EXTRACT_TAB);
  const [resultsByTab, setResultsByTab] = useState<
    Partial<Record<ExtractTabKey, ExtractResult[]>>
  >({});
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const dialogContentRef = useRef<HTMLDivElement>(null);
  // API clients don't take an AbortSignal — the controller is a "should I still apply
  // setState?" flag (checked after await), so a forcePop/close mid-run can't write stale state.
  const abortRef = useRef<AbortController | null>(null);
  // Stable indirection so a tab's Ctrl/Cmd+Enter reaches the latest handleRunExtract without
  // a render-body ref write (React 19 lint). Synced in an effect below.
  const runExtractRef = useRef<() => void>(() => {});

  const isBusy = isProcessing || isCommitting;
  const onRequestRun = useCallback(() => runExtractRef.current(), []);

  // ── Per-tab sub-state (both hooks run unconditionally; root renders the active one) ──
  const segmentHandle = useSegmentTabState(image, { isBusy, onRequestRun });
  const layersHandle = useLayersTabState(image, { isBusy });

  // ── Derived (computed in render — no set-state-in-effect, React 19 lint) ─────────
  const activeContract = useMemo(
    () => EXTRACT_TABS.find((t) => t.key === activeTab) ?? null,
    [activeTab],
  );
  const activeHandle: SegmentTabHandle | LayersTabHandle | null =
    activeTab === "segment" ? segmentHandle : activeTab === "layering" ? layersHandle : null;

  const results = resultsByTab[activeTab] ?? EMPTY_RESULTS;
  const selectedResult = useMemo(
    () => results.find((r) => r.id === selectedResultId) ?? results[0] ?? null,
    [results, selectedResultId],
  );

  const sourceUrl = resolveSourceImageUrl(image);
  // isBusy (not just isProcessing) so [+] is also gated during commit; handleRunExtract
  // guards on runDisabled, so this hardens the handler too (review M2).
  const runDisabled = isBusy || !sourceUrl || !(activeHandle?.canRun ?? false);
  const commitDisabled = results.length === 0 || isBusy;
  const processingLabel = activeTab === "layering" ? "Splitting…" : "Segmenting…";

  const paramsPanel =
    activeTab === "segment"
      ? segmentHandle.ParamsPanel
      : activeTab === "layering"
        ? layersHandle.ParamsPanel
        : (
            <div className="px-4 py-6 text-center text-sm text-[var(--swap-modal-text-muted)]">
              Coming soon
            </div>
          );

  // ── State reset / close ──────────────────────────────────────────────────────
  const resetState = useCallback(() => {
    abortRef.current?.abort();
    setActiveTab(initialTab ?? DEFAULT_EXTRACT_TAB);
    setResultsByTab({});
    setSelectedResultId(null);
    setIsProcessing(false);
    setIsCommitting(false);
    segmentHandle.reset();
    layersHandle.reset();
  }, [initialTab, segmentHandle, layersHandle]);

  const handleClose = useCallback(() => {
    if (isBusy) {
      log.debug("handleClose", "blocked — busy", { isProcessing, isCommitting });
      return;
    }
    resetState();
    onOpenChange(false);
  }, [isBusy, isProcessing, isCommitting, resetState, onOpenChange]);

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) handleClose();
    },
    [handleClose],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (tab: ExtractTabKey) => {
      if (isBusy) return;
      const contract = EXTRACT_TABS.find((t) => t.key === tab);
      if (!contract?.enabled) {
        log.debug("handleTabChange", "ignored — disabled tab", { tab });
        return;
      }
      log.debug("handleTabChange", "switch tab", { from: activeTab, to: tab });
      setActiveTab(tab);
      setSelectedResultId(null);
    },
    [isBusy, activeTab],
  );

  const handleRunExtract = useCallback(async () => {
    if (runDisabled || !activeContract || !activeHandle || !sourceUrl) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsProcessing(true);
    log.info("handleRunExtract", "start", { activeTab, runMode: activeContract.runMode });

    try {
      const newResults = await activeHandle.runExtract(sourceUrl);
      if (controller.signal.aborted) return;
      if (newResults.length === 0) {
        log.debug("handleRunExtract", "no results", { activeTab });
        return;
      }
      setResultsByTab((prev) => {
        const existing = prev[activeTab] ?? [];
        const merged =
          activeContract.runMode === "append" ? [...newResults, ...existing] : newResults;
        return { ...prev, [activeTab]: merged };
      });
      setSelectedResultId(newResults[0]?.id ?? null);
      log.info("handleRunExtract", "done", { activeTab, added: newResults.length });
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Extraction failed. Please try again.";
      log.error("handleRunExtract", "failed", { activeTab, error: msg });
      toast.error(msg);
    } finally {
      if (!controller.signal.aborted) setIsProcessing(false);
    }
  }, [runDisabled, activeContract, activeHandle, sourceUrl, activeTab]);

  // Sync the Ctrl/Cmd+Enter indirection (effect, not render-body — React 19 lint).
  useEffect(() => {
    runExtractRef.current = handleRunExtract;
  }, [handleRunExtract]);

  const handleSelectResult = useCallback((id: string) => {
    setSelectedResultId(id);
  }, []);

  const handleDeleteResult = useCallback(
    (id: string) => {
      setResultsByTab((prev) => {
        const filtered = (prev[activeTab] ?? []).filter((r) => r.id !== id);
        return { ...prev, [activeTab]: filtered };
      });
      setSelectedResultId((prev) => {
        if (prev !== id) return prev;
        const remaining = (resultsByTab[activeTab] ?? []).filter((r) => r.id !== id);
        return remaining[0]?.id ?? null;
      });
      log.debug("handleDeleteResult", "deleted", { activeTab, resultId: id });
    },
    [activeTab, resultsByTab],
  );

  const handleCommitExtract = useCallback(async () => {
    if (commitDisabled) return;
    setIsCommitting(true);
    log.info("handleCommitExtract", "start", { activeTab, count: results.length });
    try {
      const uploaded = await Promise.all(results.map(uploadEphemeralToStorage));
      log.info("handleCommitExtract", "uploaded", { count: uploaded.length });
      onCreateImages(uploaded);
      onOpenChange(false);
    } catch (err) {
      log.error("handleCommitExtract", "failed", { error: String(err) });
      toast.error("Save failed. Please try again.");
    } finally {
      setIsCommitting(false);
    }
  }, [commitDisabled, results, activeTab, onCreateImages, onOpenChange]);

  // ── Interaction Layer Stack (top modal slot) ────────────────────────────────────
  useInteractionLayer(
    "modal",
    open
      ? {
          id: "extract-image-modal",
          ref: dialogContentRef,
          hotkeys: ["Escape"],
          captureClickOutside: true,
          portalSelectors: [
            "[data-radix-popper-content-wrapper]",
            "[data-radix-select-content]",
            '[role="listbox"]',
          ],
          // Picking a Model Select option unmounts the popper synchronously; dropdownSelectors
          // let the Provider keep the modal open instead of mis-closing it (see memory).
          dropdownSelectors: [
            "[data-radix-select-content]",
            "[data-radix-popper-content-wrapper]",
          ],
          onHotkey: (key) => {
            if (key === "Escape") handleClose();
          },
          onClickOutside: () => handleClose(),
          // Spread switch / target-image delete → force close + reset (bypasses busy guard).
          onForcePop: () => {
            log.debug("onForcePop", "force close + reset", { imageId: image.id });
            resetState();
            onOpenChange(false);
          },
          yieldedFrom,
        }
      : null,
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        aria-labelledby="extract-image-modal-title"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={{ ...SWAP_MODAL_TOKENS, zIndex: Z_INDEX.swapModal } as React.CSSProperties}
        className="inset-0 left-0 top-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-[var(--swap-modal-bg)] p-0 text-[var(--swap-modal-text-primary)] [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Extracting Image</DialogTitle>
        <DialogDescription className="sr-only">
          Trích xuất object/layer từ ảnh nguồn (Segments / Layers).
        </DialogDescription>

        <ExtractImageModalHeader
          activeTab={activeTab}
          tabs={EXTRACT_TABS}
          onTabChange={handleTabChange}
          onClose={handleClose}
          disabled={isBusy}
        />

        <div className="flex min-h-0 flex-1">
          <ExtractResultsSidebar
            title={activeContract?.label ?? ""}
            results={results}
            selectedResultId={selectedResultId}
            onSelectResult={handleSelectResult}
            onDeleteResult={handleDeleteResult}
            onRunExtract={handleRunExtract}
            runDisabled={runDisabled}
            isProcessing={isProcessing}
          />

          <ExtractCanvas
            sourceUrl={sourceUrl}
            selectedResult={selectedResult}
            isProcessing={isProcessing}
            isCommitting={isCommitting}
            processingLabel={processingLabel}
            onCommitExtract={handleCommitExtract}
            commitDisabled={commitDisabled}
          />

          <aside
            className="flex h-full shrink-0 flex-col overflow-y-auto border-l border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
            style={{ width: RIGHT_SIDEBAR_WIDTH_PX }}
            aria-label="Extract parameters"
          >
            {paramsPanel}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
