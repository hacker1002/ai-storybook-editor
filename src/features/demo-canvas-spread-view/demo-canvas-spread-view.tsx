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
  type Fill,
  type Outline,
  type Typography,
  type SpreadType,
  type ItemType,
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

  // === Item-level handlers ===
  const handleUpdateSpread = useCallback(
    (spreadId: string, updates: Partial<BaseSpread>) => {
      setSpreads((prev) =>
        prev.map((s) => (s.id === spreadId ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const handleUpdateImage = useCallback(
    (spreadId: string, imageIndex: number, updates: Partial<SpreadImage>) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const newImages = [...s.images];
          newImages[imageIndex] = { ...newImages[imageIndex], ...updates };
          return { ...s, images: newImages };
        })
      );
    },
    []
  );

  const handleUpdateTextbox = useCallback(
    (
      spreadId: string,
      textboxIndex: number,
      updates: Partial<SpreadTextbox>
    ) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const newTextboxes = [...s.textboxes];
          newTextboxes[textboxIndex] = {
            ...newTextboxes[textboxIndex],
            ...updates,
          };
          return { ...s, textboxes: newTextboxes };
        })
      );
    },
    []
  );

  const handleDeleteImage = useCallback(
    (spreadId: string, imageIndex: number) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          return { ...s, images: s.images.filter((_, i) => i !== imageIndex) };
        })
      );
    },
    []
  );

  const handleDeleteTextbox = useCallback(
    (spreadId: string, textboxIndex: number) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          return {
            ...s,
            textboxes: s.textboxes.filter((_, i) => i !== textboxIndex),
          };
        })
      );
    },
    []
  );

  const handleUpdatePage = useCallback(
    (
      spreadId: string,
      pageIndex: number,
      updates: Partial<BaseSpread["pages"][number]>
    ) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const newPages = [...s.pages];
          newPages[pageIndex] = { ...newPages[pageIndex], ...updates };
          return { ...s, pages: newPages };
        })
      );
    },
    []
  );

  // Object handlers (no clone for objects per validation)
  const handleUpdateObject = useCallback(
    (spreadId: string, objectIndex: number, updates: Partial<SpreadObject>) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const newObjects = [...(s.objects || [])];
          newObjects[objectIndex] = { ...newObjects[objectIndex], ...updates };
          return { ...s, objects: newObjects };
        })
      );
    },
    []
  );

  const handleDeleteObject = useCallback(
    (spreadId: string, objectIndex: number) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          return {
            ...s,
            objects: (s.objects || []).filter((_, i) => i !== objectIndex),
          };
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

  const handleCloneTextbox = useCallback(
    (spreadId: string, textboxIndex: number) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const item = s.textboxes[textboxIndex];
          if (!item) return s;

          // Deep copy using structuredClone
          const clonedItem: SpreadTextbox = structuredClone(item);

          // Generate new UUID
          clonedItem.id = crypto.randomUUID();

          // Offset geometry +5% and clamp to max 100%
          const langKey = getFirstTextboxKey(clonedItem);

          if (langKey) {
            const langData = clonedItem[langKey] as {
              text: string;
              geometry: { x: number; y: number; w: number; h: number };
            };
            // Calculate max position accounting for textbox dimensions
            const maxX = Math.max(0, 100 - langData.geometry.w);
            const maxY = Math.max(0, 100 - langData.geometry.h);

            langData.geometry.x = Math.min(maxX, langData.geometry.x + 5);
            langData.geometry.y = Math.min(maxY, langData.geometry.y + 5);
          }

          return { ...s, textboxes: [...s.textboxes, clonedItem] };
        })
      );
    },
    []
  );

  const handleUpdateTextboxBackground = useCallback(
    (spreadId: string, textboxIndex: number, bg: Partial<Fill>) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const newTextboxes = [...s.textboxes];
          const item = newTextboxes[textboxIndex];
          const langKey = getFirstTextboxKey(item);
          if (langKey) {
            const langData = item[langKey] as {
              text: string;
              geometry: { x: number; y: number; w: number; h: number };
              typography: Typography;
              fill?: Fill;
              outline?: Outline;
            };
            const updatedTextbox: SpreadTextbox = {
              ...item,
              [langKey]: {
                ...langData,
                fill: { ...langData.fill, ...bg } as Fill,
              },
            };
            newTextboxes[textboxIndex] = updatedTextbox;
          }
          return { ...s, textboxes: newTextboxes };
        })
      );
    },
    []
  );

  const handleUpdateTextboxOutline = useCallback(
    (spreadId: string, textboxIndex: number, outline: Partial<Outline>) => {
      setSpreads((prev) =>
        prev.map((s) => {
          if (s.id !== spreadId) return s;
          const newTextboxes = [...s.textboxes];
          const item = newTextboxes[textboxIndex];
          const langKey = getFirstTextboxKey(item);
          if (langKey) {
            const langData = item[langKey] as {
              text: string;
              geometry: { x: number; y: number; w: number; h: number };
              typography: Typography;
              fill?: Fill;
              outline?: Outline;
            };
            const updatedTextbox: SpreadTextbox = {
              ...item,
              [langKey]: {
                ...langData,
                outline: { ...langData.outline, ...outline } as Outline,
              },
            };
            newTextboxes[textboxIndex] = updatedTextbox;
          }
          return { ...s, textboxes: newTextboxes };
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

  const renderTextItem = useCallback((context: TextItemContext<BaseSpread>) => {
    const langKey = getFirstTextboxKey(context.item);

    interface TextboxContent {
      text: string;
      geometry: {
        x: number;
        y: number;
        w: number;
        h: number;
      };
      typography: {
        size?: number;
        weight?: number;
        style?: "normal" | "italic";
        family?: string;
        color?: string;
        lineHeight?: number;
        letterSpacing?: number;
        decoration?: "none" | "underline" | "line-through";
        textAlign?: "left" | "center" | "right";
        textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
      };
      fill?: {
        color: string;
        opacity: number;
      };
      outline?: {
        color: string;
        width: number;
        radius: number;
        type: "solid" | "dashed" | "dotted";
      };
    }

    const langContent = langKey
      ? (context.item[langKey] as TextboxContent)
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

  const renderTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => {
      return (
        <DemoTextToolbar
          context={{
            ...context,
            onClone: () =>
              handleCloneTextbox(context.spreadId, context.itemIndex),
            onUpdateBackground: (bg) =>
              handleUpdateTextboxBackground(
                context.spreadId,
                context.itemIndex,
                bg
              ),
            onUpdateOutline: (outline) =>
              handleUpdateTextboxOutline(
                context.spreadId,
                context.itemIndex,
                outline
              ),
          }}
        />
      );
    },
    [
      handleCloneTextbox,
      handleUpdateTextboxBackground,
      handleUpdateTextboxOutline,
    ]
  );

  const renderPageToolbar = useCallback(
    (context: PageToolbarContext<BaseSpread>) => {
      return <DemoPageToolbar context={context} />;
    },
    []
  );

  // Object render props
  const renderObjectItem = useCallback(
    (context: ObjectItemContext<BaseSpread>) => (
      <EditableObject
        object={context.item}
        index={context.itemIndex}
        isSelected={context.isSelected}
        isEditable={context.isSpreadSelected}
        onSelect={context.onSelect}
        onUpdate={(updates) =>
          handleUpdateObject(context.spreadId, context.itemIndex, updates)
        }
        onDelete={() => handleDeleteObject(context.spreadId, context.itemIndex)}
      />
    ),
    [handleUpdateObject, handleDeleteObject]
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
              handleUpdateObject(context.spreadId, context.itemIndex, {
                geometry: { ...geo, w: geo.h, h: geo.w },
              });
            },
          }}
        />
      );
    },
    [handleUpdateObject]
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
              onUpdateSpread={handleUpdateSpread}
              onUpdateImage={handleUpdateImage}
              onUpdateTextbox={handleUpdateTextbox}
              onUpdateObject={handleUpdateObject}
              onUpdatePage={handleUpdatePage}
              onDeleteImage={handleDeleteImage}
              onDeleteTextbox={handleDeleteTextbox}
              onDeleteObject={handleDeleteObject}
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
