// playable-header.tsx - Header with play/stop button, version toggle and zoom slider for PlayableSpreadView
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Play, Square, Minus, Plus } from "lucide-react";
import type { ActiveCanvas, PlayVersion } from "@/types/playable-types";
import { PLAYABLE_ZOOM } from "@/constants/playable-constants";

interface PlayableHeaderProps {
  activeCanvas: ActiveCanvas;
  playVersion: PlayVersion;
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onVersionChange: (version: PlayVersion) => void;
}

export const PlayableHeader = memo(function PlayableHeader({
  activeCanvas,
  playVersion,
  zoomLevel,
  onZoomChange,
  onPlay,
  onStop,
  onVersionChange,
}: PlayableHeaderProps) {
  const isPlayerActive = activeCanvas === "player";
  const isZoomDisabled = isPlayerActive;
  const isInteractive = playVersion === "interactive";

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-background z-10">
      {/* Left: Play/Stop button */}
      <div className="flex items-center">
        {isPlayerActive ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-secondary"
            onClick={onStop}
            aria-label="Stop playback"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-secondary"
            onClick={onPlay}
            aria-label="Play"
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Center: Version toggle (Classic / Interactive) */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${!isInteractive ? "text-foreground" : "text-muted-foreground"}`}>
          Classic
        </span>
        <Switch
          checked={isInteractive}
          onCheckedChange={(checked) => onVersionChange(checked ? "interactive" : "classic")}
          aria-label="Toggle interactive mode"
        />
        <span className={`text-xs font-medium ${isInteractive ? "text-foreground" : "text-muted-foreground"}`}>
          Interactive
        </span>
      </div>

      {/* Right: Zoom slider */}
      <div
        className={`flex items-center gap-1 ${
          isZoomDisabled ? "opacity-40 pointer-events-none" : ""
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            onZoomChange(
              Math.max(zoomLevel - PLAYABLE_ZOOM.STEP, PLAYABLE_ZOOM.MIN)
            )
          }
          disabled={isZoomDisabled || zoomLevel <= PLAYABLE_ZOOM.MIN}
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <Slider
          value={[zoomLevel]}
          min={PLAYABLE_ZOOM.MIN}
          max={PLAYABLE_ZOOM.MAX}
          step={PLAYABLE_ZOOM.STEP}
          onValueChange={([v]) => onZoomChange(v)}
          disabled={isZoomDisabled}
          aria-label="Zoom level"
          className="w-[100px]"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            onZoomChange(
              Math.min(zoomLevel + PLAYABLE_ZOOM.STEP, PLAYABLE_ZOOM.MAX)
            )
          }
          disabled={isZoomDisabled || zoomLevel >= PLAYABLE_ZOOM.MAX}
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>

        <span className="text-xs font-medium tabular-nums w-9 text-right text-muted-foreground">
          {zoomLevel}%
        </span>
      </div>
    </div>
  );
});
