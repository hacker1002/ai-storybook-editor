// features/demo-spread-views/pages/demo-playable-spread-view.tsx
"use client";

import { useState, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import {
  PlayableSpreadView,
  type PlayableSpread,
} from "@/features/editor/components/playable-spread-view";
import {
  usePlaybackActions,
  type InitializePayload,
} from "@/stores/animation-playback-store";
import { useCanvasSize } from "@/stores/editor-settings-store";
import { AVAILABLE_LANGUAGES } from "@/constants/editor-constants";
import type { RemixLanguageCode } from "@/types/editor";
import { PlayerAnimationSidebar } from '@/features/editor/components/preview-creative-space';
import { useDemoAnimationState } from '../hooks/use-demo-animation-state';
import {
  createPlayableSpreads,
  type CreatePlayableSpreadOptions,
} from "../__mocks__/playable-spread-factory";
import {
  requestVideoRender,
  type VideoRenderResult,
} from "../utils/request-video-render";
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
import { Settings, RefreshCw, Film, Loader2 } from "lucide-react";

// === Mock Options ===
interface MockOptions {
  spreadCount: number;
  textboxCount: number;
  imageCount: number;
  shapeCount: number;
  videoProbability: number;
  audioCount: number;
  language: RemixLanguageCode;
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
  const { initialize, teardown } = usePlaybackActions();
  // Design canvas the live player renders at — forwarded to the render worker so the MP4
  // scales fonts/borders identically (font px is authored relative to this width).
  const canvasSize = useCanvasSize();

  // Monotonic counter — bumped on regenerate to derive a new sessionId so
  // `initialize` re-applies edition & atomic session reset for the new fixture.
  const sessionCounterRef = useRef(0);

  // Mock options state
  const [mockOptions, setMockOptions] =
    useState<MockOptions>(DEFAULT_MOCK_OPTIONS);

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

  // Selected spread tracking
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    () => spreads[0]?.id ?? null
  );
  const selectedSpread = spreads.find((s) => s.id === selectedSpreadId) ?? null;

  // Animation state hook — feeds PlayerAnimationSidebar (read-only in player demo)
  const animState = useDemoAnimationState({
    spreads,
    selectedSpreadId,
    setSpreads,
  });

  // Regenerate mock data — bump session so playback store re-initializes atomically.
  const handleRegenerate = useCallback(() => {
    sessionCounterRef.current += 1;
    const newSpreads = generateSpreads(mockOptions);
    setSpreads(newSpreads);
    setSelectedSpreadId(newSpreads[0]?.id ?? null);
  }, [mockOptions, generateSpreads]);

  // === Playback session lifecycle ===
  // sessionId derives from sessionCounterRef so regenerate triggers `initialize`
  // with a fresh sessionId → atomic reset including edition. selectedSpreadId is
  // NOT in deps — it's navigation, not session boundary.
  const payload: InitializePayload | null = useMemo(() => {
    if (spreads.length === 0) return null;
    return {
      sessionId: `demo:${sessionCounterRef.current}`,
      language: mockOptions.language,
      edition: 'interactive',
      availableEditions: undefined,
      startSpreadId: spreads[0].id,
    };
  }, [spreads, mockOptions.language]);

  // Single lifecycle effect: initialize on mount/session-switch, teardown on
  // unmount/session-switch. Effective key is `payload.sessionId` (bumped via
  // sessionCounterRef on regenerate). Same-session re-fires absorbed by the
  // store's idempotent guard inside `initialize`.
  useLayoutEffect(() => {
    if (!payload) return;
    initialize(payload);
    return () => {
      teardown();
    };
  }, [payload, initialize, teardown]);

  // Option updaters
  const updateMockOption = useCallback(
    <K extends keyof MockOptions>(key: K, value: MockOptions[K]) => {
      setMockOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSpreadSelect = useCallback((spreadId: string) => {
    setSelectedSpreadId(spreadId);
  }, []);

  // === MP4 export (selected spread → video-worker /render) ===
  // Exports the SAME spread object that PlayableSpreadView plays live, so the
  // rendered MP4 is parity-by-construction (shared PlayerSpreadStage + timeline).
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<VideoRenderResult | null>(null);

  const handleExport = useCallback(async () => {
    if (!selectedSpread) return;
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await requestVideoRender(selectedSpread, mockOptions.language, canvasSize);
      setExportResult(result);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [selectedSpread, mockOptions.language, canvasSize]);

  // Stale export when the target spread changes (selection or regenerate).
  const exportTargetId = selectedSpread?.id ?? null;
  useLayoutEffect(() => {
    setExportResult(null);
    setExportError(null);
  }, [exportTargetId]);

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
            {/* Export selected spread → MP4 (video-worker) */}
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || !selectedSpread}
              className="h-9 gap-1.5"
              title={
                selectedSpread
                  ? `Export spread ${selectedSpread.id.slice(0, 8)} to MP4`
                  : "Select a spread to export"
              }
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              {exporting ? "Rendering…" : "Export MP4"}
            </Button>

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
                            updateMockOption("language", v as RemixLanguageCode)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_LANGUAGES.map((lang) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                {lang.name}
                              </SelectItem>
                            ))}
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
          {/* Player Animation Sidebar (read-only animation list) */}
          <PlayerAnimationSidebar animations={animState.allAnimations} />

          {/* PlayableSpreadView Component */}
          <div className="flex-1 overflow-hidden">
            <PlayableSpreadView
              spreads={spreads}
              onSpreadSelect={handleSpreadSelect}
            />
          </div>

          {/* JSON Data Panel */}
          <div className="w-80 border-l bg-muted/30 flex flex-col">
            {/* Export result — rendered MP4 should match the live playback above */}
            {(exporting || exportError || exportResult) && (
              <div className="p-3 border-b bg-background">
                <Label className="text-xs font-medium text-muted-foreground">
                  RENDERED MP4 (video-worker)
                </Label>
                {exporting && (
                  <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Rendering on the
                    worker…
                  </p>
                )}
                {exportError && (
                  <p className="mt-2 text-xs text-destructive break-words">
                    Export failed: {exportError}
                  </p>
                )}
                {exportResult && (
                  <div className="mt-2">
                    <video
                      src={exportResult.url}
                      controls
                      className="w-full border rounded"
                      style={{
                        aspectRatio: `${exportResult.width} / ${exportResult.height}`,
                      }}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {exportResult.width}×{exportResult.height} ·{" "}
                      {exportResult.durationInFrames} frames @ {exportResult.fps}fps ·{" "}
                      {Math.round(exportResult.elapsedMs / 100) / 10}s ·{" "}
                      <a
                        href={exportResult.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        open
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}

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

export default DemoPlayableSpreadView;
