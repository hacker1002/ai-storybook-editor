// objects-main-view.tsx - CanvasSpreadView wrapper with retouch render props
"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Languages, Mic } from "lucide-react";
import { createLogger } from "@/utils/logger";
import { TranslateSpreadModal, type ApplyTranslationsPayload } from "./translate-spread-modal";
import {
  EnhanceSpreadNarrationModal,
  type ApplyEnhancementsPayload,
} from "./enhance-spread-narration-modal";
import {
  buildNarrationReaders,
  buildNarrationReaderToVoice,
} from "./utils/build-narration-readers";
import { applySpreadNarrationEnhancements } from "./utils/apply-spread-narration-enhancements";
import { buildBookContext } from "./utils/build-book-context";
import type { SpreadTextboxContent } from "@/types/spread-types";
import { CanvasSpreadView } from "@/features/editor/components/canvas-spread-view";
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableAutoAudio,
  EditableAutoPic,
  EditImageModal,
  SplitImageModal,
  CropImageModal,
  CropAudioModal,
  SegmentLayerModal,
} from "@/features/editor/components/shared-components";
import type {
  SplitLayerResult,
  CropCreateResult,
  SegmentResult,
} from "@/features/editor/components/shared-components";
import { ObjectsImageToolbar } from "./objects-image-toolbar";
import { ObjectsVideoToolbar } from "./objects-video-toolbar";
import { ObjectsAudioToolbar } from "./objects-audio-toolbar";
import { ObjectsShapeToolbar } from "./objects-shape-toolbar";
import { ObjectsTextToolbar } from "./objects-text-toolbar";
import { ObjectsRawImageToolbar } from "./objects-raw-image-toolbar";
import { ObjectsRawTextboxToolbar } from "./objects-raw-textbox-toolbar";
import { ObjectsAutoPicToolbar } from "./objects-auto-pic-toolbar";
import { PlayerHiddenBadge } from "./player-hidden-badge";
import {
  useRetouchSpreads,
  useSnapshotActions,
  useCharacters,
} from "@/stores/snapshot-store/selectors";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { useBookTemplateLayout, useCurrentBook } from "@/stores/book-store";
import { useCanvasWidth, useCanvasHeight } from "@/stores/editor-settings-store";
import { useInteractionLayerContext } from "@/features/editor/contexts/interaction-layer-provider";
import { COLUMNS } from "@/constants/spread-constants";
import {
  useSpreadHandlers,
  useSpreadItemDispatch,
  buildCropImages,
  buildSplitImages,
  buildSegmentImage,
  useSplitTextbox,
  useObjectModals,
  useCloneRaw,
  useDuplicateItem,
  useDuplicateHotkey,
} from "./hooks";
import type { SelectedItem } from "./objects-creative-space";
import type {
  BaseSpread,
  ImageItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  ShapeToolbarContext,
  VideoToolbarContext,
  AudioToolbarContext,
  AutoAudioItemContext,
  AutoAudioToolbarContext,
  AutoPicItemContext,
  AutoPicToolbarContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadAutoAudio,
  SpreadAutoPic,
} from "@/types/canvas-types";

const log = createLogger("UI", "ObjectsMainView");

interface ObjectsMainViewProps {
  selectedSpreadId: string;
  selectedItemId: SelectedItem | null;
  onSpreadSelect: (spreadId: string) => void;
  onItemSelect: (item: SelectedItem | null) => void;
  zoomLevel: number;
  onZoomChange: (level: number) => void;
}

export function ObjectsMainView({
  selectedSpreadId,
  selectedItemId,
  onSpreadSelect,
  onItemSelect,
  zoomLevel,
  onZoomChange,
}: ObjectsMainViewProps) {
  const retouchSpreads = useRetouchSpreads();
  const actions = useSnapshotActions();
  const langCode = useLanguageCode();
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const templateLayout = useBookTemplateLayout();
  const book = useCurrentBook();

  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [narrationSpreadModalOpen, setNarrationSpreadModalOpen] = useState(false);

  const characters = useCharacters();

  const selectedSpread = useMemo(
    () => retouchSpreads.find(s => s.id === selectedSpreadId),
    [retouchSpreads, selectedSpreadId]
  );

  const originalLanguage = book?.original_language ?? "en_US";

  const enhanceReaders = useMemo(
    () => buildNarrationReaders(book ?? null, characters),
    [book, characters]
  );
  const enhanceReaderToVoice = useMemo(
    () => buildNarrationReaderToVoice(book ?? null, characters, langCode),
    [book, characters, langCode]
  );

  const bookContext = useMemo(
    () => buildBookContext(book, retouchSpreads, selectedSpread),
    [book, retouchSpreads, selectedSpread]
  );

  const handleApplyTranslations = useCallback(
    (payload: ApplyTranslationsPayload) => {
      const spread = retouchSpreads.find(s => s.id === payload.spreadId);
      if (!spread) {
        log.warn("handleApplyTranslations", "spread not found", { spreadId: payload.spreadId });
        return;
      }
      log.info("handleApplyTranslations", "start", {
        spreadId: payload.spreadId,
        count: payload.results.length,
        targetLang: payload.targetLang,
      });
      for (const { id, translated_text } of payload.results) {
        const textbox = spread.textboxes.find(tb => tb.id === id);
        if (!textbox) {
          log.debug("handleApplyTranslations", "textbox missing", { id });
          continue;
        }
        const existing = (textbox as Record<string, unknown>)[payload.targetLang] as
          | SpreadTextboxContent
          | undefined;
        let newContent: SpreadTextboxContent;
        if (existing && typeof existing === "object" && "text" in existing) {
          newContent = { ...existing, text: translated_text };
        } else {
          const baseline = (textbox as Record<string, unknown>)[originalLanguage] as
            | SpreadTextboxContent
            | undefined;
          if (!baseline || typeof baseline !== "object" || !("text" in baseline)) {
            log.warn("handleApplyTranslations", "baseline missing, skip", { id });
            continue;
          }
          newContent = {
            text: translated_text,
            geometry: { ...baseline.geometry },
            typography: { ...baseline.typography },
          };
        }
        actions.updateRetouchTextbox(payload.spreadId, id, {
          [payload.targetLang]: newContent,
        } as Partial<SpreadTextbox>);
      }
      log.info("handleApplyTranslations", "done", { spreadId: payload.spreadId });
    },
    [retouchSpreads, actions, originalLanguage]
  );

  const handleApplyEnhancements = useCallback(
    (payload: ApplyEnhancementsPayload) => {
      log.info("handleApplyEnhancements", "start", {
        spreadId: payload.spreadId,
        lang: payload.language,
        count: payload.results.length,
      });
      const spread = retouchSpreads.find(s => s.id === payload.spreadId);
      if (!spread) {
        log.warn("handleApplyEnhancements", "spread not found", {
          spreadId: payload.spreadId,
        });
        return;
      }
      applySpreadNarrationEnhancements({
        spread,
        payload,
        updateRetouchTextbox: actions.updateRetouchTextbox,
      });
    },
    [retouchSpreads, actions]
  );

  const translateLeftAction = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          log.info("translateButton", "click", { spreadId: selectedSpreadId });
          setTranslateModalOpen(true);
        }}
        disabled={!selectedSpreadId || !selectedSpread}
        aria-label="Translate spread"
      >
        <Languages className="h-4 w-4 mr-1.5" />
        Translate
      </Button>
    ),
    [selectedSpreadId, selectedSpread]
  );

  const narrationLeftAction = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          log.info("narrationButton", "click", { spreadId: selectedSpreadId });
          setNarrationSpreadModalOpen(true);
        }}
        disabled={!selectedSpreadId || !selectedSpread}
        aria-label="Enhance narration"
      >
        <Mic className="h-4 w-4 mr-1.5" />
        Narration
      </Button>
    ),
    [selectedSpreadId, selectedSpread]
  );

  const combinedLeftActions = useMemo(
    () => (
      <>
        {translateLeftAction}
        {narrationLeftAction}
      </>
    ),
    [translateLeftAction, narrationLeftAction]
  );

  const handleDeselect = useCallback(() => onItemSelect(null), [onItemSelect]);

  const { splitTextbox } = useSplitTextbox(actions, onItemSelect, langCode, canvasWidth, canvasHeight);

  const modals = useObjectModals(selectedSpreadId, actions);
  const { openGenerate, openSplit, openCrop, openSegment, openCropAudio } = modals;

  const handleCropCreateImages = useCallback(
    (result: CropCreateResult) => {
      if (!modals.crop.image) return;
      buildCropImages(result, modals.crop.image, modals.crop.spreadId, retouchSpreads, actions);
    },
    [modals.crop.image, modals.crop.spreadId, retouchSpreads, actions]
  );

  const handleSplitCreateImages = useCallback(
    (layers: SplitLayerResult[]) => {
      if (!modals.split.image) return;
      buildSplitImages(layers, modals.split.image, modals.split.spreadId, retouchSpreads, actions);
    },
    [modals.split.image, modals.split.spreadId, retouchSpreads, actions]
  );

  const handleSegmentCreateImage = useCallback(
    (segment: SegmentResult) => {
      if (!modals.segment.image) return;
      buildSegmentImage(
        segment,
        modals.segment.image,
        modals.segment.spreadId,
        retouchSpreads,
        actions,
        (item) => onItemSelect(item)
      );
    },
    [modals.segment.image, modals.segment.spreadId, retouchSpreads, actions, onItemSelect]
  );

  const { handleDeleteSpread, handleSpreadReorder } = useSpreadHandlers(actions);
  const { handleSpreadItemAction } = useSpreadItemDispatch(actions, retouchSpreads);

  const { stackRef } = useInteractionLayerContext();
  const { handleDuplicateItem } = useDuplicateItem(retouchSpreads, selectedSpreadId, actions, onItemSelect);
  useDuplicateHotkey(stackRef, selectedItemId, handleDuplicateItem);

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
            showItemBorder={true}
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
            isEditing={context.isEditing}
            showItemBorder={true}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: "textbox", id: context.item.id });
            }}
            onTextChange={(newText) => {
              // Atomic single onUpdate per spec §4.3: when media exists, flip
              // is_sync=false in the SAME call as the text change. Two
              // separate updates would hit a stale-closure overwrite.
              // DB-CHANGELOG 2026-04-29: rollup `script_synced` → `is_sync`.
              const audio = content.audio;
              const nextContent: SpreadTextboxContent =
                audio?.combined_audio_url
                  ? {
                      ...content,
                      text: newText,
                      audio: { ...audio, is_sync: false },
                    }
                  : { ...content, text: newText };
              context.onUpdate({
                [langKey]: nextContent,
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
            showItemBorder={true}
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

  const renderRetouchAutoAudio = useCallback(
    (context: AutoAudioItemContext<BaseSpread>) => {
      const aa = context.item as SpreadAutoAudio;
      if (aa.editor_visible === false) return null;
      // No PlayerHiddenBadge: player_visible locked false is design intent for auto_audio (BGM),
      // not a divergence to hint at.
      // In editor (Objects creative space), never trigger the player <audio
      // autoPlay> branch — toolbar preview is the sound check. Force
      // isEditable=true so all spreads (selected + thumbnails) render icon-only.
      return (
        <EditableAutoAudio
          autoAudio={aa}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={context.isSelected}
          isEditable={true}
          isThumbnail={context.isThumbnail}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: "auto_audio", id: aa.id });
          }}
        />
      );
    },
    [onItemSelect]
  );

  const renderRetouchAutoPic = useCallback(
    (context: AutoPicItemContext<BaseSpread>) => {
      const ap = context.item as SpreadAutoPic;
      if (ap.editor_visible === false) return null;
      return (
        <>
          <EditableAutoPic
            autoPic={context.item}
            index={context.itemIndex}
            zIndex={context.zIndex}
            isSelected={context.isSelected}
            isEditable={context.isSpreadSelected}
            isThumbnail={context.isThumbnail}
            showItemBorder={true}
            onSelect={() => {
              context.onSelect();
              onItemSelect({ type: 'auto_pic', id: context.item.id });
            }}
          />
          {ap.player_visible === false && (
            <PlayerHiddenBadge
              geometry={ap.geometry}
              zIndex={context.zIndex}
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
          dimmed={true}
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
          dimmed={true}
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
          onGenerateImage: () => openGenerate(context.item),
          onSegmentImage: () => openSegment(context.item),
          onSplitImage: () => openSplit(context.item),
          onCropImage: () => openCrop(context.item),
        }}
      />
    ),
    [openGenerate, openSegment, openSplit, openCrop]
  );

  const { cloneRawImage, cloneRawTextbox } = useCloneRaw(retouchSpreads, selectedSpreadId, actions);

  const renderRawImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => (
      <ObjectsRawImageToolbar
        context={{
          ...context,
          onSplitImage: () => openSplit(context.item),
          onCropImage: () => openCrop(context.item),
          onClone: () => cloneRawImage(context.item as SpreadImage),
        }}
      />
    ),
    [openSplit, openCrop, cloneRawImage]
  );

  const renderRetouchTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <ObjectsTextToolbar
        context={{
          ...context,
          onSplitTextbox: () =>
            splitTextbox(selectedSpreadId, context.item, { deleteSource: true, inheritVisibility: true }),
        }}
      />
    ),
    [selectedSpreadId, splitTextbox]
  );


  const renderRawTextboxToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <ObjectsRawTextboxToolbar
        context={{
          ...context,
          onSplitTextbox: () =>
            splitTextbox(selectedSpreadId, context.item, { deleteSource: false, inheritVisibility: false }),
          onClone: () => cloneRawTextbox(context.item),
        }}
      />
    ),
    [selectedSpreadId, splitTextbox, cloneRawTextbox]
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

  // === AutoPic toolbar render prop ===
  const renderRetouchAutoPicToolbar = useCallback(
    (context: AutoPicToolbarContext<BaseSpread>) => (
      <ObjectsAutoPicToolbar context={context} />
    ),
    []
  );

  // === Audio toolbar render prop ===
  const renderRetouchAudioToolbar = useCallback(
    (context: AudioToolbarContext<BaseSpread>) => (
      <ObjectsAudioToolbar
        variant="audio"
        context={{
          ...context,
          onCropAudio: () =>
            openCropAudio(context.item as SpreadAudio, "audio"),
        }}
      />
    ),
    [openCropAudio]
  );

  // === Auto-audio toolbar render prop (variant of ObjectsAudioToolbar) ===
  const renderRetouchAutoAudioToolbar = useCallback(
    (context: AutoAudioToolbarContext<BaseSpread>) => (
      <ObjectsAudioToolbar
        variant="auto_audio"
        context={{
          ...context,
          onCropAudio: () =>
            openCropAudio(context.item as SpreadAutoAudio, "auto_audio"),
        }}
      />
    ),
    [openCropAudio]
  );

  return (
    <>
      <CanvasSpreadView
        spreads={retouchSpreads}
        selectedSpreadId={selectedSpreadId}
        viewMode="edit"
        zoomLevel={zoomLevel}
        columnsPerRow={COLUMNS.DEFAULT}
        onViewModeChange={() => {}}
        onZoomChange={onZoomChange}
        onColumnsChange={() => {}}
        renderItems={[
          "raw_image",
          "raw_textbox",
          "image",
          "textbox",
          "shape",
          "video",
          "auto_pic",
          "audio",
          "auto_audio",
        ]}
        renderImageItem={renderRetouchImage}
        renderTextItem={renderRetouchTextbox}
        renderShapeItem={renderRetouchShape}
        renderVideoItem={renderRetouchVideo}
        renderAutoPicItem={renderRetouchAutoPic}
        renderAudioItem={renderRetouchAudio}
        renderAutoAudioItem={renderRetouchAutoAudio}
        renderRawImage={renderRawImage}
        renderRawTextbox={renderRawTextbox}
        renderImageToolbar={renderRetouchImageToolbar}
        renderTextToolbar={renderRetouchTextToolbar}
        renderShapeToolbar={renderRetouchShapeToolbar}
        renderVideoToolbar={renderRetouchVideoToolbar}
        renderAutoPicToolbar={renderRetouchAutoPicToolbar}
        renderAudioToolbar={renderRetouchAudioToolbar}
        renderAutoAudioToolbar={renderRetouchAutoAudioToolbar}
        renderRawImageToolbar={renderRawImageToolbar}
        renderRawTextboxToolbar={renderRawTextboxToolbar}
        onSpreadSelect={onSpreadSelect}
        onSpreadReorder={handleSpreadReorder}
        onDeleteSpread={handleDeleteSpread}
        onUpdateSpreadItem={handleSpreadItemAction}
        isEditable={true}
        preventEditRawItem={true}
        canAddSpread={false}
        canReorderSpread={false}
        canDeleteSpread={false}
        showViewToggle={false}
        leftActions={combinedLeftActions}
        canResizeItem={true}
        canDragItem={true}
        externalSelectedItemId={selectedItemId}
        onDeselect={handleDeselect}
        pageNumbering={templateLayout?.page_numbering}
      />

      {modals.generate.imageId && (
        <EditImageModal
          open={modals.generate.open}
          onOpenChange={modals.closeGenerate}
          spreadId={modals.generate.spreadId}
          imageId={modals.generate.imageId}
        />
      )}

      {modals.split.image && (
        <SplitImageModal
          open={modals.split.open}
          onOpenChange={modals.closeSplit}
          image={modals.split.image}
          onCreateImages={handleSplitCreateImages}
        />
      )}

      {modals.segment.image && (
        <SegmentLayerModal
          open={modals.segment.open}
          onOpenChange={modals.closeSegment}
          image={modals.segment.image}
          onCreateSegment={handleSegmentCreateImage}
        />
      )}

      {modals.crop.image && (
        <CropImageModal
          open={modals.crop.open}
          onOpenChange={modals.closeCrop}
          image={modals.crop.image}
          onCreateImages={handleCropCreateImages}
        />
      )}

      {selectedSpread && (
        <TranslateSpreadModal
          isOpen={translateModalOpen}
          onClose={() => setTranslateModalOpen(false)}
          spreadId={selectedSpreadId}
          textboxes={selectedSpread.textboxes ?? []}
          originalLang={originalLanguage}
          editorLang={langCode}
          context={bookContext}
          onApplyTranslations={handleApplyTranslations}
        />
      )}

      {selectedSpread && (
        <EnhanceSpreadNarrationModal
          isOpen={narrationSpreadModalOpen}
          onClose={() => setNarrationSpreadModalOpen(false)}
          spreadId={selectedSpreadId}
          textboxes={selectedSpread.textboxes ?? []}
          editorLang={langCode}
          readers={enhanceReaders}
          readerToVoice={enhanceReaderToVoice}
          context={bookContext}
          onApplyEnhancements={handleApplyEnhancements}
        />
      )}

      {modals.cropAudio.item?.media_url && (
        <CropAudioModal
          isOpen={modals.cropAudio.open}
          onClose={modals.closeCropAudio}
          audioName={modals.cropAudio.item.name}
          mediaUrl={modals.cropAudio.item.media_url}
          onCropComplete={modals.handleCropAudioComplete}
        />
      )}
    </>
  );
}

export default ObjectsMainView;
