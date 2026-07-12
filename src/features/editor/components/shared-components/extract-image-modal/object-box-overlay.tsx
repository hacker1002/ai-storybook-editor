'use client';

// object-box-overlay.tsx — Interactive multi-box overlay shared by the Objects and Crops
// tabs (design 03-objects-tab.md §4.2 + 05-crops-tab.md §4.2). Renders N boxes over the
// source image: drag to move, corner-drag to resize, a per-box toolbar, and a dimmed mask.
// Two toolbar modes (additive — default = Objects behaviour, no regression):
//   • `ratio`  (Objects) — aspect-ratio Select (incl. `Free`) + label badge; aspect-locked.
//   • `preset` (Crops)   — preset Select (`Custom` + book presets, dirty `*`) + close ✕; free-form.
// Pure geometry math lives in extract-box-geometry-utils (shared, testable); this file is the
// thin React/DOM layer. Mirrors crop-image-modal's overlay but adds the `Free` ratio branch
// and selected/unselected styling — crop-modal stays untouched (isolation).

import { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OBJECT_RATIOS,
  OBJECT_MIN_BOX_SIZE_PERCENT,
  CUSTOM_PRESET_LABEL,
  Z_INDEX,
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

// Default box color (= --swap-modal-accent value). A concrete hex (not the CSS var) so the
// `${color}66` selected-glow alpha trick keeps working for boxes that carry no own color (Crops).
const DEFAULT_BOX_COLOR = '#3b6cf6';

const CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
const CORNER_STYLE: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: 'nw-resize' },
  ne: { top: -5, right: -5, cursor: 'ne-resize' },
  sw: { bottom: -5, left: -5, cursor: 'sw-resize' },
  se: { bottom: -5, right: -5, cursor: 'se-resize' },
};

/** Minimal box shape the overlay needs. ObjectBox (ratio/color/label) and CropBox
 *  (presetId) both satisfy it — the toolbar mode picks which fields it reads. */
export interface OverlayBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ratio?: ObjectRatio; // ratio-mode aspect lock (Objects)
  color?: string; // border/badge/handle color (default accent)
  label?: string; // ratio-mode badge text
  presetId?: string | null; // preset-mode current value (Crops)
}

export interface ObjectBoxOverlayProps {
  boxes: OverlayBox[];
  selectedBoxId: string | null;
  imageNatural: { w: number; h: number } | null;
  disabled?: boolean;
  /** Render the dimmed mask outside boxes (default true — mirrors crop-modal UX). */
  showDimmed?: boolean;
  onSelectBox: (id: string | null) => void;
  onUpdateBox: (id: string, patch: Partial<Pick<OverlayBox, 'x' | 'y' | 'w' | 'h'>>) => void;
  // ── ratio mode (Objects) ──
  onRatioChange?: (id: string, ratio: ObjectRatio) => void;
  // ── shared / preset mode (Crops) ──
  /** Toolbar variant — default `ratio` (Objects). `preset` → preset Select + close ✕. */
  toolbarMode?: 'ratio' | 'preset';
  /** Preset dropdown options (preset mode). `Custom` is prepended automatically. */
  presetOptions?: { id: string; title: string }[];
  /** preset mode — apply a preset (id) or revert to Custom (null). */
  onApplyPreset?: (boxId: string, presetId: string | null) => void;
  /** preset mode — close ✕ removes the box from the image (keeps the book preset). */
  onCloseBox?: (boxId: string) => void;
  /** true → no aspect lock on resize (Crops free-form). Default false (Objects). */
  freeForm?: boolean;
  /** preset mode — Select current value text incl. dirty `*` marker. */
  displayLabel?: (boxId: string) => string;
  // ── read-only mode (Texts) ──
  /** true → select-only: no drag/resize/toolbar (geometry immutable). Keeps click-select +
   *  highlight + numbered badge. Default false (Objects/Crops interactive — no regression). */
  readOnly?: boolean;
  /** readOnly mode — render a numbered ordinal badge (box.label) at the box top-left. */
  numbered?: boolean;
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
  onRatioChange,
  toolbarMode = 'ratio',
  presetOptions = [],
  onApplyPreset,
  onCloseBox,
  freeForm = false,
  displayLabel,
  readOnly = false,
  numbered = false,
}: ObjectBoxOverlayProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const beginPointer = useCallback(
    (e: React.MouseEvent, box: OverlayBox, type: 'drag' | 'resize', corner?: ResizeCorner) => {
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
        // Crops (freeForm) never lock; Objects derives the lock from the box ratio.
        lockRatio: freeForm ? null : lockRatioForRatio(box.ratio ?? 'Free', imageNatural),
      };
    },
    [disabled, freeForm, imageNatural, onSelectBox],
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

  const isPreset = toolbarMode === 'preset';

  return (
    <div
      ref={areaRef}
      // `leading-none` resets the line-height:0 inherited from the canvas image wrapper's
      // `leading-[0]` — otherwise the ratio <SelectValue> (line-clamp-1 → overflow:hidden)
      // collapses to 0 height and the selected value renders invisible.
      className="absolute inset-0 select-none leading-none"
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
        const color = box.color ?? DEFAULT_BOX_COLOR;
        const presetValue = box.presetId ?? CUSTOM_PRESET_LABEL;
        const triggerLabel = displayLabel ? displayLabel(box.id) : box.label ?? CUSTOM_PRESET_LABEL;
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
              cursor: readOnly ? 'pointer' : disabled ? 'default' : 'move',
            }}
            // Interactive tabs drag on mouse-down; Texts (readOnly) is select-only → click to select.
            onMouseDown={readOnly ? undefined : (e) => beginPointer(e, box, 'drag')}
            onClick={
              readOnly
                ? (e) => {
                    e.stopPropagation();
                    onSelectBox(box.id);
                  }
                : undefined
            }
          >
            {/* Border — selected = solid accent + glow; unselected = faded dashed */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                border: `2px ${isSelected ? 'solid' : 'dashed'} ${color}`,
                opacity: isSelected ? 1 : 0.55,
                boxShadow: isSelected ? `0 0 0 1px ${color}, 0 0 10px ${color}66` : 'none',
              }}
            />

            {/* Texts (readOnly): numbered ordinal badge only — no toolbar, no resize handles. */}
            {readOnly ? (
              numbered && (
                <span
                  className="pointer-events-none absolute rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold text-white shadow-sm"
                  style={{ top: -10, left: -6, minWidth: 18, background: color, zIndex: 30 }}
                >
                  {box.label}
                </span>
              )
            ) : (
            <>
            {/* Control bar — spans the box width. Strip is pointer-events-none so the gap
                between controls doesn't swallow canvas clicks; interactive children re-enable. */}
            <div
              className="pointer-events-none absolute flex items-center justify-between gap-2"
              style={{ top: -30, left: 0, right: 0, zIndex: 30 }}
            >
              <div
                className="pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {isPreset ? (
                  // Crops: preset Select (Custom + book presets). Current value shows the
                  // dirty `*` via displayLabel (a plain child, not <SelectValue>, so it can
                  // render text that is not an exact option label).
                  <Select
                    value={presetValue}
                    onValueChange={(v) =>
                      onApplyPreset?.(box.id, v === CUSTOM_PRESET_LABEL ? null : v)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="h-6 min-w-0 w-auto gap-1 rounded-md bg-[var(--swap-modal-bg)] px-2 text-[11px] text-[var(--swap-modal-text-primary)]"
                      style={{ borderColor: color }}
                      aria-label="Crop preset"
                    >
                      <span className="line-clamp-1">{triggerLabel}</span>
                    </SelectTrigger>
                    <SelectContent style={SELECT_CONTENT_STYLE}>
                      <SelectItem value={CUSTOM_PRESET_LABEL} className="text-xs">
                        {CUSTOM_PRESET_LABEL}
                      </SelectItem>
                      {presetOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  // Objects: aspect-ratio Select. SOLID opaque bg + white text so the value
                  // stays readable over light image areas.
                  <Select
                    value={box.ratio}
                    onValueChange={(v) => onRatioChange?.(box.id, v as ObjectRatio)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="h-6 min-w-0 w-auto gap-1 rounded-md bg-[var(--swap-modal-bg)] px-2 text-[11px] text-[var(--swap-modal-text-primary)]"
                      style={{ borderColor: color }}
                      aria-label={`Aspect ratio for ${box.label ?? box.id}`}
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
                )}
              </div>

              {isPreset ? (
                // Crops: close ✕ → remove box from the image (keeps the book preset).
                <button
                  type="button"
                  aria-label="Remove crop from image"
                  title="Remove crop from image"
                  disabled={disabled}
                  className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md bg-[var(--swap-modal-bg)] text-[var(--swap-modal-text-primary)] shadow-sm transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ border: `1px solid ${color}` }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseBox?.(box.id);
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm"
                  style={{ background: color }}
                >
                  {box.label}
                </span>
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
                    border: `2px solid ${color}`,
                    zIndex: 25,
                  }}
                  onMouseDown={(e) => beginPointer(e, box, 'resize', corner)}
                />
              ))}
            </>
            )}
          </div>
        );
      })}
    </div>
  );
}
