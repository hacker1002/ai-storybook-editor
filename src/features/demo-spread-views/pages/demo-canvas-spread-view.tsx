// features/demo-spread-views/pages/demo-canvas-spread-view.tsx
"use client";

import { useState, useCallback, useMemo } from "react";
import {
  CanvasSpreadView,
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAudio,
  type BaseSpread,
  type SpreadImage,
  type SpreadTextbox,
  type SpreadVideo,
  type SpreadAudio,
  type ImageItemContext,
  type TextItemContext,
  type ShapeItemContext,
  type VideoItemContext,
  type AudioItemContext,
  type ImageToolbarContext,
  type TextToolbarContext,
  type PageToolbarContext,
  type ShapeToolbarContext,
  type SpreadType,
  type ItemType,
  type SpreadItemActionUnion,
} from "@/features/editor/components/canvas-spread-view";
import {
  DemoImageToolbar,
  DemoTextToolbar,
  DemoPageToolbar,
  DemoShapeToolbar,
  DemoSettingsPopover,
  ImportSpreadsDialog,
  type MockOptions,
  type FeatureFlags,
  type ItemFlags,
} from "../components/canvas";
import { GenerateImageModal } from "@/features/editor/components/canvas-spread-view";
import {
  createMockSnapshot,
  type CreateSnapshotOptions,
} from "../__mocks__/snapshot-factory";
import { createMockSpread } from "../__mocks__/spread-factory";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { getFirstTextboxKey } from "@/features/editor/utils/textbox-helpers";
import type { SpreadTextboxContent } from "@/types/spread-types";
import { createLogger } from "@/utils/logger";
import { ZOOM, COLUMNS } from "@/constants/spread-constants";
import type { ViewMode } from "@/types/canvas-types";

const log = createLogger("Demo", "DemoCanvasSpreadView");

// === Default Values ===
const DEFAULT_MOCK_OPTIONS: MockOptions = {
  spreadCount: 8,
  imageCount: 2,
  textboxCount: 1,
  shapeCount: 2,
  videoCount: 0,
  audioCount: 0,
  withGeneratedImages: true,
  isDPS: true,
  language: "en_US",
};

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  isEditable: true,
  canAddSpread: true,
  canReorderSpread: true,
  canDeleteSpread: true,
  canResizeItem: true,
  canDragItem: true,
  renderImageToolbar: true,
  renderTextToolbar: true,
  renderPageToolbar: true,
  renderShapeToolbar: true,
};

const DEFAULT_ITEM_FLAGS: ItemFlags = {
  showImages: true,
  showTexts: true,
  showShapes: true,
  showVideos: false,
  showAudios: false,
};

export function DemoCanvasSpreadView() {
  // Mock options state
  const [mockOptions, setMockOptions] =
    useState<MockOptions>(DEFAULT_MOCK_OPTIONS);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(
    DEFAULT_FEATURE_FLAGS
  );
  const [itemFlags, setItemFlags] = useState<ItemFlags>(DEFAULT_ITEM_FLAGS);

  // Generate spreads from options
  const generateSpreads = useCallback((opts: MockOptions): BaseSpread[] => {
    const snapshotOpts: CreateSnapshotOptions = {
      spreadCount: opts.spreadCount,
      imageCount: opts.imageCount,
      textboxCount: opts.textboxCount,
      shapeCount: opts.shapeCount,
      videoCount: opts.videoCount,
      audioCount: opts.audioCount,
      withGeneratedImages: opts.withGeneratedImages,
      isDPS: opts.isDPS,
      language: opts.language,
    };
    return createMockSnapshot(snapshotOpts).spreads;
  }, []);

  // Mutable spreads state (for demo mutations) — raw_images/raw_textboxes hold illustration layers
  const [spreads, setSpreads] = useState<BaseSpread[]>(() =>
    generateSpreads(DEFAULT_MOCK_OPTIONS)
  );

  // Derived spreads for CanvasSpreadView: map raw layers → images/textboxes so the canvas renders them
  const canvasSpreads = useMemo(
    () =>
      spreads.map((s) => ({
        ...s,
        images: s.raw_images ?? [],
        textboxes: s.raw_textboxes ?? [],
      })),
    [spreads]
  );

  // Selected spread tracking - auto-select first spread
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    () => spreads[0]?.id ?? null
  );
  const selectedSpread = spreads.find((s) => s.id === selectedSpreadId) ?? null;

  // View state for controlled CanvasSpreadView
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM.DEFAULT);
  const [columnsPerRow, setColumnsPerRow] = useState<number>(COLUMNS.DEFAULT);

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Generate image modal state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateModalImage, setGenerateModalImage] =
    useState<SpreadImage | null>(null);

  // Regenerate mock data with current options
  const handleRegenerate = useCallback(() => {
    const newSpreads = generateSpreads(mockOptions);
    setSpreads(newSpreads);
    setSelectedSpreadId(newSpreads[0]?.id ?? null);
  }, [mockOptions, generateSpreads]);

  // Import spreads from JSON
  const handleImportSpreads = useCallback((importedSpreads: BaseSpread[]) => {
    log.info("handleImportSpreads", "Importing spreads", { count: importedSpreads.length });
    setSpreads(importedSpreads);
    setSelectedSpreadId(importedSpreads[0]?.id ?? null);
  }, []);

  // Option updaters
  const updateMockOption = useCallback(
    <K extends keyof MockOptions>(key: K, value: MockOptions[K]) => {
      setMockOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateFeatureFlag = useCallback(
    <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) => {
      setFeatureFlags((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateItemFlag = useCallback(
    <K extends keyof ItemFlags>(key: K, value: ItemFlags[K]) => {
      setItemFlags((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // === Spread-level handlers ===

  // Helper: recalculate page numbers based on spread position
  const renumberPages = useCallback((spreads: BaseSpread[]): BaseSpread[] => {
    return spreads.map((spread, idx) => {
      const leftPageNum = idx * 2;
      const rightPageNum = leftPageNum + 1;
      const isDPS = spread.pages.length === 1;

      const newPages = isDPS
        ? [{ ...spread.pages[0], number: `${leftPageNum}-${rightPageNum}` }]
        : [
            { ...spread.pages[0], number: leftPageNum },
            { ...spread.pages[1], number: rightPageNum },
          ];

      return { ...spread, pages: newPages };
    });
  }, []);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    setSelectedSpreadId(spreadId);
  }, []);

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setSpreads((prev) => {
        const newSpreads = [...prev];
        const [removed] = newSpreads.splice(fromIndex, 1);
        newSpreads.splice(toIndex, 0, removed);
        return renumberPages(newSpreads);
      });
    },
    [renumberPages]
  );

  const handleSpreadAdd = useCallback(
    (type: SpreadType) => {
      log.info("handleSpreadAdd", "Adding new spread", { type });
      const newSpread = createMockSpread({
        spreadIndex: spreads.length,
        isDPS: type === "double",
        imageCount: 0,
        textboxCount: 0,
      });
      setSpreads((prev) => [...prev, newSpread]);
      setSelectedSpreadId(newSpread.id);
    },
    [spreads.length]
  );

  const handleSpreadDelete = useCallback(
    (spreadId: string) => {
      setSpreads((prev) => {
        const filtered = prev.filter((s) => s.id !== spreadId);
        return renumberPages(filtered);
      });
    },
    [renumberPages]
  );

  // === Unified Item Handler ===
  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId, itemType, action, itemId, data } = params;

      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;

          switch (itemType) {
            // Illustration context: mutations target raw_images / raw_textboxes
            case "image":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  raw_images: (s.raw_images ?? []).map((img) =>
                    img.id === itemId ? { ...img, ...data } : img
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  raw_images: (s.raw_images ?? []).filter((img) => img.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return { ...s, raw_images: [...(s.raw_images ?? []), data as SpreadImage] };
              }
              break;

            case "textbox":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  raw_textboxes: (s.raw_textboxes ?? []).map((t) =>
                    t.id === itemId ? { ...t, ...data } : t
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  raw_textboxes: (s.raw_textboxes ?? []).filter((t) => t.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return {
                  ...s,
                  raw_textboxes: [...(s.raw_textboxes ?? []), data as SpreadTextbox],
                };
              }
              break;

            // Shapes are playable-only (no raw_shapes) — illustration context skips shape mutations

            case "video":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  videos: (s.videos || []).map((v) =>
                    v.id === itemId ? { ...v, ...data } : v
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  videos: (s.videos || []).filter((v) => v.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return {
                  ...s,
                  videos: [...(s.videos || []), data as SpreadVideo],
                };
              }
              break;

            case "audio":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  audios: (s.audios || []).map((a) =>
                    a.id === itemId ? { ...a, ...data } : a
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  audios: (s.audios || []).filter((a) => a.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return {
                  ...s,
                  audios: [...(s.audios || []), data as SpreadAudio],
                };
              }
              break;

            case "page":
              if (action === "update" && typeof itemId === "number" && data) {
                const newPages = [...s.pages];
                newPages[itemId] = { ...newPages[itemId], ...data };
                return { ...s, pages: newPages };
              }
              break;
          }
          return s;
        })
      );
    },
    []
  );

  const handleCloneImage = useCallback(
    (spreadId: string, imageIndex: number) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const rawImages = s.raw_images ?? [];
          const item = rawImages[imageIndex];
          if (!item) return s;
          const clonedItem = {
            ...item,
            id: `img-${Date.now()}`,
            geometry: {
              ...item.geometry,
              x: Math.min(100, item.geometry.x + 10),
              y: Math.min(100, item.geometry.y + 10),
            },
          };
          return { ...s, raw_images: [...rawImages, clonedItem] };
        })
      );
    },
    []
  );

  const openGenerateModal = useCallback(
    (image: SpreadImage) => {
      setGenerateModalImage(image);
      setGenerateModalOpen(true);
    },
    [setGenerateModalImage, setGenerateModalOpen]
  );

  const handleGenerateImageUpdate = useCallback(
    (imageId: string, updates: Partial<SpreadImage>) => {
      if (!selectedSpreadId) return;
      handleSpreadItemAction({
        spreadId: selectedSpreadId,
        itemType: "image",
        action: "update",
        itemId: imageId,
        data: updates,
      });
    },
    [selectedSpreadId, handleSpreadItemAction]
  );

  // === Render Props ===
  const renderImageItem = useCallback(
    (context: ImageItemContext<BaseSpread>) => (
      <EditableImage
        image={context.item}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isEditable={context.isSpreadSelected}
        onSelect={context.onSelect}
        onArtNoteChange={context.onArtNoteChange}
        onEditingChange={context.onEditingChange}
      />
    ),
    []
  );

  const renderImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => {
      return (
        <DemoImageToolbar
          context={{
            ...context,
            onClone: () =>
              handleCloneImage(context.spreadId, context.itemIndex),
            onGenerateImage: () => openGenerateModal(context.item),
          }}
        />
      );
    },
    [handleCloneImage, openGenerateModal]
  );

  // Render Text
  const renderTextItem = useCallback((context: TextItemContext<BaseSpread>) => {
    const langKey = getFirstTextboxKey(context.item);

    const langContent = langKey
      ? (context.item[langKey] as SpreadTextboxContent)
      : null;

    if (!langContent) return null;

    return (
      <EditableTextbox
        textboxContent={langContent}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isSelectable={context.isSpreadSelected}
        isEditable={context.isSpreadSelected}
        onSelect={context.onSelect}
        onTextChange={context.onTextChange}
        onEditingChange={context.onEditingChange ?? (() => {})}
      />
    );
  }, []);

  const renderTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <DemoTextToolbar context={context} />
    ),
    []
  );

  // Render page toolbar
  const renderPageToolbar = useCallback(
    (context: PageToolbarContext<BaseSpread>) => {
      return <DemoPageToolbar context={context} />;
    },
    []
  );

  // Render shape
  const renderShapeItem = useCallback(
    (context: ShapeItemContext<BaseSpread>) => (
      <EditableShape
        shape={context.item}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isEditable={context.isSpreadSelected}
        onSelect={context.onSelect}
      />
    ),
    []
  );

  const renderShapeToolbar = useCallback(
    (context: ShapeToolbarContext<BaseSpread>) => (
      <DemoShapeToolbar context={context} />
    ),
    []
  );

  // Render video
  const renderVideoItem = useCallback(
    (context: VideoItemContext<BaseSpread>) => (
      <EditableVideo
        video={context.item}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isEditable={context.isSpreadSelected}
        isThumbnail={context.isThumbnail}
        onSelect={context.onSelect}
      />
    ),
    []
  );

  // Render audio
  const renderAudioItem = useCallback(
    (context: AudioItemContext<BaseSpread>) => (
      <EditableAudio
        audio={context.item}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isEditable={context.isSpreadSelected}
        onSelect={context.onSelect}
      />
    ),
    []
  );

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="p-4 border-b bg-background flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">CanvasSpreadView Demo</h1>
            <p className="text-sm text-muted-foreground">
              {spreads.length} spreads • {mockOptions.imageCount} img •{" "}
              {mockOptions.textboxCount} text • {mockOptions.shapeCount} shape
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportDialogOpen(true)}
              className="h-9 gap-1.5"
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <DemoSettingsPopover
              mockOptions={mockOptions}
              featureFlags={featureFlags}
              itemFlags={itemFlags}
              onMockOptionChange={updateMockOption}
              onFeatureFlagChange={updateFeatureFlag}
              onItemFlagChange={updateItemFlag}
              onRegenerate={handleRegenerate}
            />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex">
          {/* Spread View */}
          <div className="flex-1 overflow-hidden">
            <CanvasSpreadView
              spreads={canvasSpreads}
              renderItems={
                [
                  itemFlags.showImages && "image",
                  itemFlags.showTexts && "textbox",
                  itemFlags.showShapes && "shape",
                  itemFlags.showVideos && "video",
                  itemFlags.showAudios && "audio",
                ].filter(Boolean) as ItemType[]
              }
              renderImageItem={
                itemFlags.showImages ? renderImageItem : undefined
              }
              renderTextItem={itemFlags.showTexts ? renderTextItem : undefined}
              renderShapeItem={
                itemFlags.showShapes ? renderShapeItem : undefined
              }
              renderVideoItem={
                itemFlags.showVideos ? renderVideoItem : undefined
              }
              renderAudioItem={
                itemFlags.showAudios ? renderAudioItem : undefined
              }
              renderImageToolbar={
                featureFlags.renderImageToolbar && itemFlags.showImages
                  ? renderImageToolbar
                  : undefined
              }
              renderTextToolbar={
                featureFlags.renderTextToolbar && itemFlags.showTexts
                  ? renderTextToolbar
                  : undefined
              }
              renderPageToolbar={
                featureFlags.renderPageToolbar ? renderPageToolbar : undefined
              }
              renderShapeToolbar={
                featureFlags.renderShapeToolbar && itemFlags.showShapes
                  ? renderShapeToolbar
                  : undefined
              }
              selectedSpreadId={selectedSpreadId}
              viewMode={viewMode}
              zoomLevel={zoomLevel}
              columnsPerRow={columnsPerRow}
              onSpreadSelect={handleSpreadSelect}
              onViewModeChange={setViewMode}
              onZoomChange={setZoomLevel}
              onColumnsChange={setColumnsPerRow}
              onSpreadReorder={handleSpreadReorder}
              onSpreadAdd={handleSpreadAdd}
              onDeleteSpread={handleSpreadDelete}
              onUpdateSpreadItem={handleSpreadItemAction}
              isEditable={featureFlags.isEditable}
              canAddSpread={featureFlags.canAddSpread}
              canReorderSpread={featureFlags.canReorderSpread}
              canDeleteSpread={featureFlags.canDeleteSpread}
              canResizeItem={featureFlags.canResizeItem}
              canDragItem={featureFlags.canDragItem}
            />
          </div>

          {/* JSON Data Panel */}
          <div className="w-100 border-l bg-muted/30 flex flex-col">
            <div className="p-3 border-b bg-background">
              <h3 className="text-sm font-medium">Spread Data</h3>
              <p className="text-xs text-muted-foreground">
                {selectedSpread
                  ? `ID: ${selectedSpread.id}`
                  : "Select a spread"}
              </p>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {selectedSpread ? (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(selectedSpread, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Click a spread to view its data
                </p>
              )}
            </div>
          </div>
        </main>
      </div>

      <ImportSpreadsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportSpreads}
      />

      {generateModalImage && (
        <GenerateImageModal
          open={generateModalOpen}
          onOpenChange={setGenerateModalOpen}
          spreadId={selectedSpreadId ?? ""}
          image={generateModalImage}
          onUpdateImage={(updates) => {
            if (generateModalImage) {
              handleGenerateImageUpdate(generateModalImage.id, updates);
              setGenerateModalImage((prev) =>
                prev ? { ...prev, ...updates } : null
              );
            }
          }}
        />
      )}
    </TooltipProvider>
  );
}

export default DemoCanvasSpreadView;
