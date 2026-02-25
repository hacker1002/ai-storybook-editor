// features/demo-canvas-spread-view/demo-canvas-spread-view.tsx
"use client";

import { useState, useCallback } from "react";
import {
  CanvasSpreadView,
  EditableImage,
  EditableTextbox,
  type BaseSpread,
  type SpreadImage,
  type SpreadTextbox,
  type ImageItemContext,
  type TextItemContext,
  type ImageToolbarContext,
  type TextToolbarContext,
  type PageToolbarContext,
  type Fill,
  type Outline,
  type Typography,
  type SpreadType,
} from "@/components/canvas-spread-view";
import { DemoImageToolbar } from "./demo-image-toolbar";
import { DemoTextToolbar } from "./demo-text-toolbar";
import { DemoPageToolbar } from "./demo-page-toolbar";
import {
  createMockSnapshot,
  type CreateSnapshotOptions,
} from "./__mocks__/snapshot-factory";
import { createMockSpread } from "./__mocks__/spread-factory";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Settings, RefreshCw } from "lucide-react";

// === Mock Data Options ===
interface MockOptions {
  spreadCount: number;
  imageCount: number;
  textboxCount: number;
  withGeneratedImages: boolean;
  isDPS: boolean;
  language: "en_US" | "vi_VN";
}

const DEFAULT_MOCK_OPTIONS: MockOptions = {
  spreadCount: 8,
  imageCount: 1,
  textboxCount: 1,
  withGeneratedImages: true,
  isDPS: true,
  language: "en_US",
};

// === Feature Flags ===
interface FeatureFlags {
  isEditable: boolean;
  canAddSpread: boolean;
  canReorderSpread: boolean;
  canDeleteSpread: boolean;
  canAddItem: boolean;
  canDeleteItem: boolean;
  canResizeItem: boolean;
  canDragItem: boolean;
  renderImageToolbar: boolean;
  renderTextToolbar: boolean;
  renderPageToolbar: boolean;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  isEditable: true,
  canAddSpread: true,
  canReorderSpread: true,
  canDeleteSpread: true,
  canAddItem: false,
  canDeleteItem: true,
  canResizeItem: true,
  canDragItem: true,
  renderImageToolbar: true,
  renderTextToolbar: true,
  renderPageToolbar: true,
};

export function DemoCanvasSpreadView() {
  // Mock options state
  const [mockOptions, setMockOptions] =
    useState<MockOptions>(DEFAULT_MOCK_OPTIONS);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(
    DEFAULT_FEATURE_FLAGS
  );

  // Generate spreads from options
  const generateSpreads = useCallback((opts: MockOptions): BaseSpread[] => {
    const snapshotOpts: CreateSnapshotOptions = {
      spreadCount: opts.spreadCount,
      imageCount: opts.imageCount,
      textboxCount: opts.textboxCount,
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

  // Regenerate mock data with current options
  const handleRegenerate = useCallback(() => {
    const newSpreads = generateSpreads(mockOptions);
    setSpreads(newSpreads);
    setSelectedSpreadId(newSpreads[0]?.id ?? null);
  }, [mockOptions, generateSpreads]);

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

  const handleSpreadAdd = useCallback((type: SpreadType) => {
    const newSpread = createMockSpread({
      spreadIndex: spreads.length,
      isDPS: type === 'double',
      imageCount: 0,
      textboxCount: 0,
    });
    setSpreads((prev) => [...prev, newSpread]);
    setSelectedSpreadId(newSpread.id);
  }, [spreads.length]);

  const handleSpreadDelete = useCallback((spreadId: string) => {
    setSpreads((prev) => {
      const filtered = prev.filter((s) => s.id !== spreadId);
      return renumberPages(filtered);
    });
  }, [renumberPages]);

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
    (spreadId: string, pageIndex: number, updates: Partial<BaseSpread["pages"][number]>) => {
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
          const langKey = Object.keys(clonedItem).find(
            (k) => k !== "id" && k !== "title"
          ) as keyof SpreadTextbox | undefined;

          if (langKey && langKey !== "id" && langKey !== "title") {
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
          const langKey = Object.keys(item).find(
            (k) => k !== "id" && k !== "title"
          ) as keyof SpreadTextbox | undefined;
          if (langKey && langKey !== "id" && langKey !== "title") {
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
          const langKey = Object.keys(item).find(
            (k) => k !== "id" && k !== "title"
          ) as keyof SpreadTextbox | undefined;
          if (langKey && langKey !== "id" && langKey !== "title") {
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
    // Get text from first language key
    const langKey = Object.keys(context.item).find(
      (k) => k !== "id" && k !== "title"
    );

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
            onClone: () => handleCloneImage(context.spreadId, context.itemIndex),
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
            onClone: () => handleCloneTextbox(context.spreadId, context.itemIndex),
            onUpdateBackground: (bg) =>
              handleUpdateTextboxBackground(context.spreadId, context.itemIndex, bg),
            onUpdateOutline: (outline) =>
              handleUpdateTextboxOutline(context.spreadId, context.itemIndex, outline),
          }}
        />
      );
    },
    [handleCloneTextbox, handleUpdateTextboxBackground, handleUpdateTextboxOutline]
  );

  const renderPageToolbar = useCallback(
    (context: PageToolbarContext<BaseSpread>) => {
      return <DemoPageToolbar context={context} />;
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
              {mockOptions.textboxCount} text
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Demo Settings</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </Button>
                </div>

                <Separator />

                {/* Mock Data Options */}
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">
                    MOCK DATA
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Spreads: {mockOptions.spreadCount}
                      </Label>
                      <Slider
                        value={[mockOptions.spreadCount]}
                        onValueChange={([v]) =>
                          updateMockOption("spreadCount", v)
                        }
                        min={1}
                        max={20}
                        step={1}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Images: {mockOptions.imageCount}
                      </Label>
                      <Slider
                        value={[mockOptions.imageCount]}
                        onValueChange={([v]) =>
                          updateMockOption("imageCount", v)
                        }
                        min={0}
                        max={5}
                        step={1}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Textboxes: {mockOptions.textboxCount}
                      </Label>
                      <Slider
                        value={[mockOptions.textboxCount]}
                        onValueChange={([v]) =>
                          updateMockOption("textboxCount", v)
                        }
                        min={0}
                        max={5}
                        step={1}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Language</Label>
                      <Select
                        value={mockOptions.language}
                        onValueChange={(v) =>
                          updateMockOption("language", v as "en_US" | "vi_VN")
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en_US">English</SelectItem>
                          <SelectItem value="vi_VN">Vietnamese</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        id="isDPS"
                        checked={mockOptions.isDPS}
                        onCheckedChange={(v) => updateMockOption("isDPS", v)}
                        className="scale-75"
                      />
                      <Label htmlFor="isDPS" className="text-xs">
                        DPS
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        id="withImages"
                        checked={mockOptions.withGeneratedImages}
                        onCheckedChange={(v) =>
                          updateMockOption("withGeneratedImages", v)
                        }
                        className="scale-75"
                      />
                      <Label htmlFor="withImages" className="text-xs">
                        Images
                      </Label>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Feature Flags */}
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">
                    FEATURE FLAGS
                  </Label>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {(
                      Object.keys(featureFlags) as Array<keyof FeatureFlags>
                    ).map((key) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <Switch
                          id={key}
                          checked={featureFlags[key]}
                          onCheckedChange={(v) => updateFeatureFlag(key, v)}
                          className="scale-75"
                        />
                        <Label htmlFor={key} className="text-xs">
                          {key}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex">
          {/* Spread View */}
          <div className="flex-1 overflow-hidden">
            <CanvasSpreadView
              spreads={spreads}
              renderItems={["image", "text"]}
              renderImageItem={renderImageItem}
              renderTextItem={renderTextItem}
              renderImageToolbar={
                featureFlags.renderImageToolbar ? renderImageToolbar : undefined
              }
              renderTextToolbar={
                featureFlags.renderTextToolbar ? renderTextToolbar : undefined
              }
              renderPageToolbar={
                featureFlags.renderPageToolbar ? renderPageToolbar : undefined
              }
              onSpreadSelect={handleSpreadSelect}
              onSpreadReorder={handleSpreadReorder}
              onSpreadAdd={handleSpreadAdd}
              onDeleteSpread={handleSpreadDelete}
              onUpdateSpread={handleUpdateSpread}
              onUpdateImage={handleUpdateImage}
              onUpdateTextbox={handleUpdateTextbox}
              onUpdatePage={handleUpdatePage}
              onDeleteImage={handleDeleteImage}
              onDeleteTextbox={handleDeleteTextbox}
              isEditable={featureFlags.isEditable}
              canAddSpread={featureFlags.canAddSpread}
              canReorderSpread={featureFlags.canReorderSpread}
              canDeleteSpread={featureFlags.canDeleteSpread}
              canAddItem={featureFlags.canAddItem}
              canDeleteItem={featureFlags.canDeleteItem}
              canResizeItem={featureFlags.canResizeItem}
              canDragItem={featureFlags.canDragItem}
              initialViewMode="edit"
            />
          </div>

          {/* JSON Data Panel */}
          <div className="w-80 border-l bg-muted/30 flex flex-col">
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
    </TooltipProvider>
  );
}

export default DemoCanvasSpreadView;
