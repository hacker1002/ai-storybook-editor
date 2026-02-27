// features/demo-playable-spread-view/demo-playable-spread-view.tsx
"use client";

import { useState, useCallback } from "react";
import {
  PlayableSpreadView,
  type OperationMode,
  type PlayableSpread,
  type Animation,
  type AddAnimationParams,
  type AssetSwapParams,
} from "@/components/playable-spread-view";
import {
  createPlayableSpreads,
  type CreatePlayableSpreadOptions,
} from "./__mocks__/playable-spread-factory";
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

// === Mock Options ===
interface MockOptions {
  spreadCount: number;
  textboxCount: number;
  objectCount: number;
  language: "en_US" | "vi_VN";
  isDPS: boolean;
}

const DEFAULT_MOCK_OPTIONS: MockOptions = {
  spreadCount: 8,
  textboxCount: 1,
  objectCount: 3,
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
  const generateSpreads = useCallback(
    (opts: MockOptions): PlayableSpread[] => {
      const factoryOpts: CreatePlayableSpreadOptions = {
        spreadCount: opts.spreadCount,
        textboxCount: opts.textboxCount,
        objectCount: opts.objectCount,
        language: opts.language,
        isDPS: opts.isDPS,
      };
      return createPlayableSpreads(factoryOpts);
    },
    []
  );

  // Spreads state
  const [spreads, setSpreads] = useState<PlayableSpread[]>(() =>
    generateSpreads(DEFAULT_MOCK_OPTIONS)
  );

  // Selected spread tracking
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    () => spreads[0]?.id ?? null
  );
  const selectedSpread =
    spreads.find((s) => s.id === selectedSpreadId) ?? null;

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
  const handleAddAnimation = useCallback((params: AddAnimationParams) => {
    console.log("Add animation:", params);

    if (!params.targetId || !params.targetType) {
      console.warn("Missing target info for animation");
      return;
    }

    // Map AnimationMediaType to Animation type ('sound' → 'audio')
    const animationType: Animation["type"] =
      params.type === "sound" ? "audio" : params.type;

    setSpreads((prevSpreads) =>
      prevSpreads.map((spread) => {
        if (spread.id !== params.spreadId) return spread;

        const existingAnimations = spread.animations ?? [];
        const newAnimation: Animation = {
          order: existingAnimations.length + 1,
          type: animationType,
          target: {
            id: params.targetId!,
            type: params.targetType!,
          },
          trigger_type: "on_click",
          effect: {
            type: 1, // Default effect type
            duration: 1000,
          },
        };

        return {
          ...spread,
          animations: [...existingAnimations, newAnimation],
        };
      })
    );
  }, []);

  const handleAssetSwap = useCallback(
    async (params: AssetSwapParams): Promise<void> => {
      console.log("Asset swap:", params);
    },
    []
  );

  const handleTextChange = useCallback((textboxId: string, newText: string) => {
    console.log("Text change:", textboxId, newText);
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
              <SelectItem value="animation-editor">Animation Editor</SelectItem>
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

                    {/* Object count */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Objects: {mockOptions.objectCount}
                      </Label>
                      <Slider
                        value={[mockOptions.objectCount]}
                        onValueChange={([v]) =>
                          updateMockOption("objectCount", v)
                        }
                        min={0}
                        max={5}
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
        {/* PlayableSpreadView Component */}
        <div className="flex-1 overflow-hidden">
          <PlayableSpreadView
            mode={operationMode}
            spreads={spreads}
            onAddAnimation={handleAddAnimation}
            onAssetSwap={handleAssetSwap}
            onTextChange={handleTextChange}
            onSpreadSelect={handleSpreadSelect}
          />
        </div>

        {/* JSON Data Panel */}
        <div className="w-80 border-l bg-muted/30 flex flex-col">
          <div className="p-3 border-b bg-background">
            <h3 className="text-sm font-medium">Spread Data</h3>
            <p className="text-xs text-muted-foreground">
              {selectedSpread ? `ID: ${selectedSpread.id}` : "Select a spread"}
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

export default DemoPlayableSpreadView;
