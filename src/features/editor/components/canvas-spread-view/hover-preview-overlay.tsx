// hover-preview-overlay.tsx — Canvas-level hover preview for ADR-029.
//
// Dashed 1px gray border rendered at MAX_INTERACTIVE_Z - 1 — above items,
// below selection frame. pointer-events: none so it never blocks hit-test.

"use client";

import { memo } from "react";
import { COLORS } from "@/constants/spread-constants";
import type { Geometry } from "./utils/hit-test";

interface HoverPreviewOverlayProps {
  geometry: Geometry;
  zIndex: number;
}

function HoverPreviewOverlayImpl({ geometry, zIndex }: HoverPreviewOverlayProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
        transform: `rotate(${geometry.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        border: `1px dashed ${COLORS.HOVER_OUTLINE}`,
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex,
      }}
    />
  );
}

export const HoverPreviewOverlay = memo(HoverPreviewOverlayImpl);
export default HoverPreviewOverlay;
