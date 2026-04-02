// objects-main-view.tsx - CanvasSpreadView wrapper with retouch render props
"use client";

import { useState, useCallback } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { CanvasSpreadView } from "@/features/editor/components/canvas-spread-view";
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditImageModal,
  SplitImageModal,
  CropImageModal,
  CropAudioModal,
} from "@/features/editor/components/shared-components";
import type {
  SplitLayerResult,
  CropCreateResult,
} from "@/features/editor/components/shared-components";
import { ObjectsImageToolbar } from "./objects-image-toolbar";
import { ObjectsVideoToolbar } from "./objects-video-toolbar";
import { ObjectsAudioToolbar } from "./objects-audio-toolbar";
import { ObjectsShapeToolbar } from "./objects-shape-toolbar";
import { ObjectsTextToolbar } from "./objects-text-toolbar";
import { ObjectsRawImageToolbar } from "./objects-raw-image-toolbar";
import { ObjectsRawTextboxToolbar } from "./objects-raw-textbox-toolbar";
import type { Geometry } from "@/types/canvas-types";
import {
  useRetouchSpreads,
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import { useLanguageCode } from "@/stores/editor-settings-store";
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
  TextToolbarContext,
  ShapeToolbarContext,
  VideoToolbarContext,
  AudioToolbarContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  SpreadItemActionUnion,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  PageData,
} from "@/types/canvas-types";

const log = createLogger("Editor", "ObjectsMainView");

/** Badge overlay shown on canvas items when player_visible = false.
 *  For icon-type items (audio/quiz) with w=0,h=0, uses fixed 32px box matching the icon size. */
function PlayerHiddenBadge({
  geometry,
  zIndex,
  isIcon,
}: {
  geometry: Geometry;
  zIndex?: number;
  isIcon?: boolean;
}) {
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
      <div
        className={`absolute rounded-sm bg-black/60 p-0.5 ${
          isIcon ? "-top-2.5 -right-2.5" : "top-0.5 right-0.5"
        }`}
      >
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
  const langCode = useLanguageCode();

  // Generate image modal state — spreadId captured at open time to prevent
  // wrong-spread updates if selection changes while modal is open
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateModalImageId, setGenerateModalImageId] = useState<
    string | null
  >(null);
  const [generateModalSpreadId, setGenerateModalSpreadId] =
    useState<string>("");

  const openGenerateModal = useCallback(
    (image: SpreadImage) => {
      setGenerateModalImageId(image.id);
      setGenerateModalSpreadId(selectedSpreadId);
      setGenerateModalOpen(true);
    },
    [selectedSpreadId]
  );

  const handleGenerateModalClose = useCallback((open: boolean) => {
    setGenerateModalOpen(open);
    if (!open) setGenerateModalImageId(null);
  }, []);

  // Split image modal state
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitModalImage, setSplitModalImage] = useState<SpreadImage | null>(
    null
  );
  const [splitModalSpreadId, setSplitModalSpreadId] = useState<string>("");

  const openSplitModal = useCallback(
    (image: SpreadImage) => {
      setSplitModalImage(image);
      setSplitModalSpreadId(selectedSpreadId);
      setSplitModalOpen(true);
    },
    [selectedSpreadId]
  );

  const handleSplitModalClose = useCallback((open: boolean) => {
    setSplitModalOpen(open);
    if (!open) setSplitModalImage(null);
  }, []);

  // Crop audio modal state
  const [cropAudioModalOpen, setCropAudioModalOpen] = useState(false);
  const [cropAudioItem, setCropAudioItem] = useState<SpreadAudio | null>(null);
  const [cropAudioSpreadId, setCropAudioSpreadId] = useState<string>("");

  const openCropAudioModal = useCallback(
    (audio: SpreadAudio) => {
      setCropAudioItem(audio);
      setCropAudioSpreadId(selectedSpreadId);
      setCropAudioModalOpen(true);
    },
    [selectedSpreadId]
  );

  const handleCropAudioModalClose = useCallback(() => {
    setCropAudioModalOpen(false);
    setCropAudioItem(null);
  }, []);

  const handleCropAudioComplete = useCallback(
    (newMediaUrl: string) => {
      if (!cropAudioItem) return;
      actions.updateRetouchAudio(cropAudioSpreadId, cropAudioItem.id, {
        media_url: newMediaUrl,
      });
      log.info("handleCropAudioComplete", "audio cropped", {
        audioId: cropAudioItem.id,
        spreadId: cropAudioSpreadId,
        newMediaUrl,
      });
      setCropAudioModalOpen(false);
      setCropAudioItem(null);
    },
    [cropAudioItem, cropAudioSpreadId, actions]
  );

  // Crop image modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropModalImage, setCropModalImage] = useState<SpreadImage | null>(
    null
  );
  const [cropModalSpreadId, setCropModalSpreadId] = useState<string>("");

  const openCropModal = useCallback(
    (image: SpreadImage) => {
      setCropModalImage(image);
      setCropModalSpreadId(selectedSpreadId);
      setCropModalOpen(true);
    },
    [selectedSpreadId]
  );

  const handleCropModalClose = useCallback((open: boolean) => {
    setCropModalOpen(open);
    if (!open) setCropModalImage(null);
  }, []);

  const handleCropCreateImages = useCallback(
    (result: CropCreateResult) => {
      if (!cropModalImage) return;
      const orig = cropModalImage;
      const origZ = orig["z-index"] ?? 0;
      const insertCount = result.croppedObjects.length;

      // Cascade z-index: push existing items up to make room for new crops
      const spread = retouchSpreads.find((s) => s.id === cropModalSpreadId);
      if (spread) {
        const tierItems = collectPictorialZItems(spread, cropModalImage.id);
        const shifts = calculateZIndexShifts(origZ, insertCount, tierItems);
        for (const shift of shifts) {
          const isVideo = spread.videos?.some((v) => v.id === shift.id);
          if (isVideo) {
            actions.updateRetouchVideo(cropModalSpreadId, shift.id, {
              "z-index": shift.to,
            });
          } else {
            actions.updateRetouchImage(cropModalSpreadId, shift.id, {
              "z-index": shift.to,
            });
          }
          log.debug("handleCropCreateImages", "shifted z-index", {
            itemId: shift.id,
            from: shift.from,
            to: shift.to,
          });
        }
      }

      // Add cropped objects as new images (original image kept as-is)
      result.croppedObjects.forEach((obj, i) => {
        const newImage: SpreadImage = {
          id: crypto.randomUUID(),
          title: `${orig.title || "Untitled"} - Crop #${obj.boxIndex + 1}`,
          geometry: {
            x: Math.min(
              orig.geometry.x + (obj.geometry.x / 100) * orig.geometry.w,
              99
            ),
            y: Math.min(
              orig.geometry.y + (obj.geometry.y / 100) * orig.geometry.h,
              99
            ),
            w: Math.min((obj.geometry.w / 100) * orig.geometry.w, 100),
            h: Math.min((obj.geometry.h / 100) * orig.geometry.h, 100),
          },
          media_url: obj.imageUrl,
          illustrations: [
            {
              media_url: obj.imageUrl,
              created_time: new Date().toISOString(),
              is_selected: true,
            },
          ],
          type: "other",
          aspect_ratio: obj.aspectRatio,
          player_visible: orig.player_visible,
          editor_visible: orig.editor_visible,
          "z-index": origZ + i + 1,
        };
        actions.addRetouchImage(cropModalSpreadId, newImage);
      });

      log.info("handleCropCreateImages", "created new images from crops", {
        croppedCount: result.croppedObjects.length,
        spreadId: cropModalSpreadId,
      });
    },
    [cropModalImage, cropModalSpreadId, actions, retouchSpreads]
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
            actions.updateRetouchVideo(splitModalSpreadId, shift.id, {
              "z-index": shift.to,
            });
          } else {
            actions.updateRetouchImage(splitModalSpreadId, shift.id, {
              "z-index": shift.to,
            });
          }
          log.debug("handleSplitCreateImages", "shifted z-index", {
            itemId: shift.id,
            from: shift.from,
            to: shift.to,
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
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(
              spreadId,
              itemId as string
            );
            actions.deleteRetouchImage(spreadId, itemId as string);
          }
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
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(
              spreadId,
              itemId as string
            );
            actions.deleteRetouchTextbox(spreadId, itemId as string);
          }
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
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(
              spreadId,
              itemId as string
            );
            actions.deleteRetouchShape(spreadId, itemId as string);
          }
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
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(
              spreadId,
              itemId as string
            );
            actions.deleteRetouchVideo(spreadId, itemId as string);
          }
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
          else if (action === "delete") {
            actions.deleteRetouchAnimationsByTargetId(
              spreadId,
              itemId as string
            );
            actions.deleteRetouchAudio(spreadId, itemId as string);
          }
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
            actions.updateIllustrationSpread(spreadId, { pages: newPages });
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
      actions.addIllustrationSpread(newSpread);
    },
    [actions, retouchSpreads.length]
  );

  const handleDeleteSpread = useCallback(
    (spreadId: string) => {
      actions.deleteIllustrationSpread(spreadId);
    },
    [actions]
  );

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderIllustrationSpreads(fromIndex, toIndex);
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
            onArtNoteChange={(artNote) =>
              context.onUpdate({ art_note: artNote })
            }
            onEditingChange={context.onEditingChange}
          />
          {img.player_visible === false && (
            <PlayerHiddenBadge
              geometry={img.geometry}
              zIndex={context.zIndex}
            />
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
      const result = getTextboxContentForLanguage(tb, langCode);
      if (!result) return null;
      const { langKey, content } = result;

      return (
        <>
          <EditableTextbox
            textboxContent={content}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isSelectable={context.isSpreadSelected}
            isEditable={context.isSpreadSelected}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "textbox", id: context.item.id });
            }}
            onTextChange={(newText) => {
              context.onUpdate({
                [langKey]: { ...content, text: newText },
              } as unknown as Partial<SpreadTextbox>);
            }}
            onEditingChange={context.onEditingChange ?? (() => {})}
          />
          {tb.player_visible === false && (
            <PlayerHiddenBadge
              geometry={content.geometry}
              zIndex={context.zIndex}
            />
          )}
        </>
      );
    },
    [onItemSelect, langCode]
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
            <PlayerHiddenBadge
              geometry={shape.geometry}
              zIndex={context.zIndex}
            />
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
            <PlayerHiddenBadge
              geometry={video.geometry}
              zIndex={context.zIndex}
            />
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
            <PlayerHiddenBadge
              geometry={audio.geometry}
              zIndex={context.zIndex}
              isIcon
            />
          )}
        </>
      );
    },
    [onItemSelect]
  );

  // === Raw item render props (illustration layer — read-only on canvas) ===

  const renderRawImage = useCallback(
    (context: ImageItemContext<BaseSpread>) => {
      const img = context.item as SpreadImage;
      if (img.editor_visible === false) return null;
      return (
        <EditableImage
          image={context.item}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={context.isSelected}
          isSelectable={true}
          isEditable={false}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: "raw_image", id: context.item.id });
          }}
        />
      );
    },
    [onItemSelect]
  );

  const renderRawTextbox = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      const tb = context.item as SpreadTextbox;
      if (tb.editor_visible === false) return null;
      const result = getTextboxContentForLanguage(tb, langCode);
      if (!result) return null;
      const { content } = result;
      return (
        <EditableTextbox
          textboxContent={content}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={context.isSelected}
          isSelectable={context.isSpreadSelected}
          isEditable={false}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: "raw_textbox", id: context.item.id });
          }}
          onTextChange={() => {}}
          onEditingChange={() => {}}
        />
      );
    },
    [onItemSelect, langCode]
  );

  // === Toolbar render props ===

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
    [openGenerateModal, openSplitModal, openCropModal]
  );

  const renderRawImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => (
      <ObjectsRawImageToolbar
        context={{
          ...context,
          onSplitImage: () => openSplitModal(context.item),
          onCropImage: () => openCropModal(context.item),
        }}
      />
    ),
    [openSplitModal, openCropModal]
  );

  // === Text toolbar render prop ===
  const handleSplitTextbox = useCallback(
    (spreadId: string, textbox: SpreadTextbox) => {
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
      log.info("handleSplitTextbox", "splitting textbox", {
        itemId: textbox.id,
        segments: segments.length,
      });
      const baseGeometry = content.geometry;
      for (let i = 0; i < segments.length; i++) {
        const newTextbox: SpreadTextbox = {
          id: crypto.randomUUID(),
          [langKey]: {
            text: segments[i] + ".",
            geometry: {
              x: baseGeometry.x,
              y: Math.min(
                baseGeometry.y + baseGeometry.h * i,
                100 - baseGeometry.h
              ),
              w: baseGeometry.w,
              h: baseGeometry.h,
            },
            typography: { ...content.typography },
          },
          player_visible: textbox.player_visible,
          editor_visible: textbox.editor_visible,
        };
        actions.addRetouchTextbox(spreadId, newTextbox);
      }
      actions.deleteRetouchAnimationsByTargetId(spreadId, textbox.id);
      actions.deleteRetouchTextbox(spreadId, textbox.id);
      onItemSelect(null);
    },
    [actions, onItemSelect, langCode]
  );

  // Split raw textbox → creates new retouch textboxes (raw textbox is kept)
  const handleSplitRawTextbox = useCallback(
    (spreadId: string, textbox: SpreadTextbox) => {
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
      log.info("handleSplitRawTextbox", "splitting raw textbox", {
        itemId: textbox.id,
        segments: segments.length,
      });
      const baseGeometry = content.geometry;
      for (let i = 0; i < segments.length; i++) {
        const newTextbox: SpreadTextbox = {
          id: crypto.randomUUID(),
          [langKey]: {
            text: segments[i] + ".",
            geometry: {
              x: baseGeometry.x,
              y: Math.min(
                baseGeometry.y + baseGeometry.h * i,
                100 - baseGeometry.h
              ),
              w: baseGeometry.w,
              h: baseGeometry.h,
            },
            typography: { ...content.typography },
          },
          player_visible: true,
          editor_visible: true,
        };
        actions.addRetouchTextbox(spreadId, newTextbox);
      }
      onItemSelect(null);
    },
    [actions, onItemSelect, langCode]
  );

  const renderRetouchTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <ObjectsTextToolbar
        context={{
          ...context,
          onSplitTextbox: () =>
            handleSplitTextbox(selectedSpreadId, context.item),
        }}
      />
    ),
    [selectedSpreadId, handleSplitTextbox]
  );

  const renderRawTextboxToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <ObjectsRawTextboxToolbar
        context={{
          ...context,
          onSplitTextbox: () =>
            handleSplitRawTextbox(selectedSpreadId, context.item),
        }}
      />
    ),
    [selectedSpreadId, handleSplitRawTextbox]
  );

  // === Shape toolbar render prop ===
  const renderRetouchShapeToolbar = useCallback(
    (context: ShapeToolbarContext<BaseSpread>) => (
      <ObjectsShapeToolbar context={context} />
    ),
    []
  );

  // === Video toolbar render prop ===
  const renderRetouchVideoToolbar = useCallback(
    (context: VideoToolbarContext<BaseSpread>) => (
      <ObjectsVideoToolbar context={context} />
    ),
    []
  );

  // === Audio toolbar render prop ===
  const renderRetouchAudioToolbar = useCallback(
    (context: AudioToolbarContext<BaseSpread>) => (
      <ObjectsAudioToolbar
        context={{
          ...context,
          onCropAudio: () => openCropAudioModal(context.item as SpreadAudio),
        }}
      />
    ),
    [openCropAudioModal]
  );

  return (
    <>
      <CanvasSpreadView
        spreads={retouchSpreads}
        initialSelectedId={selectedSpreadId}
        renderItems={[
          "raw_image",
          "raw_textbox",
          "image",
          "textbox",
          "shape",
          "video",
          "audio",
        ]}
        renderImageItem={renderRetouchImage}
        renderTextItem={renderRetouchTextbox}
        renderShapeItem={renderRetouchShape}
        renderVideoItem={renderRetouchVideo}
        renderAudioItem={renderRetouchAudio}
        renderRawImage={renderRawImage}
        renderRawTextbox={renderRawTextbox}
        renderImageToolbar={renderRetouchImageToolbar}
        renderTextToolbar={renderRetouchTextToolbar}
        renderShapeToolbar={renderRetouchShapeToolbar}
        renderVideoToolbar={renderRetouchVideoToolbar}
        renderAudioToolbar={renderRetouchAudioToolbar}
        renderRawImageToolbar={renderRawImageToolbar}
        renderRawTextboxToolbar={renderRawTextboxToolbar}
        onSpreadSelect={onSpreadSelect}
        onSpreadReorder={handleSpreadReorder}
        onSpreadAdd={handleSpreadAdd}
        onDeleteSpread={handleDeleteSpread}
        onUpdateSpreadItem={handleSpreadItemAction}
        isEditable={true}
        preventEditRawItem={true}
        canAddSpread={false}
        canReorderSpread={false}
        canDeleteSpread={false}
        canDeleteItem={true}
        canResizeItem={true}
        canDragItem={true}
        externalSelectedItemId={selectedItemId}
      />

      {generateModalImageId && (
        <EditImageModal
          open={generateModalOpen}
          onOpenChange={handleGenerateModalClose}
          spreadId={generateModalSpreadId}
          imageId={generateModalImageId}
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
          onCreateImages={handleCropCreateImages}
        />
      )}

      {cropAudioItem?.media_url && (
        <CropAudioModal
          isOpen={cropAudioModalOpen}
          onClose={handleCropAudioModalClose}
          audioName={cropAudioItem.name}
          mediaUrl={cropAudioItem.media_url}
          onCropComplete={handleCropAudioComplete}
        />
      )}
    </>
  );
}

export default ObjectsMainView;
