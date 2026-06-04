// features/demo-spread-views/pages/demo-remotion-spike.tsx
// Remotion de-risk spike. Route: /demo/remotion-spike
//
// Goal: prove the player's GSAP animations can be driven by Remotion's frame clock
// (tl.seek(frame/fps)) instead of wall-clock playback — the prerequisite for video
// export. Reuses the REAL tween builders + the same mock factory as the player demo,
// embeds @remotion/player for in-browser preview + scrubbing. Does NOT render MP4
// (preview only — same render core; CLI/Lambda muxing is a separate, low-risk step).

import { useCallback, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import {
  createPlayableSpreads,
  type CreatePlayableSpreadOptions,
} from "../__mocks__/playable-spread-factory";
import type { PlayableSpread } from "@/types/playable-types";
import { createCombinedDemoSpread } from "../__mocks__/combined-demo-spread-fixture";
import { SpreadVideoComposition } from "@/remotion/spread-video-composition";
import "@/remotion/load-fonts"; // Nunito — match worker render so preview===output
import {
  VIDEO_FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  getSpreadDurationInFrames,
} from "@/remotion/composition-metadata";
import { requestVideoRender, type VideoRenderResult } from "../utils/request-video-render";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Film, Loader2 } from "lucide-react";

// Shared with the worker render so preview === output. 1920×1440 (4:3, 1440p).
const FPS = VIDEO_FPS;
const COMP_WIDTH = VIDEO_WIDTH;
const COMP_HEIGHT = VIDEO_HEIGHT;

const DEFAULT_OPTIONS: CreatePlayableSpreadOptions = {
  spreadCount: 4,
  textboxCount: 1,
  imageCount: 3,
  shapeCount: 1,
  videoProbability: 0,
  audioCount: 1,
  language: "en_US",
  isDPS: true,
};

export function DemoRemotionSpike() {
  const sessionRef = useRef(0);
  const [options, setOptions] = useState<CreatePlayableSpreadOptions>(DEFAULT_OPTIONS);
  // Combined fixture (read-along + video + webp + lottie) is always spread #1.
  const [spreads, setSpreads] = useState<PlayableSpread[]>(() => [
    createCombinedDemoSpread(),
    ...createPlayableSpreads(DEFAULT_OPTIONS),
  ]);
  const [selectedId, setSelectedId] = useState<string>(() => spreads[0]?.id ?? "");

  const selectedSpread = useMemo(
    () => spreads.find((s) => s.id === selectedId) ?? spreads[0] ?? null,
    [spreads, selectedId]
  );

  const durationInFrames = useMemo(
    () => (selectedSpread ? getSpreadDurationInFrames(selectedSpread, FPS) : FPS),
    [selectedSpread]
  );

  const inputProps = useMemo(
    () => (selectedSpread ? { spread: selectedSpread, language: options.language } : null),
    [selectedSpread, options.language]
  );

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<VideoRenderResult | null>(null);

  const handleRegenerate = useCallback(() => {
    sessionRef.current += 1;
    const next = [createCombinedDemoSpread(), ...createPlayableSpreads(options)];
    setSpreads(next);
    setSelectedId(next[0]?.id ?? "");
    setExportResult(null);
    setExportError(null);
  }, [options]);

  const handleExport = useCallback(async () => {
    if (!selectedSpread) return;
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await requestVideoRender(selectedSpread, options.language);
      setExportResult(result);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [selectedSpread, options.language]);

  const updateOption = useCallback(
    <K extends keyof CreatePlayableSpreadOptions>(key: K, value: CreatePlayableSpreadOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Remotion Spike — GSAP seek de-risk</h1>
          <p className="text-sm text-muted-foreground">
            Player animations driven by frame clock (tl.seek) · {FPS}fps · {COMP_WIDTH}×{COMP_HEIGHT} · Export MP4 via video-worker
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Spreads: {options.spreadCount}</Label>
            <div className="w-28">
              <Slider
                value={[options.spreadCount]}
                onValueChange={([v]) => updateOption("spreadCount", v)}
                min={1}
                max={12}
                step={1}
              />
            </div>
          </div>
          <Select
            value={options.language}
            onValueChange={(v) => updateOption("language", v as "en_US" | "vi_VN")}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en_US">English</SelectItem>
              <SelectItem value="vi_VN">Vietnamese</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRegenerate} className="h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting || !selectedSpread}
            className="h-8 gap-1.5 text-xs"
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}
            {exporting ? "Rendering…" : "Export MP4"}
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex">
        <aside className="w-64 border-r p-3 overflow-auto space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">SPREAD (render target)</Label>
          {spreads.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono truncate ${
                s.id === selectedId ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              #{i + 1} · {s.animations.length} anims · {s.id.slice(0, 8)}
            </button>
          ))}
        </aside>

        <section className="flex-1 overflow-auto flex items-center justify-center p-6 bg-muted/30">
          {inputProps && selectedSpread ? (
            <div className="w-full max-w-4xl">
              <Player
                component={SpreadVideoComposition}
                inputProps={inputProps}
                durationInFrames={durationInFrames}
                fps={FPS}
                compositionWidth={COMP_WIDTH}
                compositionHeight={COMP_HEIGHT}
                controls
                loop
                acknowledgeRemotionLicense
                style={{ width: "100%", aspectRatio: `${COMP_WIDTH} / ${COMP_HEIGHT}`, border: "1px solid #ddd" }}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Duration: {Math.round((durationInFrames / FPS) * 10) / 10}s · Scrub the timeline:
                motion should be frame-deterministic (same frame → same pixels). Open console for
                analytic-vs-GSAP duration parity log.
              </p>

              {(exporting || exportError || exportResult) && (
                <div className="mt-4 border-t pt-4">
                  <Label className="text-xs font-medium text-muted-foreground">
                    RENDERED MP4 (video-worker) — should match preview
                  </Label>
                  {exporting && (
                    <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Rendering {COMP_WIDTH}×{COMP_HEIGHT}@
                      {FPS}fps on the worker…
                    </p>
                  )}
                  {exportError && (
                    <p className="mt-2 text-xs text-destructive">Export failed: {exportError}</p>
                  )}
                  {exportResult && (
                    <div className="mt-2">
                      <video
                        src={exportResult.url}
                        controls
                        className="w-full border rounded"
                        style={{ aspectRatio: `${COMP_WIDTH} / ${COMP_HEIGHT}` }}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {exportResult.width}×{exportResult.height} · {exportResult.durationInFrames}{" "}
                        frames · rendered in {Math.round(exportResult.elapsedMs / 100) / 10}s ·{" "}
                        <a href={exportResult.url} target="_blank" rel="noreferrer" className="underline">
                          open
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No spread selected</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default DemoRemotionSpike;
