// editable-shape.tsx - Utility component for displaying shapes in CanvasSpreadView
'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/utils/utils';
import type { SpreadShape, ShapeFill, ShapeOutline } from '@/types/spread-types';
import { COLORS, DIMMED_BY_OVERLAP_OPACITY } from '@/constants/spread-constants';
import { useZoomLevel } from '@/stores/editor-settings-store';

interface EditableShapeProps {
  shape: SpreadShape;
  index: number;
  zIndex?: number;
  isSelected: boolean;
  isEditable: boolean;
  /** Canvas-level controlled hover (ADR-029 smart hit-test). When undefined,
   *  the component falls back to its own onMouseEnter/Leave local state so
   *  consumers outside Objects space (Spreads/Branch/Dummy/Sketch) keep their
   *  pre-ADR-029 hover behavior. */
  isHoveredByCanvas?: boolean;
  /** ADR-029 dim — set true when this shape fully covers a selected item with
   *  lower z. Reduces opacity to DIMMED_BY_OVERLAP_OPACITY with transition. */
  dimmedByOverlap?: boolean;
  onSelect: () => void;
}

export function EditableShape({
  shape,
  index,
  zIndex,
  isSelected,
  isEditable,
  isHoveredByCanvas,
  dimmedByOverlap = false,
  onSelect,
}: EditableShapeProps) {
  const zoomLevel = useZoomLevel();
  const [isHoveredLocal, setIsHoveredLocal] = useState(false);
  const isHovered = isHoveredByCanvas ?? isHoveredLocal;
  const useLocalHover = isHoveredByCanvas === undefined;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditable) {
      onSelect();
    }
  }, [isEditable, onSelect]);

  const getOutlineStyle = (outline: ShapeOutline): string => {
    switch (outline.type) {
      case 0: return 'solid';
      case 1: return 'dashed';
      case 2: return 'dotted';
      default: return 'solid';
    }
  };

  const fill: ShapeFill = shape.fill;
  const outline: ShapeOutline = shape.outline;
  const zoomFactor = zoomLevel / 100;
  const effectiveOpacity = dimmedByOverlap ? DIMMED_BY_OVERLAP_OPACITY : fill.opacity;

  return (
    <div
      role="img"
      aria-label={shape.title || `Shape ${index + 1}`}
      data-base-opacity={fill.opacity}
      data-item-id={shape.id}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && isEditable && onSelect()}
      onMouseEnter={useLocalHover ? () => setIsHoveredLocal(true) : undefined}
      onMouseLeave={useLocalHover ? () => setIsHoveredLocal(false) : undefined}
      className={cn(
        'absolute transition-opacity',
        isEditable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1',
      )}
      style={{
        left: `${shape.geometry.x}%`,
        top: `${shape.geometry.y}%`,
        width: `${shape.geometry.w}%`,
        height: `${shape.geometry.h}%`,
        zIndex,
        backgroundColor: fill.is_filled ? fill.color : 'transparent',
        opacity: effectiveOpacity,
        borderStyle: getOutlineStyle(outline),
        borderWidth: `${outline.width * zoomFactor}px`,
        borderColor: outline.color,
        borderRadius: `${outline.radius * zoomFactor}px`,
        outlineColor: COLORS.HOVER_OUTLINE,
        transition: 'opacity 150ms ease-out',
      }}
    />
  );
}

export default EditableShape;
