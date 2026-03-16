// features/demo-spread-views/pages/demo-playable-spread-view.tsx
"use client";

import { useState, useCallback } from "react";
import {
  PlayableSpreadView,
  type OperationMode,
  type PlayableSpread,
  type ItemType,
  type AssetSwapParams,
} from "@/features/editor/components/playable-spread-view";
import { AnimationEditorSidebar, PlayerAnimationSidebar } from '@/features/editor/components/animations-creative-space';
import { useDemoAnimationState } from '../hooks/use-demo-animation-state';
import { getFirstTextboxKey } from "@/features/editor/utils/textbox-helpers";
import { createLogger } from "@/utils/logger";
import {
  createPlayableSpreads,
  type CreatePlayableSpreadOptions,
} from "../__mocks__/playable-spread-factory";
import { createMockRemixAssets } from "../__mocks__/remix-mock-factory";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { Settings, RefreshCw } from "lucide-react";

const log = createLogger('Demo', 'DemoPlayableSpreadView');

// === Mock Options ===
interface MockOptions {
  spreadCount: number;
  textboxCount: number;
  imageCount: number;
  shapeCount: number;
  videoProbability: number;
  audioCount: number;
  language: "en_US" | "vi_VN";
  isDPS: boolean;
}

const DEFAULT_MOCK_OPTIONS: MockOptions = {
  spreadCount: 8,
  textboxCount: 1,
  imageCount: 2,
  shapeCount: 1,
  videoProbability: 0.5,
  audioCount: 1,
  language: "en_US",
  isDPS: true,
};

export function DemoPlayableSpreadView() {
  // Mock options state
  const [mockOptions, setMockOptions] =
    useState<MockOptions>(DEFAULT_MOCK_OPTIONS);

  // Operation mode state
  const [operationMode, setOperationMode] =
    useState<OperationMode>("animation-editor");

  // Generate spreads from options
  const generateSpreads = useCallback((opts: MockOptions): PlayableSpread[] => {
    const factoryOpts: CreatePlayableSpreadOptions = {
      spreadCount: opts.spreadCount,
      textboxCount: opts.textboxCount,
      imageCount: opts.imageCount,
      shapeCount: opts.shapeCount,
      videoProbability: opts.videoProbability,
      audioCount: opts.audioCount,
      language: opts.language,
      isDPS: opts.isDPS,
    };
    return createPlayableSpreads(factoryOpts);
  }, []);

  // Spreads state
  const [spreads, setSpreads] = useState<PlayableSpread[]>(() =>
    generateSpreads(DEFAULT_MOCK_OPTIONS)
  );

  // Remix assets state
  const [remixAssets] = useState(() => createMockRemixAssets(3));

  // Selected spread tracking
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    () => spreads[0]?.id ?? null
  );
  const selectedSpread = spreads.find((s) => s.id === selectedSpreadId) ?? null;

  // Animation state hook (for animation-editor mode)
  const animState = useDemoAnimationState({
    spreads,
    selectedSpreadId,
    setSpreads,
  });

  // Preview state (true when player canvas is active — disables sidebar editing)
  const [isPreviewing, setIsPreviewing] = useState(false);
  const handlePreview = useCallback(() => setIsPreviewing(true), []);
  const handleStopPreview = useCallback(() => setIsPreviewing(false), []);

  // Regenerate mock data
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

  // === PlayableSpreadView Handlers ===
  const handleItemSelect = useCallback((itemType: ItemType | null, itemId: string | null) => {
    log.debug('handleItemSelect', 'item selected', { itemType, itemId });
    animState.handleItemSelect(itemType, itemId);
  }, [animState.handleItemSelect]);

  const handleAssetSwap = useCallback(
    async (params: AssetSwapParams): Promise<void> => {
      log.info('handleAssetSwap', 'asset swap started', { targetId: params.targetId, spreadId: params.spreadId });
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 3000));
      log.info('handleAssetSwap', 'asset swap completed', { targetId: params.targetId });
    },
    []
  );

  const handleTextChange = useCallback((textboxId: string, newText: string) => {
    setSpreads((prevSpreads) =>
      prevSpreads.map((spread) => {
        const textboxIndex = spread.textboxes?.findIndex((tb) => tb.id === textboxId);
        if (textboxIndex === undefined || textboxIndex === -1) return spread;

        const textbox = spread.textboxes[textboxIndex];
        const langKey = getFirstTextboxKey(textbox);
        if (!langKey) return spread;

        const langData = textbox[langKey];
        if (!langData || typeof langData !== "object") return spread;

        const updatedTextboxes = [...spread.textboxes];
        updatedTextboxes[textboxIndex] = {
          ...textbox,
          [langKey]: {
            ...langData,
            text: newText,
          },
        };

        return { ...spread, textboxes: updatedTextboxes };
      })
    );
  }, []);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    setSelectedSpreadId(spreadId);
  }, []);

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="p-4 border-b bg-background flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">PlayableSpreadView Demo</h1>
            <p className="text-sm text-muted-foreground">
              {spreads.length} spreads
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode Select */}
            <Select
              value={operationMode}
              onValueChange={(v) => setOperationMode(v as OperationMode)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="animation-editor">
                  Animation Editor
                </SelectItem>
                <SelectItem value="remix-editor">Remix Editor</SelectItem>
                <SelectItem value="player">Player</SelectItem>
              </SelectContent>
            </Select>

            {/* Settings Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="space-y-4">
                  {/* Header */}
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
                      {/* Spread count */}
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

                      {/* Textbox count */}
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

                      {/* Image count */}
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

                      {/* Shape count */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Shapes: {mockOptions.shapeCount}
                        </Label>
                        <Slider
                          value={[mockOptions.shapeCount]}
                          onValueChange={([v]) =>
                            updateMockOption("shapeCount", v)
                          }
                          min={0}
                          max={3}
                          step={1}
                        />
                      </div>

                      {/* Video probability */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Video: {Math.round(mockOptions.videoProbability * 100)}%
                        </Label>
                        <Slider
                          value={[mockOptions.videoProbability]}
                          onValueChange={([v]) =>
                            updateMockOption("videoProbability", v)
                          }
                          min={0}
                          max={1}
                          step={0.1}
                        />
                      </div>

                      {/* Audio count */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Audios: {mockOptions.audioCount}
                        </Label>
                        <Slider
                          value={[mockOptions.audioCount]}
                          onValueChange={([v]) =>
                            updateMockOption("audioCount", v)
                          }
                          min={0}
                          max={3}
                          step={1}
                        />
                      </div>

                      {/* Language */}
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
                    <div className="flex items-center gap-1.5">
                      <Switch
                        id="isDPS"
                        checked={mockOptions.isDPS}
                        onCheckedChange={(v) => updateMockOption("isDPS", v)}
                        className="scale-75"
                      />
                      <Label htmlFor="isDPS" className="text-xs">
                        DPS (Double Page Spread)
                      </Label>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex">
          {/* Animation Editor Sidebar - editor mode only, not during preview */}
          {operationMode === 'animation-editor' && !isPreviewing && (
            <AnimationEditorSidebar
              animations={animState.filteredAnimations}
              allAnimations={animState.allAnimations}
              selectedItem={animState.selectedItem}
              expandedAnimationIndex={animState.expandedAnimationIndex}
              availableEffects={animState.availableEffects}
              filterState={animState.filterState}
              objectFilterOptions={animState.objectFilterOptions}
              onFilterChange={animState.handleFilterChange}
              onExpandChange={animState.handleExpandChange}
              onAddAnimation={animState.handleAddAnimation}
              onUpdateAnimation={animState.handleUpdateAnimation}
              onDeleteAnimation={animState.handleDeleteAnimation}
              onReorderAnimation={animState.handleReorderAnimation}
              onItemSelect={handleItemSelect}
            />
          )}

          {/* Player Animation Sidebar - player mode or preview mode (read-only) */}
          {(operationMode === 'player' || isPreviewing) && (
            <PlayerAnimationSidebar
              animations={animState.allAnimations}
            />
          )}
          {/* PlayableSpreadView Component */}
          <div className="flex-1 overflow-hidden">
            <PlayableSpreadView
              mode={operationMode}
              spreads={spreads}
              assets={remixAssets}
              selectedItemId={animState.selectedItem?.id ?? null}
              selectedItemType={animState.selectedItem?.type ?? null}
              onItemSelect={handleItemSelect}
              onAssetSwap={handleAssetSwap}
              onTextChange={handleTextChange}
              onSpreadSelect={handleSpreadSelect}
              onPreview={handlePreview}
              onStopPreview={handleStopPreview}
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

            {/* Remix Assets Panel - only in remix-editor mode */}
            {operationMode === "remix-editor" && (
              <>
                <Separator />
                <div className="p-3 border-b bg-background">
                  <h3 className="text-sm font-medium">Remix Assets</h3>
                  <p className="text-xs text-muted-foreground">
                    {remixAssets.length} assets configured
                  </p>
                </div>
                <div className="flex-1 overflow-auto p-3 max-h-64">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(remixAssets, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

export default DemoPlayableSpreadView;
