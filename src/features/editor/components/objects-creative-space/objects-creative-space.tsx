// objects-creative-space.tsx - Root container for objects creative space
"use client";

import { useState, useCallback, useMemo } from "react";
import { ObjectsMainView } from "./objects-main-view";
import { ObjectsSidebar } from "./objects-sidebar";
import { useRetouchSpreadIds } from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "ObjectsCreativeSpace");

// Shared types for sidebar ↔ main view selection sync
export type ObjectElementType =
  | "image"
  | "shape"
  | "video"
  | "audio"
  | "quiz"
  | "text";

export interface SelectedItem {
  type: ObjectElementType;
  id: string;
}

export function ObjectsCreativeSpace() {
  const retouchSpreadIds = useRetouchSpreadIds();
  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<
    string | null
  >(null);
  const [selectedItemId, setSelectedItemId] = useState<SelectedItem | null>(
    null
  );

  // Derive effective spread: user choice if valid, else first available
  const selectedSpreadId = useMemo(() => {
    if (
      userSelectedSpreadId &&
      retouchSpreadIds.includes(userSelectedSpreadId)
    ) {
      return userSelectedSpreadId;
    }
    return retouchSpreadIds[0] ?? null;
  }, [retouchSpreadIds, userSelectedSpreadId]);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadSelect", "spread selected", { spreadId });
    setUserSelectedSpreadId(spreadId);
    setSelectedItemId(null); // Clear item when spread changes
  }, []);

  const handleItemSelect = useCallback((item: SelectedItem | null) => {
    log.debug("handleItemSelect", "item selection changed", { item });
    setSelectedItemId(item);
  }, []);

  return (
    <div className="flex h-full">
      <ObjectsSidebar
        selectedSpreadId={selectedSpreadId ?? ""}
        selectedItemId={selectedItemId}
        onItemSelect={handleItemSelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedSpreadId ? (
          <ObjectsMainView
            selectedSpreadId={selectedSpreadId}
            selectedItemId={selectedItemId}
            onSpreadSelect={handleSpreadSelect}
            onItemSelect={handleItemSelect}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No spreads yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ObjectsCreativeSpace;
