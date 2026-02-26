// selection-overlay.tsx - Blue border overlay for selected items in animation editor
'use client';

import { COLORS } from '../shared/constants';
import type { Geometry } from '../shared/types';

interface SelectionOverlayProps {
  geometry: Geometry;
}

export function SelectionOverlay({ geometry }: SelectionOverlayProps) {
  return (
    <div
      className="absolute pointer-events-none border-2"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
        borderColor: COLORS.SELECTION,
      }}
    />
  );
}

export default SelectionOverlay;
