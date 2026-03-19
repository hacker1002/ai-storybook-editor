// objects-main-view.tsx - CanvasSpreadView wrapper with retouch render props
"use client";

import { useState, useCallback } from "react";
import { EyeOff } from "lucide-react";
import { CanvasSpreadView } from "@/features/editor/components/canvas-spread-view";
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableQuiz,
  EditImageModal,
  SplitImageModal,
  CropImageModal,
} from "@/features/editor/components/shared-components";
import type { SplitLayerResult, CropReplaceResult } from "@/features/editor/components/shared-components";
import { ObjectsImageToolbar } from "./objects-image-toolbar";
import type { Geometry } from "@/types/canvas-types";
import {
  useRetouchSpreads,
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { getFirstTextboxKey } from "@/features/editor/utils/textbox-helpers";
import {
  calculateZIndexShifts,
  collectPictorialZItems,
} from "@/features/editor/utils/z-index-cascade-utils";
import { createLogger } from "@/utils/logger";
import type { SelectedItem } from "./objects-creative-space";
import type { SpreadType } from "@/features/editor/components/canvas-spread-view";
import type {
  BaseSpread,
  ImageItemContext,
  ImageToolbarContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  QuizItemContext,
  SpreadItemActionUnion,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  PageData,
} from "@/types/canvas-types";
import type { SpreadTextboxContent } from "@/types/spread-types";

const log = createLogger("Editor", "ObjectsMainView");

/** Badge overlay shown on canvas items when player_visible = false.
 *  For icon-type items (audio/quiz) with w=0,h=0, uses fixed 32px box matching the icon size. */
function PlayerHiddenBadge({ geometry, zIndex, isIcon }: { geometry: Geometry; zIndex?: number; isIcon?: boolean }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        ...(isIcon
          ? { width: 32, height: 32 }
          : { width: `${geometry.w}%`, height: `${geometry.h}%` }),
        zIndex: (zIndex ?? 0) + 1,
      }}
    >
      <div className={`absolute rounded-sm bg-black/60 p-0.5 ${isIcon ? "-top-2.5 -right-2.5" : "top-0.5 right-0.5"}`}>
        <EyeOff className="w-3 h-3 text-white" />
      </div>
    </div>
  );
}

interface ObjectsMainViewProps {
  selectedSpreadId: string;
  selectedItemId: SelectedItem | null;
  onSpreadSelect: (spreadId: string) => void;
  onItemSelect: (item: SelectedItem | null) => void;
}

export function ObjectsMainView({
  selectedSpreadId,
  selectedItemId,
  onSpreadSelect,
  onItemSelect,
}: ObjectsMainViewProps) {
  const retouchSpreads = useRetouchSpreads();
  const actions = useSnapshotActions();

  // Generate image modal state — spreadId captured at open time to prevent
  // wrong-spread updates if selection changes while modal is open
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateModalImage, setGenerateModalImage] =
    useState<SpreadImage | null>(null);
  const [generateModalSpreadId, setGenerateModalSpreadId] = useState<string>("");

  const openGenerateModal = useCallback((image: SpreadImage) => {
    setGenerateModalImage(image);
    setGenerateModalSpreadId(selectedSpreadId);
    setGenerateModalOpen(true);
  }, [selectedSpreadId]);

  const handleGenerateModalClose = useCallback((open: boolean) => {
    setGenerateModalOpen(open);
    if (!open) setGenerateModalImage(null);
  }, []);

  const handleGenerateImageUpdate = useCallback(
    (imageId: string, updates: Partial<SpreadImage>) => {
      actions.updateRetouchImage(generateModalSpreadId, imageId, updates);
    },
    [generateModalSpreadId, actions]
  );

  // Split image modal state
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitModalImage, setSplitModalImage] = useState<SpreadImage | null>(null);
  const [splitModalSpreadId, setSplitModalSpreadId] = useState<string>("");

  const openSplitModal = useCallback((image: SpreadImage) => {
    setSplitModalImage(image);
    setSplitModalSpreadId(selectedSpreadId);
    setSplitModalOpen(true);
  }, [selectedSpreadId]);

  const handleSplitModalClose = useCallback((open: boolean) => {
    setSplitModalOpen(open);
    if (!open) setSplitModalImage(null);
  }, []);

  // Crop image modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropModalImage, setCropModalImage] = useState<SpreadImage | null>(null);
  const [cropModalSpreadId, setCropModalSpreadId] = useState<string>("");

  const openCropModal = useCallback((image: SpreadImage) => {
    setCropModalImage(image);
    setCropModalSpreadId(selectedSpreadId);
    setCropModalOpen(true);
  }, [selectedSpreadId]);

  const handleCropModalClose = useCallback((open: boolean) => {
    setCropModalOpen(open);
    if (!open) setCropModalImage(null);
  }, []);

  const handleCropReplace = useCallback(
    (result: CropReplaceResult) => {
      if (!cropModalImage) return;
      const orig = cropModalImage;
      const origZ = orig["z-index"] ?? 0;

      // Add cropped objects as new images
      result.croppedObjects.forEach((obj, i) => {
        const newImage: SpreadImage = {
          id: crypto.randomUUID(),
          title: `${orig.title || "Untitled"} - Cropped #${obj.boxIndex + 1}`,
          geometry: {
            x: Math.min(orig.geometry.x + (obj.geometry.x / 100) * orig.geometry.w, 99),
            y: Math.min(orig.geometry.y + (obj.geometry.y / 100) * orig.geometry.h, 99),
            w: Math.min((obj.geometry.w / 100) * orig.geometry.w, 100),
            h: Math.min((obj.geometry.h / 100) * orig.geometry.h, 100),
          },
          media_url: obj.imageUrl,
          illustrations: [{
            media_url: obj.imageUrl,
            created_time: new Date().toISOString(),
            is_selected: true,
          }],
          type: "other",
          aspect_ratio: obj.aspectRatio,
          player_visible: orig.player_visible,
          editor_visible: orig.editor_visible,
          "z-index": origZ + i + 1,
        };
        actions.addRetouchImage(cropModalSpreadId, newImage);
      });

      // Add inpainted/background as new image
      if (result.inpaintedImageUrl) {
        const bgImage: SpreadImage = {
          id: crypto.randomUUID(),
          title: `${orig.title || "Untitled"} - Inpainted`,
          geometry: { ...orig.geometry },
          media_url: result.inpaintedImageUrl,
          illustrations: [{
            media_url: result.inpaintedImageUrl,
            created_time: new Date().toISOString(),
            is_selected: true,
          }],
          type: "background",
          aspect_ratio: orig.aspect_ratio,
          player_visible: orig.player_visible,
          editor_visible: orig.editor_visible,
          "z-index": origZ,
        };
        actions.addRetouchImage(cropModalSpreadId, bgImage);
      }

      // Delete original
      actions.deleteRetouchImage(cropModalSpreadId, cropModalImage.id);

      log.info("handleCropReplace", "replaced image with crop results", {
        croppedCount: result.croppedObjects.length,
        hasInpaint: !!result.inpaintedImageUrl,
        spreadId: cropModalSpreadId,
      });
    },
    [cropModalImage, cropModalSpreadId, actions]
  );

  const handleSplitCreateImages = useCallback(
    (layers: SplitLayerResult[]) => {
      if (!splitModalImage) return;
      const orig = splitModalImage.geometry;
      const origZ = splitModalImage["z-index"] ?? 0;
      const isFullScreen = orig.w >= 100 && orig.h >= 100;
      const spread = retouchSpreads.find((s) => s.id === splitModalSpreadId);

      // Cascade z-index: push existing images/videos up only where needed
      if (spread) {
        const tierItems = collectPictorialZItems(spread, splitModalImage.id);
        const shifts = calculateZIndexShifts(origZ, layers.length, tierItems);
        for (const shift of shifts) {
          // Determine item type for correct store action
          const isVideo = spread.videos?.some((v) => v.id === shift.id);
          if (isVideo) {
            actions.updateRetouchVideo(splitModalSpreadId, shift.id, { "z-index": shift.to });
          } else {
            actions.updateRetouchImage(splitModalSpreadId, shift.id, { "z-index": shift.to });
          }
          log.debug("handleSplitCreateImages", "shifted z-index", {
            itemId: shift.id, from: shift.from, to: shift.to,
          });
        }
      }

      // Create new images
      layers.forEach((layer, index) => {
        const newImage: SpreadImage = {
          id: crypto.randomUUID(),
          title: layer.title,
          geometry: isFullScreen
            ? { ...orig }
            : {
                x: Math.min(orig.x + 5 * (index + 1), 100 - orig.w),
                y: Math.min(orig.y + 5 * (index + 1), 100 - orig.h),
                w: orig.w,
                h: orig.h,
              },
          media_url: layer.media_url,
          illustrations: [
            {
              media_url: layer.media_url,
              created_time: new Date().toISOString(),
              is_selected: true,
            },
          ],
          type: splitModalImage.type,
          aspect_ratio: splitModalImage.aspect_ratio,
          player_visible: splitModalImage.player_visible,
          editor_visible: splitModalImage.editor_visible,
          "z-index": origZ + index + 1,
        };
        actions.addRetouchImage(splitModalSpreadId, newImage);
      });

      log.info("handleSplitCreateImages", "created images from split", {
        count: layers.length,
        spreadId: splitModalSpreadId,
        origZ,
        isFullScreen,
      });
    },
    [splitModalImage, splitModalSpreadId, actions, retouchSpreads]
  );

  // Unified item action handler - dispatches to store per type
  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId, itemType, action, itemId, data } = params;
      log.debug("handleSpreadItemAction", "dispatch", {
        spreadId,
        itemType,
        action,
      });

      switch (itemType) {
        case "image":
          if (action === "add")
            actions.addRetouchImage(spreadId, data as SpreadImage);
          else if (action === "update")
            actions.updateRetouchImage(
              spreadId,
              itemId as string,
              data as Partial<SpreadImage>
            );
          else if (action === "delete")
            actions.deleteRetouchImage(spreadId, itemId as string);
          break;
        case "textbox":
          if (action === "add")
            actions.addRetouchTextbox(spreadId, data as SpreadTextbox);
          else if (action === "update")
            actions.updateRetouchTextbox(
              spreadId,
              itemId as string,
              data as Partial<SpreadTextbox>
            );
          else if (action === "delete")
            actions.deleteRetouchTextbox(spreadId, itemId as string);
          break;
        case "shape":
          if (action === "add")
            actions.addRetouchShape(spreadId, data as SpreadShape);
          else if (action === "update")
            actions.updateRetouchShape(
              spreadId,
              itemId as string,
              data as Partial<SpreadShape>
            );
          else if (action === "delete")
            actions.deleteRetouchShape(spreadId, itemId as string);
          break;
        case "video":
          if (action === "add")
            actions.addRetouchVideo(spreadId, data as SpreadVideo);
          else if (action === "update")
            actions.updateRetouchVideo(
              spreadId,
              itemId as string,
              data as Partial<SpreadVideo>
            );
          else if (action === "delete")
            actions.deleteRetouchVideo(spreadId, itemId as string);
          break;
        case "audio":
          if (action === "add")
            actions.addRetouchAudio(spreadId, data as SpreadAudio);
          else if (action === "update")
            actions.updateRetouchAudio(
              spreadId,
              itemId as string,
              data as Partial<SpreadAudio>
            );
          else if (action === "delete")
            actions.deleteRetouchAudio(spreadId, itemId as string);
          break;
        case "quiz":
          if (action === "add")
            actions.addRetouchQuiz(spreadId, data as SpreadQuiz);
          else if (action === "update")
            actions.updateRetouchQuiz(
              spreadId,
              itemId as string,
              data as Partial<SpreadQuiz>
            );
          else if (action === "delete")
            actions.deleteRetouchQuiz(spreadId, itemId as string);
          break;
        case "page":
          if (action === "update" && typeof itemId === "number") {
            const spread = retouchSpreads.find((s) => s.id === spreadId);
            if (!spread) break;
            const newPages = [...spread.pages];
            newPages[itemId] = {
              ...newPages[itemId],
              ...(data as Partial<PageData>),
            };
            actions.updateRetouchSpread(spreadId, { pages: newPages });
          }
          break;
      }
    },
    [actions, retouchSpreads]
  );

  // Spread-level handlers
  const handleSpreadAdd = useCallback(
    (type: SpreadType) => {
      const spreadIndex = retouchSpreads.length;
      const basePage: PageData = {
        number: spreadIndex * 2,
        type: "normal_page",
        layout: null,
        background: { color: "#ffffff", texture: null },
      };
      const newSpread: BaseSpread = {
        id: crypto.randomUUID(),
        pages:
          type === "double"
            ? [basePage, { ...basePage, number: spreadIndex * 2 + 1 }]
            : [basePage],
        images: [],
        textboxes: [],
      };
      actions.addRetouchSpread(newSpread);
    },
    [actions, retouchSpreads.length]
  );

  const handleDeleteSpread = useCallback(
    (spreadId: string) => {
      actions.deleteRetouchSpread(spreadId);
    },
    [actions]
  );

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderRetouchSpreads(fromIndex, toIndex);
    },
    [actions]
  );

  // === Render props for 6 item types ===

  const renderRetouchImage = useCallback(
    (context: ImageItemContext<BaseSpread>) => {
      const img = context.item as SpreadImage;
      if (img.editor_visible === false) return null;
      return (
        <>
          <EditableImage
            image={context.item}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isEditable={context.isSpreadSelected}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "image", id: context.item.id });
            }}
            onArtNoteChange={(artNote) => context.onUpdate({ art_note: artNote })}
            onEditingChange={context.onEditingChange}
          />
          {img.player_visible === false && (
            <PlayerHiddenBadge geometry={img.geometry} zIndex={context.zIndex} />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  const renderRetouchTextbox = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      const tb = context.item as SpreadTextbox;
      if (tb.editor_visible === false) return null;
      const langKey = getFirstTextboxKey(tb);
      if (!langKey) return null;
      const langData = tb[langKey] as SpreadTextboxContent;

      return (
        <>
          <EditableTextbox
            textboxContent={langData}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isSelectable={context.isSpreadSelected}
            isEditable={context.isSpreadSelected}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "text", id: context.item.id });
            }}
            onTextChange={(newText) => {
              context.onUpdate({
                [langKey]: { ...langData, text: newText },
              } as unknown as Partial<SpreadTextbox>);
            }}
            onEditingChange={context.onEditingChange ?? (() => {})}
          />
          {tb.player_visible === false && (
            <PlayerHiddenBadge geometry={langData.geometry} zIndex={context.zIndex} />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  const renderRetouchShape = useCallback(
    (context: ShapeItemContext<BaseSpread>) => {
      const shape = context.item as SpreadShape;
      if (shape.editor_visible === false) return null;
      return (
        <>
          <EditableShape
            shape={context.item}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isEditable={context.isSpreadSelected}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "shape", id: context.item.id });
            }}
          />
          {shape.player_visible === false && (
            <PlayerHiddenBadge geometry={shape.geometry} zIndex={context.zIndex} />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  const renderRetouchVideo = useCallback(
    (context: VideoItemContext<BaseSpread>) => {
      const video = context.item as SpreadVideo;
      if (video.editor_visible === false) return null;
      return (
        <>
          <EditableVideo
            video={context.item}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isEditable={context.isSpreadSelected}
            isThumbnail={context.isThumbnail}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "video", id: context.item.id });
            }}
          />
          {video.player_visible === false && (
            <PlayerHiddenBadge geometry={video.geometry} zIndex={context.zIndex} />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  const renderRetouchAudio = useCallback(
    (context: AudioItemContext<BaseSpread>) => {
      const audio = context.item as SpreadAudio;
      if (audio.editor_visible === false) return null;
      return (
        <>
          <EditableAudio
            audio={context.item}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isEditable={context.isSpreadSelected}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "audio", id: context.item.id });
            }}
          />
          {audio.player_visible === false && (
            <PlayerHiddenBadge geometry={audio.geometry} zIndex={context.zIndex} isIcon />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  // === Image toolbar render prop ===
  const renderRetouchImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => (
      <ObjectsImageToolbar
        context={{
          ...context,
          onGenerateImage: () => openGenerateModal(context.item),
          onSplitImage: () => openSplitModal(context.item),
          onCropImage: () => openCropModal(context.item),
        }}
      />
    ),
    [openGenerateModal, openSplitModal, openCropModal],
  );

  const renderRetouchQuiz = useCallback(
    (context: QuizItemContext<BaseSpread>) => {
      const quiz = context.item as SpreadQuiz;
      if (quiz.editor_visible === false) return null;
      return (
        <>
          <EditableQuiz
            quiz={context.item}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isEditable={context.isSpreadSelected}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "quiz", id: context.item.id });
            }}
          />
          {quiz.player_visible === false && (
            <PlayerHiddenBadge geometry={quiz.geometry} zIndex={context.zIndex} isIcon />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  return (
    <>
      <CanvasSpreadView
        spreads={retouchSpreads}
        initialSelectedId={selectedSpreadId}
        renderItems={["image", "textbox", "shape", "video", "audio", "quiz"]}
        renderImageItem={renderRetouchImage}
        renderTextItem={renderRetouchTextbox}
        renderShapeItem={renderRetouchShape}
        renderVideoItem={renderRetouchVideo}
        renderAudioItem={renderRetouchAudio}
        renderQuizItem={renderRetouchQuiz}
        renderImageToolbar={renderRetouchImageToolbar}
        onSpreadSelect={onSpreadSelect}
        onSpreadReorder={handleSpreadReorder}
        onSpreadAdd={handleSpreadAdd}
        onDeleteSpread={handleDeleteSpread}
        onUpdateSpreadItem={handleSpreadItemAction}
        isEditable={true}
        canAddSpread={false}
        canReorderSpread={false}
        canDeleteSpread={false}
        canDeleteItem={true}
        canResizeItem={true}
        canDragItem={true}
        externalSelectedItemId={selectedItemId}
      />

      {generateModalImage && (
        <EditImageModal
          open={generateModalOpen}
          onOpenChange={handleGenerateModalClose}
          image={generateModalImage}
          onUpdateImage={(updates) => {
            handleGenerateImageUpdate(generateModalImage.id, updates);
            setGenerateModalImage((prev) =>
              prev ? { ...prev, ...updates } : null
            );
          }}
        />
      )}

      {splitModalImage && (
        <SplitImageModal
          open={splitModalOpen}
          onOpenChange={handleSplitModalClose}
          image={splitModalImage}
          onCreateImages={handleSplitCreateImages}
        />
      )}

      {cropModalImage && (
        <CropImageModal
          open={cropModalOpen}
          onOpenChange={handleCropModalClose}
          image={cropModalImage}
          onReplace={handleCropReplace}
        />
      )}
    </>
  );
}

export default ObjectsMainView;
