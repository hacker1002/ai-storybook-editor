// player-hidden-badge.tsx - Badge overlay for items hidden in player

import { EyeOff } from "lucide-react";
import type { Geometry } from "@/types/canvas-types";

interface PlayerHiddenBadgeProps {
  geometry: Geometry;
  zIndex?: number;
  /** For icon-type items (audio/quiz) with w=0,h=0, uses fixed 32px box matching the icon size */
  isIcon?: boolean;
}

export function PlayerHiddenBadge({ geometry, zIndex, isIcon }: PlayerHiddenBadgeProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        ...(isIcon
          ? { width: 32, height: 32 }
          : { width: `${geometry.w}%`, height: `${geometry.h}%` }),
        zIndex: (zIndex ?? 0) + 1,
      }}
    >
      <div
        className={`absolute rounded-sm bg-black/60 p-0.5 ${
          isIcon ? "-top-2.5 -right-2.5" : "top-0.5 right-0.5"
        }`}
      >
        <EyeOff className="w-3 h-3 text-white" />
      </div>
    </div>
  );
}
