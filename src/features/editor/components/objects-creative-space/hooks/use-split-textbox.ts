// use-split-textbox.ts - Unified split textbox hook for retouch and raw textbox splitting

import { useCallback } from "react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import { measureTextHeightPercent } from "../utils/canvas-utils";
import type { SpreadTextbox } from "@/types/canvas-types";
import type { SelectedItem } from "../objects-creative-space";

const log = createLogger("Editor", "useSplitTextbox");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

interface SplitTextboxOpts {
  /** If true: delete source textbox + animations after splitting (retouch flow) */
  deleteSource: boolean;
  /** If true: inherit player_visible/editor_visible from source; false: hardcode both to true (raw flow) */
  inheritVisibility: boolean;
}

interface UseSplitTextboxReturn {
  splitTextbox: (spreadId: string, textbox: SpreadTextbox, opts: SplitTextboxOpts) => void;
}

export function useSplitTextbox(
  actions: SnapshotActions,
  onItemSelect: (item: SelectedItem | null) => void,
  langCode: string,
  canvasWidth: number,
  canvasHeight: number
): UseSplitTextboxReturn {
  const splitTextbox = useCallback(
    (spreadId: string, textbox: SpreadTextbox, opts: SplitTextboxOpts) => {
      const result = getTextboxContentForLanguage(
        textbox as unknown as Record<string, unknown>,
        langCode
      );
      if (!result) return;
      const { langKey, content } = result;

      if (!content.text) {
        toast.info("No text to split");
        return;
      }

      const segments = content.text
        .split(".")
        .map((s) => s.trim())
        .filter(Boolean);

      if (segments.length <= 1) {
        toast.info("No sentences to split");
        return;
      }

      log.info("splitTextbox", "splitting textbox", {
        itemId: textbox.id,
        segments: segments.length,
        deleteSource: opts.deleteSource,
      });

      const baseGeometry = content.geometry;
      const GAP_PERCENT = 1;
      let currentY = baseGeometry.y;

      for (let i = 0; i < segments.length; i++) {
        const segmentText = segments[i] + ".";
        const measuredH = measureTextHeightPercent(
          segmentText,
          baseGeometry.w,
          content.typography,
          canvasWidth,
          canvasHeight
        );
        const h = Math.max(measuredH, 3);

        const newTextbox: SpreadTextbox = {
          id: crypto.randomUUID(),
          [langKey]: {
            text: segmentText,
            geometry: {
              x: baseGeometry.x,
              y: Math.min(currentY, 100 - h),
              w: baseGeometry.w,
              h,
            },
            typography: { ...content.typography },
          },
          player_visible: opts.inheritVisibility ? textbox.player_visible : true,
          editor_visible: opts.inheritVisibility ? textbox.editor_visible : true,
        };
        actions.addRetouchTextbox(spreadId, newTextbox);
        currentY += h + GAP_PERCENT;
      }

      if (opts.deleteSource) {
        actions.deleteRetouchAnimationsByTargetId(spreadId, textbox.id);
        actions.deleteRetouchTextbox(spreadId, textbox.id);
      }

      onItemSelect(null);
    },
    [actions, onItemSelect, langCode, canvasWidth, canvasHeight]
  );

  return { splitTextbox };
}
