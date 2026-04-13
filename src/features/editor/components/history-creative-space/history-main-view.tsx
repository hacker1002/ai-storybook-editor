// history-main-view.tsx - Read-only CanvasSpreadView wrapper for history snapshot preview
"use client";

import { useState, useCallback } from "react";
import { CanvasSpreadView } from "@/features/editor/components/canvas-spread-view";
import { ZOOM, COLUMNS } from "@/constants/spread-constants";
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAudio,
} from "@/features/editor/components/shared-components";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { createLogger } from "@/utils/logger";
import type { HistorySnapshotData } from "./history-types";
import type {
  BaseSpread,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  SpreadTextbox,
} from "@/types/canvas-types";

const log = createLogger("Editor", "HistoryMainView");

interface HistoryMainViewProps {
  snapshot: HistorySnapshotData;
}

export function HistoryMainView({ snapshot }: HistoryMainViewProps) {
  const langCode = useLanguageCode();
  log.debug("render", "rendering snapshot", { snapshotId: snapshot.id });

  // Read-only view — local spread selection for filmstrip navigation only.
  // View mode/zoom/columns are fixed (history is display-only, not persisted).
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(null);

  // === Read-only render props — no interactions, no toolbars ===

  const renderImageItem = useCallback(
    (context: ImageItemContext<BaseSpread>) => (
      <EditableImage
        image={context.item}
        index={context.itemIndex}
        zIndex={context.zIndex}
        isSelected={false}
        isSelectable={false}
        isEditable={false}
        onSelect={() => {}}
      />
    ),
    []
  );

  const renderTextItem = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      const tb = context.item as unknown as SpreadTextbox;
      const result = getTextboxContentForLanguage(
        tb as unknown as Record<string, unknown>,
        langCode
      );
      if (!result) return null;
      const { content } = result;
      return (
        <EditableTextbox
          textboxContent={content}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={false}
          isSelectable={false}
          isEditable={false}
          onSelect={() => {}}
          onTextChange={() => {}}
          onEditingChange={() => {}}
        />
      );
    },
    [langCode]
  );

  const renderShapeItem = useCallback(
    (context: ShapeItemContext<BaseSpread>) => (
      <EditableShape
        shape={context.item}
        index={context.itemIndex}
        zIndex={context.zIndex}
        isSelected={false}
        isEditable={false}
        onSelect={() => {}}
      />
    ),
    []
  );

  const renderVideoItem = useCallback(
    (context: VideoItemContext<BaseSpread>) => (
      <EditableVideo
        video={context.item}
        index={context.itemIndex}
        zIndex={context.zIndex}
        isSelected={false}
        isEditable={false}
        isThumbnail={context.isThumbnail}
        onSelect={() => {}}
      />
    ),
    []
  );

  const renderAudioItem = useCallback(
    (context: AudioItemContext<BaseSpread>) => (
      <EditableAudio
        audio={context.item}
        index={context.itemIndex}
        zIndex={context.zIndex}
        isSelected={false}
        isEditable={false}
        onSelect={() => {}}
      />
    ),
    []
  );

  // Raw items: illustration layer — also read-only
  const renderRawImage = useCallback(
    (context: ImageItemContext<BaseSpread>) => (
      <EditableImage
        image={context.item}
        index={context.itemIndex}
        zIndex={context.zIndex}
        isSelected={false}
        isSelectable={false}
        isEditable={false}
        onSelect={() => {}}
      />
    ),
    []
  );

  const renderRawTextbox = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      const tb = context.item as unknown as SpreadTextbox;
      const result = getTextboxContentForLanguage(
        tb as unknown as Record<string, unknown>,
        langCode
      );
      if (!result) return null;
      const { content } = result;
      return (
        <EditableTextbox
          textboxContent={content}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={false}
          isSelectable={false}
          isEditable={false}
          onSelect={() => {}}
          onTextChange={() => {}}
          onEditingChange={() => {}}
        />
      );
    },
    [langCode]
  );

  return (
    // key={snapshot.id} forces remount on version switch — clears internal CanvasSpreadView state
    <CanvasSpreadView
      key={snapshot.id}
      spreads={(snapshot.illustration?.spreads ?? []) as BaseSpread[]}
      selectedSpreadId={selectedSpreadId}
      viewMode="edit"
      zoomLevel={ZOOM.DEFAULT}
      columnsPerRow={COLUMNS.DEFAULT}
      onSpreadSelect={setSelectedSpreadId}
      onViewModeChange={() => {}}
      onZoomChange={() => {}}
      onColumnsChange={() => {}}
      renderItems={[
        "raw_image",
        "raw_textbox",
        "image",
        "textbox",
        "shape",
        "video",
        "audio",
      ]}
      renderImageItem={renderImageItem}
      renderTextItem={renderTextItem}
      renderShapeItem={renderShapeItem}
      renderVideoItem={renderVideoItem}
      renderAudioItem={renderAudioItem}
      renderRawImage={renderRawImage}
      renderRawTextbox={renderRawTextbox}
      isEditable={false}
      preventEditRawItem={true}
      canAddSpread={false}
      canReorderSpread={false}
      canDeleteSpread={false}
      canResizeItem={false}
      canDragItem={false}
      showViewToggle={false}
    />
  );
}

export default HistoryMainView;
