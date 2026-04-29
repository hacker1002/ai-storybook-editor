// use-duplicate-hotkey.ts - Ctrl+D global hotkey handler for canvas item duplication

import { createLogger } from "@/utils/logger";
import { useGlobalHotkey } from "@/features/editor/contexts/use-global-hotkey";
import { useInteractionLayerContext } from "@/features/editor/contexts/interaction-layer-provider";
import type { SelectedItem } from "../objects-creative-space";

const log = createLogger("Editor", "useDuplicateHotkey");

// Moved from objects-main-view.tsx module scope
const matchCtrlD = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd';

const OBJECTS_FORBIDDEN = ['raw_image', 'raw_textbox'] as const;

type DupItemType = 'image' | 'text' | 'shape' | 'video' | 'audio' | 'auto_audio' | 'auto_pic';
type StackRef = ReturnType<typeof useInteractionLayerContext>['stackRef'];

export function useDuplicateHotkey(
  stackRef: StackRef,
  selectedItemId: SelectedItem | null,
  handleDuplicateItem: (itemType: DupItemType, itemId: string) => void
): void {
  useGlobalHotkey(
    matchCtrlD,
    () => {
      if (stackRef.current.modal !== null) {
        log.debug("useDuplicateHotkey", "ctrl-d blocked by modal");
        return;
      }
      if (!selectedItemId) {
        log.debug("useDuplicateHotkey", "ctrl-d no item selected");
        return;
      }
      if ((OBJECTS_FORBIDDEN as readonly string[]).includes(selectedItemId.type)) {
        log.debug("useDuplicateHotkey", "ctrl-d forbidden type", { type: selectedItemId.type });
        return;
      }
      log.debug("useDuplicateHotkey", "ctrl-d duplicating", {
        type: selectedItemId.type,
        id: selectedItemId.id,
      });
      const dupType = selectedItemId.type === 'textbox' ? 'text' : selectedItemId.type;
      handleDuplicateItem(
        dupType as DupItemType,
        selectedItemId.id
      );
    },
    [selectedItemId, handleDuplicateItem, stackRef]
  );
}
