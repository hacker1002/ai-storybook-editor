// defect-overlay.tsx — Shared, presentational SVG layer that draws suspected
// swap-defect regions (circle / ellipse) over a composed AFTER crop sheet
// (design 05-15 §3.2). REUSABLE + tab-agnostic: it knows nothing about
// sprite/mix/job — only the `defects[]` of ONE sheet + that sheet's
// `swappedDimensions` (the coordinate origin). Mounted in StageCanvas; the host
// owns the visible/stale gating.
//
// Zoom-safe by construction: StageCanvas sizes the sheet frame via CSS
// width/height (NOT transform — memory feedback_zoom_via_css_width_not_transform),
// the AFTER compose fills that frame, and this SVG fills it too with
// viewBox=swappedDimensions + preserveAspectRatio="none". So defect px coords map
// 1:1 to the frame at every zoom without tracking displayed pixels.
//
// PII (CRITICAL §10): the per-shape tooltip shows the server-constrained
// `message` to sighted users via an `aria-hidden` visual-only popup, but the SR
// accessible name (aria-label) is severity:category ONLY — `message` is never
// announced by a screen reader and never pushed to logger/analytics. We do NOT
// use Radix Tooltip here: it wires `aria-describedby` trigger→content, which
// WOULD let a screen reader announce `message` — breaking the §10 contract.
//
// Speed: the old native <title> tooltip carried a fixed ~1.5s browser hover
// delay (not configurable). The portal tooltip below appears instantly.

import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { createLogger } from '@/utils/logger';
import type { SwapDefect } from '@/types/remix';
import { Z_INDEX } from '../swap-modal-constants';

const log = createLogger('Editor', 'SwapDefectDetect');

/** Hovered-shape state for the visual tooltip: which defect + its on-screen rect
 *  (captured from the SVG shape, so the popup anchors correctly at any zoom /
 *  non-uniform SVG scale) + the resolved modal-surface colors. `null` = nothing
 *  hovered. The colors are read off the shape (which lives INSIDE the modal, so
 *  the `--swap-modal-*` vars cascade) because the tooltip portals to <body>,
 *  OUTSIDE the modal subtree, where those vars would not resolve. */
interface HoveredDefect {
  index: number;
  rect: DOMRect;
  bg: string;
  border: string;
  text: string;
}

/** Fallbacks mirror swap-modal-constants.ts (card-bg / border-strong /
 *  text-primary) in case the var read comes back empty. */
const TOOLTIP_FALLBACK = {
  bg: '#14171f',
  border: 'rgba(255, 255, 255, 0.18)',
  text: '#ffffff',
} as const;

/** Resolve the modal-surface tokens from an in-modal element so the body-portaled
 *  tooltip can match the dark modal chrome. */
function resolveTooltipColors(el: Element): Pick<HoveredDefect, 'bg' | 'border' | 'text'> {
  const cs = getComputedStyle(el);
  const read = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback;
  return {
    bg: read('--swap-modal-card-bg', TOOLTIP_FALLBACK.bg),
    border: read('--swap-modal-border-strong', TOOLTIP_FALLBACK.border),
    text: read('--swap-modal-text-primary', TOOLTIP_FALLBACK.text),
  };
}

/** Severity → stroke / fill colors (reusable across tabs). `low` is the default
 *  when a defect omits `severity`. high = đỏ, medium = hổ phách, low = xanh. */
export const DEFECT_SEVERITY_STYLE = {
  high: { stroke: '#ef4444', fill: 'rgba(239,68,68,0.16)' },
  medium: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.14)' },
  low: { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.12)' },
} as const;

/** Ellipse enlargement vs the raw `box` (box inscribed = 1.0 ↔ circumscribed =
 *  √2 ≈ 1.414). 1.2 gives the oval a little breathing room around the region
 *  without fully circumscribing it. Tune within [1.0, 1.414]. Only applies to the
 *  `box`→ellipse path; the center+radius circle path is already circumscribed. */
export const DEFECT_OVAL_SCALE = 1.2;

export interface DefectOverlayProps {
  /** Defects of the SHEET currently shown (defectsBySheet[activeSheetIndex]). */
  defects: SwapDefect[];
  /** Coordinate origin — the swapped sheet pixel size (defect coords are px on this). */
  swappedDimensions: { width: number; height: number };
  /** Host-computed gate (AFTER non-compare + has defects + not stale). */
  visible: boolean;
  /** Optional emphasis — the POSITIONAL INDEX in `defects[]` (SwapDefect has no
   *  stable id; defects are keyed by order, matching `onHoverDefect`'s index).
   *  Thicker stroke + denser fill. Reserved for a future list panel. */
  selectedDefectId?: number | null;
  /** Hover hook for the host (future list-panel focus); receives the index or null. */
  onHoverDefect?: (index: number | null) => void;
}

/** SR-safe accessible name for one shape — severity:category, NEVER `message`. */
function shapeAriaLabel(defect: SwapDefect): string {
  const severity = defect.severity ?? 'low';
  return `${severity}: ${defect.category ?? 'other'}`;
}

/** Native tooltip text — severity:category + the server-constrained message
 *  (shown visually only; SR uses aria-label instead so message isn't announced). */
function shapeTitle(defect: SwapDefect): string {
  const base = shapeAriaLabel(defect);
  return defect.message ? `${base} · ${defect.message}` : base;
}

export function DefectOverlay({
  defects,
  swappedDimensions,
  visible,
  selectedDefectId = null,
  onHoverDefect,
}: DefectOverlayProps) {
  const { width, height } = swappedDimensions;
  const [hovered, setHovered] = useState<HoveredDefect | null>(null);

  // Counts only — NEVER log defect.message / media / human data (PII §10).
  log.debug('render', 'defect overlay', {
    defectCount: defects.length,
    visible,
    hasDims: width > 0 && height > 0,
  });

  if (!visible || defects.length === 0 || width <= 0 || height <= 0) return null;

  const svg = (
    <svg
      // Fill the sheet frame; viewBox in swapped px → stretch to frame so defect
      // coords map exactly the way the AFTER image fills (preserveAspectRatio none).
      role="img"
      aria-label={`${defects.length} vùng swap nghi lỗi`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // layer transparent to clicks; shapes opt back in
      }}
    >
      {defects.map((defect, i) => {
        const style = DEFECT_SEVERITY_STYLE[defect.severity ?? 'low'];
        const isSelected = selectedDefectId === i;
        const strokeWidth = isSelected ? 4 : 2.5;
        const fill = isSelected ? style.stroke : style.fill;
        const fillOpacity = isSelected ? 0.28 : 1;
        const common = {
          stroke: style.stroke,
          strokeWidth,
          fill,
          fillOpacity,
          vectorEffect: 'non-scaling-stroke' as const,
          style: { pointerEvents: 'auto' as const, cursor: 'help' as const },
          'aria-label': shapeAriaLabel(defect),
          // Visual tooltip is instant: capture the shape's on-screen rect so the
          // portal popup anchors to it (correct under SVG non-uniform scale/zoom).
          onMouseEnter: (e: ReactMouseEvent<SVGGeometryElement>) => {
            const el = e.currentTarget;
            setHovered({
              index: i,
              rect: el.getBoundingClientRect(),
              ...resolveTooltipColors(el),
            });
            onHoverDefect?.(i);
          },
          onMouseLeave: () => {
            setHovered((h) => (h?.index === i ? null : h));
            onHoverDefect?.(null);
          },
        };

        // `box` present → ellipse (hugs elongated areas); else center+radius circle.
        if (defect.box) {
          const { x, y, w, h } = defect.box;
          return (
            <ellipse
              key={i}
              cx={x + w / 2}
              cy={y + h / 2}
              rx={(w / 2) * DEFECT_OVAL_SCALE}
              ry={(h / 2) * DEFECT_OVAL_SCALE}
              {...common}
            />
          );
        }
        return (
          <circle
            key={i}
            cx={defect.center.x}
            cy={defect.center.y}
            r={defect.radius}
            {...common}
          />
        );
      })}
    </svg>
  );

  // Visual-only tooltip (aria-hidden so SR never reads `message`, PII §10).
  // Portaled to <body> to escape the sheet frame's overflow-hidden clip and to
  // sit above the z-4000 swapModal (Z_INDEX.tooltip = 4100).
  const tooltip =
    hovered && typeof document !== 'undefined'
      ? createPortal(
          <div
            aria-hidden
            role="presentation"
            // Portaled to <body> (outside the modal backdrop) → must be OPAQUE
            // and can't read --swap-modal-* vars (they don't cascade here), so it
            // uses the colors resolved off the in-modal shape at hover-time:
            // solid card surface (#14171f), matching the dark modal chrome rather
            // than the blue `bg-primary`.
            className="pointer-events-none fixed max-w-[280px] whitespace-normal rounded-md px-3 py-1.5 text-xs leading-snug shadow-lg"
            style={{
              zIndex: Z_INDEX.tooltip,
              backgroundColor: hovered.bg,
              color: hovered.text,
              border: `1px solid ${hovered.border}`,
              left: hovered.rect.left + hovered.rect.width / 2,
              top: hovered.rect.top - 8,
              transform: 'translate(-50%, -100%)',
            }}
          >
            {shapeTitle(defects[hovered.index])}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {svg}
      {tooltip}
    </>
  );
}
