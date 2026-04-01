// playable-editor-header.tsx - Header with zoom slider for animation-editor/remix-editor modes
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Minus, Plus } from "lucide-react";
import { PLAYABLE_ZOOM } from "@/constants/playable-constants";

interface PlayableEditorHeaderProps {
  zoomLevel: number;
  onZoomChange: (level: number) => void;
}

export const PlayableEditorHeader = memo(function PlayableEditorHeader({
  zoomLevel,
  onZoomChange,
}: PlayableEditorHeaderProps) {
  return (
    <div className="flex items-center justify-end px-3 h-14 shrink-0 border-b bg-background z-10">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomChange(Math.max(zoomLevel - PLAYABLE_ZOOM.STEP, PLAYABLE_ZOOM.MIN))}
          disabled={zoomLevel <= PLAYABLE_ZOOM.MIN}
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
          aria-label="Zoom level"
          className="w-[100px]"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomChange(Math.min(zoomLevel + PLAYABLE_ZOOM.STEP, PLAYABLE_ZOOM.MAX))}
          disabled={zoomLevel >= PLAYABLE_ZOOM.MAX}
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
