// selection-overlay.tsx - Blue border overlay for selected items in animation editor
"use client";

import { COLORS } from "@/constants/spread-constants";
import type { Geometry } from "@/types/spread-types";

interface SelectionOverlayProps {
  geometry: Geometry;
}

export function SelectionOverlay({ geometry }: SelectionOverlayProps) {
  const rotation = Number.isFinite(geometry.rotation) ? geometry.rotation : 0;
  return (
    <div
      className="absolute pointer-events-none border-2"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        borderColor: COLORS.SELECTION,
        zIndex: 900,
      }}
    />
  );
}

export default SelectionOverlay;
