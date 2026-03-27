// spreads-creative-space.tsx - Root container for illustration spreads creative space
"use client";

import { useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { SpreadsMainView } from "./spreads-main-view";
import { SpreadsSidebar } from "./spreads-sidebar";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { createLogger } from "@/utils/logger";
import type { SelectedItem } from "./utils";

const log = createLogger("Editor", "SpreadsCreativeSpace");

export function SpreadsCreativeSpace() {
  // useShallow: .map() returns new array ref each call — must shallow-compare
  const illustrationSpreadIds = useSnapshotStore(
    useShallow((s) => s.illustration?.spreads?.map((sp) => sp.id) ?? [])
  );
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
      illustrationSpreadIds.includes(userSelectedSpreadId)
    ) {
      return userSelectedSpreadId;
    }
    return illustrationSpreadIds[0] ?? null;
  }, [illustrationSpreadIds, userSelectedSpreadId]);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadSelect", "spread selected", { spreadId });
    setUserSelectedSpreadId(spreadId);
    setSelectedItemId(null);
  }, []);

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
        selectedSpreadId={selectedSpreadId ?? ""}
        selectedItemId={selectedItemId}
        onItemSelect={handleItemSelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedSpreadId ? (
          <SpreadsMainView
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

export default SpreadsCreativeSpace;
