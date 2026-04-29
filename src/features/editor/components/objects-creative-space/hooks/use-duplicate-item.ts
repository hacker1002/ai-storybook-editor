// use-duplicate-item.ts - Table-driven duplicate handler for all 6 canvas item types

import { useCallback } from "react";
import { createLogger } from "@/utils/logger";
import {
  cloneItemWithNewId,
  nextTopZInTier,
  shiftTextboxLanguageGeometries,
} from "@/features/editor/utils/duplicate-item-helpers";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { BaseSpread } from "@/types/canvas-types";
import type { SelectedItem } from "../objects-creative-space";

const log = createLogger("Editor", "useDuplicateItem");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;
type DupItemType = 'image' | 'text' | 'shape' | 'video' | 'audio' | 'auto_audio' | 'auto_pic';
type TierType = Parameters<typeof nextTopZInTier>[1];

interface DupConfig {
  getCollection: (spread: BaseSpread) => unknown[] | undefined;
  tier: TierType;
  addFn: keyof SnapshotActions;
  selectType: SelectedItem['type'];
  shiftLang?: boolean;
}

// Module-scope: config doesn't depend on hook args
const DUP_CONFIG: Record<DupItemType, DupConfig> = {
  image:        { getCollection: s => s.images,        tier: 'pictorial', addFn: 'addRetouchImage',       selectType: 'image' },
  text:         { getCollection: s => s.textboxes,     tier: 'text',      addFn: 'addRetouchTextbox',     selectType: 'textbox', shiftLang: true },
  shape:        { getCollection: s => s.shapes,        tier: 'mix',       addFn: 'addRetouchShape',       selectType: 'shape' },
  video:        { getCollection: s => s.videos,        tier: 'pictorial', addFn: 'addRetouchVideo',       selectType: 'video' },
  audio:        { getCollection: s => s.audios,        tier: 'mix',       addFn: 'addRetouchAudio',       selectType: 'audio' },
  auto_audio:   { getCollection: s => s.auto_audios,   tier: 'mix',       addFn: 'addRetouchAutoAudio',   selectType: 'auto_audio' },
  auto_pic: { getCollection: s => s.auto_pics, tier: 'pictorial', addFn: 'addRetouchAutoPic', selectType: 'auto_pic' },
};

interface UseDuplicateItemReturn {
  handleDuplicateItem: (itemType: DupItemType, itemId: string) => void;
}

export function useDuplicateItem(
  retouchSpreads: BaseSpread[],
  selectedSpreadId: string,
  actions: SnapshotActions,
  onItemSelect: (item: SelectedItem | null) => void
): UseDuplicateItemReturn {
  const handleDuplicateItem = useCallback(
    (itemType: DupItemType, itemId: string) => {
      const spread = retouchSpreads.find((s) => s.id === selectedSpreadId);
      if (!spread) {
        log.warn("handleDuplicateItem", "spread not found", { selectedSpreadId });
        return;
      }

      const config = DUP_CONFIG[itemType];
      const collection = config.getCollection(spread) as Array<{ id: string }> | undefined;
      const source = collection?.find((i) => i.id === itemId);

      if (!source) {
        log.warn("handleDuplicateItem", "source not found", { itemType, itemId });
        return;
      }

      const newZ = nextTopZInTier(spread, config.tier);
      const cloned = cloneItemWithNewId(source as Parameters<typeof cloneItemWithNewId>[0]);

      if (config.shiftLang) {
        shiftTextboxLanguageGeometries(cloned as unknown as Record<string, unknown>);
      }

      // z-index is present on all canvas item types but not in the generic constraint
      (cloned as Record<string, unknown>)['z-index'] = newZ;

      // as cast is safe: addFn is verified to match the item type via DUP_CONFIG
      (actions[config.addFn] as (spreadId: string, item: unknown) => void)(selectedSpreadId, cloned);

      log.info("handleDuplicateItem", "duplicated", {
        itemType,
        sourceId: itemId,
        cloneId: cloned.id,
        newZ,
      });

      onItemSelect({ type: config.selectType, id: cloned.id });
    },
    [actions, retouchSpreads, selectedSpreadId, onItemSelect]
  );

  return { handleDuplicateItem };
}
