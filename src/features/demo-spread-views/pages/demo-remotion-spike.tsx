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
import { SpreadVideoComposition } from "../components/remotion-spike/spread-video-composition";
import { linearizeSpreadTimeline } from "../utils/linearize-spread-timeline";
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
import { RefreshCw } from "lucide-react";

const FPS = 30;
const COMP_WIDTH = 1280;
const COMP_HEIGHT = 960; // 4:3 — matches mock CANVAS_RATIO
const DURATION_PAD_SEC = 2;

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

  const durationInFrames = useMemo(() => {
    if (!selectedSpread) return FPS;
    const { totalSec } = linearizeSpreadTimeline(selectedSpread.animations);
    return Math.max(FPS, Math.round((totalSec + DURATION_PAD_SEC) * FPS));
  }, [selectedSpread]);

  const inputProps = useMemo(
    () => (selectedSpread ? { spread: selectedSpread, language: options.language } : null),
    [selectedSpread, options.language]
  );

  const handleRegenerate = useCallback(() => {
    sessionRef.current += 1;
    const next = [createCombinedDemoSpread(), ...createPlayableSpreads(options)];
    setSpreads(next);
    setSelectedId(next[0]?.id ?? "");
  }, [options]);

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
            Player animations driven by frame clock (tl.seek) · {FPS}fps · {COMP_WIDTH}×{COMP_HEIGHT} · preview only (no MP4)
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
