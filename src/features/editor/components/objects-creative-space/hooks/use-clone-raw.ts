// use-clone-raw.ts - Clone raw image/textbox into retouch layer

import { useCallback } from "react";
import { createLogger } from "@/utils/logger";
import {
  nextTopZInTier,
  shiftTextboxLanguageGeometries,
} from "@/features/editor/utils/duplicate-item-helpers";
import { LAYER_CONFIG } from "@/constants/spread-constants";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { BaseSpread, SpreadImage, SpreadTextbox } from "@/types/canvas-types";

const log = createLogger("Editor", "useCloneRaw");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

interface UseCloneRawReturn {
  cloneRawImage: (rawImage: SpreadImage) => void;
  cloneRawTextbox: (rawTextbox: SpreadTextbox) => void;
}

export function useCloneRaw(
  retouchSpreads: BaseSpread[],
  selectedSpreadId: string,
  actions: SnapshotActions
): UseCloneRawReturn {
  const cloneRawImage = useCallback(
    (rawImage: SpreadImage) => {
      const spread = retouchSpreads.find((s) => s.id === selectedSpreadId);
      const newZ = spread
        ? Math.min(nextTopZInTier(spread, "pictorial"), LAYER_CONFIG.MEDIA.max)
        : LAYER_CONFIG.MEDIA.min;

      const newImage: SpreadImage = {
        id: crypto.randomUUID(),
        title: rawImage.title ? `${rawImage.title} - Copy` : "Cloned Image",
        geometry: { ...rawImage.geometry },
        media_url: rawImage.media_url,
        illustrations: rawImage.illustrations ? [...rawImage.illustrations] : [],
        type: rawImage.type,
        aspect_ratio: rawImage.aspect_ratio,
        player_visible: true,
        editor_visible: true,
        "z-index": newZ,
      };
      actions.addRetouchImage(selectedSpreadId, newImage);
      log.info("cloneRawImage", "cloned raw image to retouch image", {
        rawImageId: rawImage.id,
        newImageId: newImage.id,
        spreadId: selectedSpreadId,
      });
    },
    [retouchSpreads, selectedSpreadId, actions]
  );

  const cloneRawTextbox = useCallback(
    (rawTextbox: SpreadTextbox) => {
      const spread = retouchSpreads.find((s) => s.id === selectedSpreadId);
      const newZ = spread ? nextTopZInTier(spread, "text") : LAYER_CONFIG.TEXT.min;

      const cloned: SpreadTextbox = structuredClone(rawTextbox);
      cloned.id = crypto.randomUUID();
      shiftTextboxLanguageGeometries(cloned as unknown as Record<string, unknown>);
      cloned.player_visible = true;
      cloned.editor_visible = true;
      cloned["z-index"] = newZ;

      actions.addRetouchTextbox(selectedSpreadId, cloned);
      log.info("cloneRawTextbox", "cloned raw textbox to retouch textbox", {
        rawTextboxId: rawTextbox.id,
        newTextboxId: cloned.id,
        spreadId: selectedSpreadId,
      });
    },
    [retouchSpreads, selectedSpreadId, actions]
  );

  return { cloneRawImage, cloneRawTextbox };
}
