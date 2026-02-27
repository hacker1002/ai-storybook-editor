// features/demo-canvas-spread-view/demo-canvas-spread-view.tsx
"use client";

import { useState, useCallback } from "react";
import {
  CanvasSpreadView,
  EditableImage,
  EditableTextbox,
  EditableObject,
  type BaseSpread,
  type SpreadImage,
  type SpreadTextbox,
  type SpreadObject,
  type ImageItemContext,
  type TextItemContext,
  type ObjectItemContext,
  type ImageToolbarContext,
  type TextToolbarContext,
  type PageToolbarContext,
  type ObjectToolbarContext,
  type SpreadType,
  type ItemType,
  type SpreadItemActionUnion,
} from "@/components/canvas-spread-view";
import { DemoImageToolbar } from "./demo-image-toolbar";
import { DemoTextToolbar } from "./demo-text-toolbar";
import { DemoPageToolbar } from "./demo-page-toolbar";
import { DemoObjectToolbar } from "./demo-object-toolbar";
import { ImportSpreadsDialog } from "./import-spreads-dialog";
import {
  DemoSettingsPopover,
  type MockOptions,
  type FeatureFlags,
  type ItemFlags,
} from "./demo-settings-popover";
import {
  createMockSnapshot,
  type CreateSnapshotOptions,
} from "./__mocks__/snapshot-factory";
import { createMockSpread } from "./__mocks__/spread-factory";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { getFirstTextboxKey } from "@/components/shared";
import type { SpreadTextboxContent } from "@/components/shared/types";

// === Default Values ===
const DEFAULT_MOCK_OPTIONS: MockOptions = {
  spreadCount: 8,
  imageCount: 2,
  textboxCount: 1,
  objectCount: 3,
  withGeneratedImages: true,
  isDPS: true,
  language: "en_US",
};

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  isEditable: true,
  canAddSpread: true,
  canReorderSpread: true,
  canDeleteSpread: true,
  canAddItem: true,
  canDeleteItem: true,
  canResizeItem: true,
  canDragItem: true,
  renderImageToolbar: true,
  renderTextToolbar: true,
  renderPageToolbar: true,
  renderObjectToolbar: true,
};

const DEFAULT_ITEM_FLAGS: ItemFlags = {
  showImages: true,
  showTexts: true,
  showObjects: false,
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
      objectCount: opts.objectCount,
      withGeneratedImages: opts.withGeneratedImages,
      isDPS: opts.isDPS,
      language: opts.language,
    };
    return createMockSnapshot(snapshotOpts).spreads;
  }, []);

  // Mutable spreads state (for demo mutations)
  const [spreads, setSpreads] = useState<BaseSpread[]>(() =>
    generateSpreads(DEFAULT_MOCK_OPTIONS)
  );

  // Selected spread tracking - auto-select first spread
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    () => spreads[0]?.id ?? null
  );
  const selectedSpread = spreads.find((s) => s.id === selectedSpreadId) ?? null;

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Regenerate mock data with current options
  const handleRegenerate = useCallback(() => {
    const newSpreads = generateSpreads(mockOptions);
    setSpreads(newSpreads);
    setSelectedSpreadId(newSpreads[0]?.id ?? null);
  }, [mockOptions, generateSpreads]);

  // Import spreads from JSON
  const handleImportSpreads = useCallback((importedSpreads: BaseSpread[]) => {
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
            case "image":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  images: s.images.map((img) =>
                    img.id === itemId ? { ...img, ...data } : img
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  images: s.images.filter((img) => img.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return { ...s, images: [...s.images, data as SpreadImage] };
              }
              break;

            case "text":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  textboxes: s.textboxes.map((t) =>
                    t.id === itemId ? { ...t, ...data } : t
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  textboxes: s.textboxes.filter((t) => t.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return {
                  ...s,
                  textboxes: [...s.textboxes, data as SpreadTextbox],
                };
              }
              break;

            case "object":
              if (action === "update" && itemId !== null && data) {
                return {
                  ...s,
                  objects: (s.objects || []).map((o) =>
                    o.id === itemId ? { ...o, ...data } : o
                  ),
                };
              }
              if (action === "delete" && itemId !== null) {
                return {
                  ...s,
                  objects: (s.objects || []).filter((o) => o.id !== itemId),
                };
              }
              if (action === "add" && data) {
                return {
                  ...s,
                  objects: [...(s.objects || []), data as SpreadObject],
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
          const item = s.images[imageIndex];
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
          return { ...s, images: [...s.images, clonedItem] };
        })
      );
    },
    []
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
          }}
        />
      );
    },
    [handleCloneImage]
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
        text={langContent.text}
        geometry={langContent.geometry}
        typography={langContent.typography}
        fill={langContent.fill}
        outline={langContent.outline}
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

  // Render object
  const renderObjectItem = useCallback(
    (context: ObjectItemContext<BaseSpread>) => (
      <EditableObject
        object={context.item}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isEditable={context.isSpreadSelected}
        onSelect={context.onSelect}
        onUpdate={context.onUpdate}
        onDelete={context.onDelete}
      />
    ),
    []
  );

  const renderObjectToolbar = useCallback(
    (context: ObjectToolbarContext<BaseSpread>) => {
      return (
        <DemoObjectToolbar
          context={{
            ...context,
            onRotate: () => {
              // Rotate 90°: swap width and height
              const geo = context.item.geometry;
              context.onUpdate({
                geometry: { ...geo, w: geo.h, h: geo.w },
              });
            },
          }}
        />
      );
    },
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
              {mockOptions.textboxCount} text • {mockOptions.objectCount} obj
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
              spreads={spreads}
              renderItems={
                [
                  itemFlags.showImages && "image",
                  itemFlags.showTexts && "text",
                  itemFlags.showObjects && "object",
                ].filter(Boolean) as ItemType[]
              }
              renderImageItem={
                itemFlags.showImages ? renderImageItem : undefined
              }
              renderTextItem={itemFlags.showTexts ? renderTextItem : undefined}
              renderObjectItem={
                itemFlags.showObjects ? renderObjectItem : undefined
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
              renderObjectToolbar={
                featureFlags.renderObjectToolbar && itemFlags.showObjects
                  ? renderObjectToolbar
                  : undefined
              }
              onSpreadSelect={handleSpreadSelect}
              onSpreadReorder={handleSpreadReorder}
              onSpreadAdd={handleSpreadAdd}
              onDeleteSpread={handleSpreadDelete}
              onUpdateSpreadItem={handleSpreadItemAction}
              isEditable={featureFlags.isEditable}
              canAddSpread={featureFlags.canAddSpread}
              canReorderSpread={featureFlags.canReorderSpread}
              canDeleteSpread={featureFlags.canDeleteSpread}
              canAddItem={featureFlags.canAddItem}
              canDeleteItem={featureFlags.canDeleteItem}
              canResizeItem={featureFlags.canResizeItem}
              canDragItem={featureFlags.canDragItem}
              initialViewMode="edit"
              initialSelectedId={spreads[0].id}
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
    </TooltipProvider>
  );
}

export default DemoCanvasSpreadView;
