// editable-shape.tsx - Utility component for displaying shapes in CanvasSpreadView
'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/utils/utils';
import type { SpreadShape, ShapeFill, ShapeOutline } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';

interface EditableShapeProps {
  shape: SpreadShape;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: () => void;
}

export function EditableShape({
  shape,
  index,
  isSelected,
  isEditable,
  onSelect,
}: EditableShapeProps) {
  const [isHovered, setIsHovered] = useState(false);

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

  return (
    <div
      role="img"
      aria-label={shape.title || `Shape ${index + 1}`}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && isEditable && onSelect()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute',
        isEditable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1',
      )}
      style={{
        left: `${shape.geometry.x}%`,
        top: `${shape.geometry.y}%`,
        width: `${shape.geometry.w}%`,
        height: `${shape.geometry.h}%`,
        backgroundColor: fill.is_filled ? fill.color : 'transparent',
        opacity: fill.opacity,
        borderStyle: getOutlineStyle(outline),
        borderWidth: `${outline.width}px`,
        borderColor: outline.color,
        borderRadius: `${outline.radius}px`,
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    />
  );
}

export default EditableShape;
