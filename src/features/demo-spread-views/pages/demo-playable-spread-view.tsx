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
import { AVAILABLE_LANGUAGES } from "@/constants/editor-constants";
import type { RemixLanguageCode } from "@/types/editor";
import type { SpreadShape, SpreadTextbox } from "@/types/spread-types";
import { PlayerAnimationSidebar } from '@/features/editor/components/preview-creative-space';
import { useDemoAnimationState } from '../hooks/use-demo-animation-state';
import {
  createPlayableSpreads,
  type CreatePlayableSpreadOptions,
} from "../__mocks__/playable-spread-factory";
import {
  requestBookVideoRender,
  type BookVideoRenderResult,
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

// Demo has no book.sound configured (mock spreads), so the page-turn SFX is supplied
// explicitly to the render to demonstrate it. In production this URL is resolved from
// book.sound.transition_id via useSoundMediaUrl (same source the live player feeds to
// playTransitionSfx) — the demo is the only place it's hardcoded.
const DEMO_TRANSITION_SFX_URL =
  "https://kiprvibenjkhvzekbkrw.supabase.co/storage/v1/object/public/storybook-assets/sound-effects/431dc4cfd00bd23d44b0b74ed4aa5657a0af020b1a9660eb15471762765871bf.mp3";

// Keep the first 2 spreads light (~3-4 animations each) so the 2-spread page-turn
// export is quick to render + easy to inspect. Items whose entrance is trimmed render
// statically visible — applyInitialStates only hides items that have an animation.
const DEMO_FIRST_SPREADS_ANIM_LIMIT = 4;
const DEMO_TRIMMED_SPREAD_COUNT = 2;

// Distinct, animation-free marker items for the first 2 spreads so each page is
// instantly identifiable during the turn (no entrance effect — applyInitialStates only
// hides items that have an animation, so these render statically visible). Colors +
// corner positions differ per spread, and a big "SPREAD N" label removes all ambiguity.
const DEMO_MARKER_PALETTES = [
  { a: "#e11d48", b: "#2563eb" }, // spread 1 — rose / blue
  { a: "#16a34a", b: "#f59e0b" }, // spread 2 — green / amber
] as const;

function buildSpreadMarkerItems(
  spreadIndex: number,
  language: RemixLanguageCode
): { shapes: SpreadShape[]; textboxes: SpreadTextbox[] } {
  const n = spreadIndex + 1;
  const palette = DEMO_MARKER_PALETTES[spreadIndex % DEMO_MARKER_PALETTES.length];
  const isFirst = spreadIndex % 2 === 0;

  const mkShape = (
    suffix: string,
    color: string,
    geo: { x: number; y: number; w: number; h: number }
  ): SpreadShape => ({
    id: `demo-marker-${n}-${suffix}`,
    type: "rectangle",
    title: `Marker ${n}${suffix}`,
    geometry: { ...geo },
    fill: { is_filled: true, color, opacity: 0.9 },
    outline: { color: "#1f2937", width: 2, radius: 8, type: 0 },
    "z-index": 400,
    player_visible: true,
    editor_visible: true,
  });

  // Mirror corners between spread 1 and 2 so they read differently at a glance.
  const shapeA = mkShape("a", palette.a, isFirst ? { x: 6, y: 10, w: 16, h: 18 } : { x: 78, y: 10, w: 16, h: 18 });
  const shapeB = mkShape("b", palette.b, isFirst ? { x: 78, y: 72, w: 16, h: 18 } : { x: 6, y: 72, w: 16, h: 18 });

  const label: SpreadTextbox = {
    id: `demo-marker-${n}-label`,
    title: `Spread ${n} label`,
    "z-index": 401,
    player_visible: true,
    editor_visible: true,
    [language]: {
      text: `SPREAD ${n}`,
      geometry: { x: 28, y: 3, w: 44, h: 14 },
      typography: {
        size: 48,
        weight: 800,
        style: "normal",
        family: "Nunito",
        color: "#0f172a",
        lineHeight: 1.2,
        letterSpacing: 0,
        decoration: "none",
        textAlign: "center",
        textTransform: "uppercase",
      },
    },
  };

  return { shapes: [shapeA, shapeB], textboxes: [label] };
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
    const all = createPlayableSpreads(factoryOpts);
    // First N spreads (the default export window): trim animations so the page-turn
    // export stays short (slice keeps the lowest-order anims = entrances), and add
    // distinct animation-free marker items so each page is identifiable during the turn.
    return all.map((s, i) => {
      if (i >= DEMO_TRIMMED_SPREAD_COUNT) return s;
      const markers = buildSpreadMarkerItems(i, opts.language);
      return {
        ...s,
        animations: s.animations.slice(0, DEMO_FIRST_SPREADS_ANIM_LIMIT),
        shapes: [...(s.shapes ?? []), ...markers.shapes],
        textboxes: [...(s.textboxes ?? []), ...markers.textboxes],
      };
    });
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

  // === MP4 export (2-spread book render → video-worker /render-book) ===
  // Renders the selected spread + its neighbour through the BOOK composition so the
  // MP4 exercises the page-turn segment (book-turn-segment) between the two — the
  // single-spread /render path can't show a turn. Spreads are the SAME objects
  // PlayableSpreadView plays live (shared PlayerSpreadStage + timeline), so each
  // spread's content stays parity-by-construction; only the render-side turn DOM
  // differs from the live overlay (acceptable — different stacks, same flip math).
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<BookVideoRenderResult | null>(null);

  // 2-spread window anchored on the selection. Clamp so the selected spread is always
  // included and a full pair fits; degrades to a single spread (no turn) only when
  // the book has <2 spreads.
  const exportPair = useMemo(() => {
    if (spreads.length === 0) return [] as PlayableSpread[];
    const idx = Math.max(0, spreads.findIndex((s) => s.id === selectedSpreadId));
    const start = Math.min(idx, Math.max(0, spreads.length - 2));
    return spreads.slice(start, start + 2);
  }, [spreads, selectedSpreadId]);

  const handleExport = useCallback(async () => {
    if (exportPair.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await requestBookVideoRender(
        exportPair,
        mockOptions.language,
        DEMO_TRANSITION_SFX_URL
      );
      setExportResult(result);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [exportPair, mockOptions.language]);

  // Stale export when the target window changes (selection or regenerate).
  const exportTargetKey = exportPair.map((s) => s.id).join("|");
  useLayoutEffect(() => {
    setExportResult(null);
    setExportError(null);
  }, [exportTargetKey]);

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
              disabled={exporting || exportPair.length === 0}
              className="h-9 gap-1.5"
              title={
                exportPair.length >= 2
                  ? `Export 2-spread page-turn MP4 (${exportPair
                      .map((s) => s.id.slice(0, 8))
                      .join(" → ")})`
                  : exportPair.length === 1
                    ? "Only one spread — no page-turn (add a spread to see the turn)"
                    : "Select a spread to export"
              }
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              {exporting ? "Rendering…" : "Export MP4 (2-spread turn)"}
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
                  RENDERED MP4 — 2 spreads · page-turn (video-worker)
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
                      {exportResult.spreadsRendered} spreads ·{" "}
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
                      {exportResult.warnings.length > 0 && (
                        <span className="text-amber-600">
                          {" "}· {exportResult.warnings.join(", ")}
                        </span>
                      )}
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
