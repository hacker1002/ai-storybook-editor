// use-spread-item-dispatch.ts - Unified spread item action dispatcher (add/update/delete per type)

import { useCallback } from "react";
import { createLogger } from "@/utils/logger";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type {
  BaseSpread,
  SpreadItemActionUnion,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadAutoPic,
  PageData,
} from "@/types/canvas-types";

const log = createLogger("Editor", "useSpreadItemDispatch");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

interface UseSpreadItemDispatchReturn {
  handleSpreadItemAction: (params: SpreadItemActionUnion) => void;
}

export function useSpreadItemDispatch(
  actions: SnapshotActions,
  retouchSpreads: BaseSpread[]
): UseSpreadItemDispatchReturn {
  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId, itemType, action, itemId, data } = params;
      log.debug("handleSpreadItemAction", "dispatch", { spreadId, itemType, action });

      switch (itemType) {
        case "image":
          if (action === "add")
            actions.addRetouchImage(spreadId, data as SpreadImage);
          else if (action === "update")
            actions.updateRetouchImage(spreadId, itemId as string, data as Partial<SpreadImage>);
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(spreadId, itemId as string);
            actions.deleteRetouchImage(spreadId, itemId as string);
          }
          break;
        case "textbox":
          if (action === "add")
            actions.addRetouchTextbox(spreadId, data as SpreadTextbox);
          else if (action === "update")
            actions.updateRetouchTextbox(spreadId, itemId as string, data as Partial<SpreadTextbox>);
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(spreadId, itemId as string);
            actions.deleteRetouchTextbox(spreadId, itemId as string);
          }
          break;
        case "shape":
          if (action === "add")
            actions.addRetouchShape(spreadId, data as SpreadShape);
          else if (action === "update")
            actions.updateRetouchShape(spreadId, itemId as string, data as Partial<SpreadShape>);
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(spreadId, itemId as string);
            actions.deleteRetouchShape(spreadId, itemId as string);
          }
          break;
        case "video":
          if (action === "add")
            actions.addRetouchVideo(spreadId, data as SpreadVideo);
          else if (action === "update")
            actions.updateRetouchVideo(spreadId, itemId as string, data as Partial<SpreadVideo>);
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(spreadId, itemId as string);
            actions.deleteRetouchVideo(spreadId, itemId as string);
          }
          break;
        case "audio":
          if (action === "add")
            actions.addRetouchAudio(spreadId, data as SpreadAudio);
          else if (action === "update")
            actions.updateRetouchAudio(spreadId, itemId as string, data as Partial<SpreadAudio>);
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(spreadId, itemId as string);
            actions.deleteRetouchAudio(spreadId, itemId as string);
          }
          break;
        case "auto_pic":
          if (action === "add")
            actions.addRetouchAutoPic(spreadId, data as SpreadAutoPic);
          else if (action === "update")
            actions.updateRetouchAutoPic(spreadId, itemId as string, data as Partial<SpreadAutoPic>);
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(spreadId, itemId as string);
            actions.deleteRetouchAutoPic(spreadId, itemId as string);
          }
          break;
        case "page":
          if (action === "update" && typeof itemId === "number") {
            const spread = retouchSpreads.find((s) => s.id === spreadId);
            if (!spread) break;
            const newPages = [...spread.pages];
            newPages[itemId] = { ...newPages[itemId], ...(data as Partial<PageData>) };
            actions.updateIllustrationSpread(spreadId, { pages: newPages });
          }
          break;
      }
    },
    [actions, retouchSpreads]
  );

  return { handleSpreadItemAction };
}
