// composite-member-badge.tsx - Numeric badge overlay marking canvas items
// (image / auto_pic) that participate in a composite group. Editor-only.
// Positioned at top-left of the variant's geometry box, above item content
// but below the selection frame.

import type { Geometry } from "@/types/canvas-types";
import { createLogger } from "@/utils/logger";

const log = createLogger("UI", "CompositeMemberBadge");

interface CompositeMemberBadgeProps {
  /** 1-based ordinal of the composite within `spread.composites[]`. */
  compositeNumber: number;
  /** Geometry of the variant item (image / auto_pic) — badge anchors to its top-left. */
  geometry: Geometry;
  /** Selection frame z-index for the underlying item; badge sits at zIndex+1. */
  zIndex?: number;
  /** Click → select composite group in sidebar. stopPropagation handled internally. */
  onClick?: () => void;
}

export function CompositeMemberBadge({
  compositeNumber,
  geometry,
  zIndex,
  onClick,
}: CompositeMemberBadgeProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
        zIndex: (zIndex ?? 0) + 1,
      }}
    >
      <button
        type="button"
        className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary/90 hover:bg-primary text-white text-xs font-semibold flex items-center justify-center pointer-events-auto shadow-sm transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          log.debug("onClick", "badge clicked", { compositeNumber });
          onClick?.();
        }}
        onMouseDown={(e) => {
          // Prevent EditableImage drag handler from grabbing the click.
          e.stopPropagation();
        }}
        aria-label={`Composite #${compositeNumber}`}
        title={`Composite #${compositeNumber}`}
      >
        {compositeNumber}
      </button>
    </div>
  );
}
