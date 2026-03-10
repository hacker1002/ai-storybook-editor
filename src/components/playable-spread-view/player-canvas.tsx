// player-canvas.tsx - Mock placeholder for player canvas (future reimplementation)
"use client";

import type { PlayerCanvasProps } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PlayerCanvas(_props: PlayerCanvasProps) {
  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">Player coming soon</p>
        <p className="text-xs">Animation playback will be reimplemented</p>
      </div>
    </div>
  );
}
