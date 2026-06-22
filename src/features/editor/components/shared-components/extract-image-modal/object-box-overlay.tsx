'use client';

// object-box-overlay.tsx — Interactive multi-box overlay for the Objects tab
// (design 03-objects-tab.md §4.2). Renders N ObjectBox over the source image: drag to move,
// corner-drag to resize, per-box ratio selector (incl. `Free`), label badge, dimmed mask.
// Pure geometry math lives in extract-box-geometry-utils (shared, testable); this file is the
// thin React/DOM layer. Mirrors crop-image-modal's overlay but adds the `Free` ratio branch
// and selected/unselected styling — crop-modal stays untouched (isolation).

import { useCallback, useEffect, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import {
  OBJECT_RATIOS,
  OBJECT_MIN_BOX_SIZE_PERCENT,
  Z_INDEX,
  type ObjectBox,
  type ObjectRatio,
} from './extract-image-modal-constants';
import {
  applyDrag,
  applyResize,
  lockRatioForRatio,
  pointerDeltaToPercent,
  type BoxGeometry,
  type ResizeCorner,
} from './extract-box-geometry-utils';

// Radix popper copies the content's computed z onto its portal wrapper — without this the
// dropdown (shadcn default z-50) paints behind the full-screen modal (z-4000). See memory.
const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };

const CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
const CORNER_STYLE: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: 'nw-resize' },
  ne: { top: -5, right: -5, cursor: 'ne-resize' },
  sw: { bottom: -5, left: -5, cursor: 'sw-resize' },
  se: { bottom: -5, right: -5, cursor: 'se-resize' },
};

export interface ObjectBoxOverlayProps {
  boxes: ObjectBox[];
  selectedBoxId: string | null;
  imageNatural: { w: number; h: number } | null;
  disabled?: boolean;
  /** Render the dimmed mask outside boxes (default true — mirrors crop-modal UX). */
  showDimmed?: boolean;
  onSelectBox: (id: string | null) => void;
  onUpdateBox: (id: string, patch: Partial<Pick<ObjectBox, 'x' | 'y' | 'w' | 'h'>>) => void;
  onDeleteBox: (id: string) => void;
  onRatioChange: (id: string, ratio: ObjectRatio) => void;
}

interface DragState {
  type: 'drag' | 'resize';
  boxId: string;
  corner?: ResizeCorner;
  start: BoxGeometry;
  startClientX: number;
  startClientY: number;
  lockRatio: number | null;
}

export function ObjectBoxOverlay({
  boxes,
  selectedBoxId,
  imageNatural,
  disabled = false,
  showDimmed = true,
  onSelectBox,
  onUpdateBox,
  onDeleteBox,
  onRatioChange,
}: ObjectBoxOverlayProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const beginPointer = useCallback(
    (e: React.MouseEvent, box: ObjectBox, type: 'drag' | 'resize', corner?: ResizeCorner) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      onSelectBox(box.id);
      dragStateRef.current = {
        type,
        boxId: box.id,
        corner,
        start: { x: box.x, y: box.y, w: box.w, h: box.h },
        startClientX: e.clientX,
        startClientY: e.clientY,
        lockRatio: lockRatioForRatio(box.ratio, imageNatural),
      };
    },
    [disabled, imageNatural, onSelectBox],
  );

  // Document-level move/up so a drag continues outside the box bounds. Geometry math is pure
  // (extract-box-geometry-utils); this effect only wires DOM events → onUpdateBox.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = dragStateRef.current;
      const area = areaRef.current;
      if (!st || !area) return;
      const rect = area.getBoundingClientRect();
      const { dxPct, dyPct } = pointerDeltaToPercent(
        e.clientX - st.startClientX,
        e.clientY - st.startClientY,
        rect.width,
        rect.height,
      );
      const next =
        st.type === 'drag'
          ? applyDrag(st.start, dxPct, dyPct)
          : applyResize(st.start, st.corner!, dxPct, dyPct, st.lockRatio, OBJECT_MIN_BOX_SIZE_PERCENT);
      onUpdateBox(st.boxId, next);
    };
    const onUp = () => {
      dragStateRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [onUpdateBox]);

  // Click on empty canvas (image, not a box) → deselect.
  const handleAreaClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onSelectBox(null);
    },
    [onSelectBox],
  );

  return (
    <div
      ref={areaRef}
      className="absolute inset-0 select-none"
      onClick={handleAreaClick}
    >
      {/* Dimmed overlay outside boxes (optional) */}
      {showDimmed && boxes.length > 0 && (
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          <defs>
            <mask id="object-dim-mask">
              <rect width="100%" height="100%" fill="white" />
              {boxes.map((box) => (
                <rect
                  key={box.id}
                  x={`${box.x}%`}
                  y={`${box.y}%`}
                  width={`${box.w}%`}
                  height={`${box.h}%`}
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.35)" mask="url(#object-dim-mask)" />
        </svg>
      )}

      {boxes.map((box) => {
        const isSelected = box.id === selectedBoxId;
        return (
          <div
            key={box.id}
            className="absolute"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
              zIndex: isSelected ? 20 : 10,
              cursor: disabled ? 'default' : 'move',
            }}
            onMouseDown={(e) => beginPointer(e, box, 'drag')}
          >
            {/* Border — selected = solid accent + glow; unselected = faded dashed */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                border: `2px ${isSelected ? 'solid' : 'dashed'} ${box.color}`,
                opacity: isSelected ? 1 : 0.55,
                boxShadow: isSelected ? `0 0 0 1px ${box.color}, 0 0 10px ${box.color}66` : 'none',
              }}
            />

            {/* Ratio selector — top-left (only place ratio changes, per design §4.2) */}
            <div
              className="absolute"
              style={{ top: -30, left: 0, zIndex: 30 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Select
                value={box.ratio}
                onValueChange={(v) => onRatioChange(box.id, v as ObjectRatio)}
                disabled={disabled}
              >
                <SelectTrigger
                  className="h-6 min-w-0 w-auto bg-background px-2 text-xs"
                  style={{ borderColor: box.color, fontSize: 11 }}
                  aria-label={`Aspect ratio for ${box.label}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={SELECT_CONTENT_STYLE}>
                  {OBJECT_RATIOS.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label badge — top-right, box color */}
            <div
              className="absolute flex items-center gap-1"
              style={{ top: -28, right: 0, zIndex: 30 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm"
                style={{ background: box.color }}
              >
                {box.label}
              </span>
              {isSelected && !disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBox(box.id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
                  aria-label={`Remove ${box.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Corner resize handles — selected only */}
            {isSelected &&
              !disabled &&
              CORNERS.map((corner) => (
                <div
                  key={corner}
                  className="absolute"
                  style={{
                    ...CORNER_STYLE[corner],
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'white',
                    border: `2px solid ${box.color}`,
                    zIndex: 25,
                  }}
                  onMouseDown={(e) => beginPointer(e, box, 'resize', corner)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
