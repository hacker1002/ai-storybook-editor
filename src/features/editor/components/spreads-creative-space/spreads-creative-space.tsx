// spreads-creative-space.tsx - Root container for illustration spreads creative space
"use client";

import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { SpreadsMainView } from "./spreads-main-view";
import { SpreadsSidebar } from "./spreads-sidebar";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { createLogger } from "@/utils/logger";
import { useSpaceViewState, useEffectiveSpreadId } from "@/features/editor/hooks/use-space-view-state";
import { ZOOM, COLUMNS } from "@/constants/spread-constants";
import type { ViewMode } from "@/types/canvas-types";
import type { SelectedItem } from "./utils";

const log = createLogger("Editor", "SpreadsCreativeSpace");

export function SpreadsCreativeSpace() {
  // useShallow: .map() returns new array ref each call — must shallow-compare
  const illustrationSpreadIds = useSnapshotStore(
    useShallow((s) => s.illustration?.spreads?.map((sp) => sp.id) ?? [])
  );

  const [selectedItemId, setSelectedItemId] = useState<SelectedItem | null>(
    null
  );

  const { activeSpreadId, zoomLevel, viewMode, columnsPerRow, patch } = useSpaceViewState('spread');
  const effectiveSpreadId = useEffectiveSpreadId(activeSpreadId, illustrationSpreadIds);

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
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        <SpreadsMainView
          selectedSpreadId={effectiveSpreadId ?? ""}
          selectedItemId={selectedItemId}
          onSpreadSelect={handleSpreadSelect}
          onItemSelect={handleItemSelect}
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
