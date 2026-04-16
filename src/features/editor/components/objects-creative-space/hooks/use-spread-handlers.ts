// use-spread-handlers.ts - Spread-level delete and reorder handlers

import { useCallback } from "react";
import { createLogger } from "@/utils/logger";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";

const log = createLogger("Editor", "useSpreadHandlers");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

interface UseSpreadHandlersReturn {
  handleDeleteSpread: (spreadId: string) => void;
  handleSpreadReorder: (fromIndex: number, toIndex: number) => void;
}

export function useSpreadHandlers(actions: SnapshotActions): UseSpreadHandlersReturn {
  const handleDeleteSpread = useCallback(
    (spreadId: string) => {
      log.debug("handleDeleteSpread", "deleting spread", { spreadId });
      actions.deleteIllustrationSpread(spreadId);
    },
    [actions]
  );

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      log.debug("handleSpreadReorder", "reordering spread", { fromIndex, toIndex });
      actions.reorderIllustrationSpreads(fromIndex, toIndex);
    },
    [actions]
  );

  return { handleDeleteSpread, handleSpreadReorder };
}
