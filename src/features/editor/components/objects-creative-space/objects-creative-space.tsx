// objects-creative-space.tsx - Root container for objects creative space
"use client";

import { useState, useCallback } from "react";
import { ObjectsMainView } from "./objects-main-view";
import { ObjectsSidebar } from "./objects-sidebar";
import { useRetouchSpreadIds } from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";
import { useSpaceViewState, useEffectiveSpreadId } from "@/features/editor/hooks/use-space-view-state";
import { ZOOM } from "@/constants/spread-constants";

const log = createLogger("Editor", "ObjectsCreativeSpace");

// Shared types for sidebar ↔ main view selection sync
export type ObjectElementType =
  | "image"
  | "shape"
  | "video"
  | "audio"
  | "textbox"
  | "animated_pic"
  | "raw_image"
  | "raw_textbox";

export interface SelectedItem {
  type: ObjectElementType;
  id: string;
}

export function ObjectsCreativeSpace() {
  const retouchSpreadIds = useRetouchSpreadIds();
  const [selectedItemId, setSelectedItemId] = useState<SelectedItem | null>(
    null
  );

  const { activeSpreadId, zoomLevel, patch } = useSpaceViewState('object');
  const selectedSpreadId = useEffectiveSpreadId(activeSpreadId, retouchSpreadIds);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadSelect", "spread selected", { spreadId });
    patch({ activeSpreadId: spreadId });
    setSelectedItemId(null); // Clear item when spread changes
  }, [patch]);

  const handleItemSelect = useCallback((item: SelectedItem | null) => {
    log.debug("handleItemSelect", "item selection changed", { item });
    setSelectedItemId(item);
  }, []);

  const handleZoomChange = useCallback((level: number) => {
    patch({ zoomLevel: level });
  }, [patch]);

  return (
    <div className="flex h-full">
      <ObjectsSidebar
        selectedSpreadId={selectedSpreadId ?? ""}
        selectedItemId={selectedItemId}
        onItemSelect={handleItemSelect}
      />
      <div className="flex-1 overflow-hidden">
        <ObjectsMainView
          selectedSpreadId={selectedSpreadId ?? ""}
          selectedItemId={selectedItemId}
          onSpreadSelect={handleSpreadSelect}
          onItemSelect={handleItemSelect}
          zoomLevel={zoomLevel ?? ZOOM.DEFAULT}
          onZoomChange={handleZoomChange}
        />
      </div>
    </div>
  );
}

export default ObjectsCreativeSpace;
