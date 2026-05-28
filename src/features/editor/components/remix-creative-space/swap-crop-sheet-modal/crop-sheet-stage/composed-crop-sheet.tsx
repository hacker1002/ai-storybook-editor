// composed-crop-sheet.tsx — Renders a crop sheet client-side by composing each
// crop as an absolutely-positioned <img> inside a frame sized by the sheet's
// `sheet_geometry` (design 05-05-crop-sheet-layout-engine.md §7).
//
// The build API was removed (2026-05-19): `sheet.image_url` is now usually
// empty. The frame fills its container 100% — StageCanvas's canvas-inner owns
// the real pixel size (sheet_geometry × zoom). Each crop's box is positioned
// in percent so the whole sheet scales uniformly with the frame.
//
// rev6 — parametrized via `cropsSource`:
//   - 'before': render `sheet.crops[]` (CropEntry — same as before).
//   - 'after':  render `selectedSwap.crops[]` (SwapResultCrop, structurally
//     compatible — same `geometry` + `media_url`). When `selectedSwap.crops`
//     is empty but `selectedSwap.media_url` is present, fall back to a single
//     legacy <img> + English banner so older swap results still render.

import { useState } from 'react';
import { Check, ImageOff } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixCropSheet, CropEntry, SwapResult } from '@/types/remix';
import { COMPOSER_FRAME, resolveStrokePx } from '../swap-modal-constants';

const log = createLogger('Editor', 'ComposedCropSheet');

interface ComposedCropSheetProps {
  /** Sheet (BEFORE) geometry + crops source. AFTER uses sheet geometry only. */
  sheet: RemixCropSheet;
  /** Current zoom % — drives the parity stroke width (sheet-px × zoom/100). */
  zoomLevel: number;
  /** ⚡rev6 — which crops to compose. 'before' uses `sheet.crops[]`; 'after'
   *  uses `selectedSwap.crops[]`. Legacy fallback: 'after' with empty crops →
   *  single <img> covering the canvas-inner. Defaults to 'before' for callers
   *  not yet updated. */
  cropsSource?: 'before' | 'after';
  /** Required when `cropsSource === 'after'`. Provides the per-crop array AND
   *  the legacy `media_url` for the fallback path. */
  selectedSwap?: SwapResult | null;
  /** ⚡rev6 — show ordinal badge in left gutter. Defaults to true (BEFORE).
   *  AFTER hides this — the output sheet does not need 1-based nav indices. */
  showOrdinal?: boolean;

  // ⚡rev6 — Per-crop selection overlay (AFTER-only). The Stage gates this via
  // `effectiveSelectable` so we just forward; renderer only shows the checkbox
  // when `cropsSource === 'after'` AND `selectableSwapCrops === true`.
  /** When true, each composed crop renders a top-right checkbox overlay and a
   *  selected-state outline halo. */
  selectableSwapCrops?: boolean;
  /** Set of `${spread_id}/${id}` keys currently selected (re-swap targets). */
  selectedSwapCropKeys?: ReadonlySet<string>;
  /** Toggle callback fired by the checkbox; receives the `cropKey`. */
  onToggleSwapCropSelection?: (cropKey: string) => void;
}

/** The structural shape that `ComposedCrop` needs from either source. Keeping
 *  this internal lets us feed both `CropEntry` and `SwapResultCrop` without a
 *  runtime adapter — TS verifies the field set is a subset of both.
 *
 *  rev6 — `spread_id` + `id` added to derive `cropKey = ${spread_id}/${id}` for
 *  the selection overlay. Both source types already carry these fields. */
type RenderableCrop = Pick<CropEntry, 'spread_id' | 'id' | 'geometry' | 'media_url'> & {
  /** Optional — `CropEntry` has it, `SwapResultCrop` does not. Used as alt
   *  text + falls back to 'Crop'. */
  name?: string;
};

/** Composes a crop sheet over a frame sized by `sheet.sheet_geometry`. Branches
 *  on `cropsSource`:
 *  - 'before' → `sheet.crops[]`, ordinal badges shown by default.
 *  - 'after'  → `selectedSwap.crops[]`. When that array is empty AND a legacy
 *    `selectedSwap.media_url` exists, render the single-image fallback. */
export function ComposedCropSheet({
  sheet,
  zoomLevel,
  cropsSource = 'before',
  selectedSwap = null,
  showOrdinal,
  selectableSwapCrops = false,
  selectedSwapCropKeys,
  onToggleSwapCropSelection,
}: ComposedCropSheetProps) {
  const { width: sw, height: sh } = sheet.sheet_geometry;
  const strokePx = resolveStrokePx(zoomLevel);

  // ── Resolve crops to render based on `cropsSource` ─────────────────────────
  const isAfter = cropsSource === 'after';
  const cropsToRender: RenderableCrop[] = isAfter
    ? (selectedSwap?.crops ?? [])
    : sheet.crops;

  // Default: BEFORE shows ordinal, AFTER hides ordinal (per design — AFTER is
  // the output, no per-crop nav indices needed).
  const renderOrdinal = showOrdinal ?? !isAfter;

  // ⚡rev6 — Selection overlay is AFTER-only. The Stage gates via
  // `effectiveSelectable` (mode='batches' + non-compare + selectedSwap.crops>0)
  // but we re-gate here to keep BEFORE renders clean even if a caller forwards
  // the flag by accident.
  const enableSelection =
    isAfter && selectableSwapCrops && !!onToggleSwapCropSelection;

  // ── Legacy fallback (AFTER with empty crops but a media_url) ───────────────
  if (isAfter && cropsToRender.length === 0 && selectedSwap?.media_url) {
    log.debug('render', 'after legacy fallback — empty crops, single img', {
      hasCrops: false,
    });
    return <LegacySingleImageFallback url={selectedSwap.media_url} />;
  }

  // Degenerate guard: empty crops OR invalid sheet geometry.
  if (cropsToRender.length === 0 || sw <= 0 || sh <= 0) {
    log.debug('render', 'empty or degenerate sheet — placeholder', {
      cropsSource,
      crops: cropsToRender.length,
      sw,
      sh,
    });
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
        <ImageOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sheet trống</p>
        <p className="text-xs text-muted-foreground">
          {isAfter ? 'Swap result chưa có crop nào' : 'Sheet này chưa có crop nào'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {cropsToRender.map((crop, index) => {
        // Compute per-crop selection state. Defensive: if a key in
        // `selectedSwapCropKeys` does not match any crop here, we simply skip
        // it (the modal owns pruning the set on add-batch).
        const cropKey = `${crop.spread_id}/${crop.id}`;
        const isSelected = enableSelection
          ? (selectedSwapCropKeys?.has(cropKey) ?? false)
          : false;
        return (
          <ComposedCrop
            key={`crop-${index}`}
            crop={crop}
            // 1-based index — drawn as a badge for navigation. Order matches
            // `req.crops` (the order the composer processes + reports `skipped[]`
            // by), so the preview numbering lines up with the composed sheet.
            // AFTER renders pass `ordinal=null` to hide the badge.
            ordinal={renderOrdinal ? index + 1 : null}
            sheetWidth={sw}
            sheetHeight={sh}
            strokePx={strokePx}
            selectable={enableSelection}
            isSelected={isSelected}
            onToggleSelection={onToggleSwapCropSelection}
          />
        );
      })}
    </div>
  );
}

// ── ComposedCrop — one absolutely-positioned crop image ──────────────────────

interface ComposedCropProps {
  crop: RenderableCrop;
  /** 1-based ordinal shown as a badge in the left gutter; null hides it
   *  (AFTER render mode does not show per-crop nav indices). */
  ordinal: number | null;
  sheetWidth: number;
  sheetHeight: number;
  /** Zoom-scaled stroke width (CSS px) — drives both border + inflate. */
  strokePx: number;
  // ⚡rev6 — Selection overlay. All optional; absent → no checkbox, no outline.
  /** When true, render a top-right `SelectionCheckbox`. Gated upstream by
   *  `enableSelection` (cropsSource='after' && selectableSwapCrops). */
  selectable?: boolean;
  /** Drives `aria-checked` + accent visuals + wrapper outline halo. */
  isSelected?: boolean;
  /** Toggle callback — receives the `${spread_id}/${id}` cropKey. */
  onToggleSelection?: (cropKey: string) => void;
}

/** A single crop placed at `geometry / sheet_geometry * 100%`. Keeps its own
 *  error state so a 404 shows a per-crop placeholder without breaking siblings.
 *
 *  Wrapper inflates the crop slot by `cellStrokeWidthPx` on every side and
 *  draws a same-width `cellStrokeColor` border (border-box), reproducing the
 *  composer's per-cell outer stroke. The wrapper is filled with `gutterColor`
 *  so transparent PNG areas read as that colour — matching the flattened PNG
 *  the Python composer bakes (NOT a checkerboard). The ordinal badge sits in
 *  the left gutter strip (see `OrdinalBadge`).
 *
 *  rev6 — When `selectable` + `onToggleSelection` are both supplied, renders a
 *  top-right `SelectionCheckbox` (fixed 22×22 px, zoom-independent) and adds
 *  an accent outline + halo around the wrapper while `isSelected`. The accent
 *  outline does NOT replace the composer border — it sits OUTSIDE it (CSS
 *  `outline` paints outside `border`), preserving composer parity. */
function ComposedCrop({
  crop,
  ordinal,
  sheetWidth,
  sheetHeight,
  strokePx,
  selectable = false,
  isSelected = false,
  onToggleSelection,
}: ComposedCropProps) {
  const [errored, setErrored] = useState(false);
  const { x, y, w, h } = crop.geometry;
  const cropKey = `${crop.spread_id}/${crop.id}`;

  const stroke = strokePx;
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${(x / sheetWidth) * 100}% - ${stroke}px)`,
    top: `calc(${(y / sheetHeight) * 100}% - ${stroke}px)`,
    width: `calc(${(w / sheetWidth) * 100}% + ${stroke * 2}px)`,
    height: `calc(${(h / sheetHeight) * 100}% + ${stroke * 2}px)`,
    // CropEntry (rev2) / SwapResultCrop has no per-crop z-index/variant — crops
    // are stacked in array order (later crops paint on top via DOM order).
    boxSizing: 'border-box',
    borderStyle: 'solid',
    borderWidth: stroke,
    borderColor: COMPOSER_FRAME.cellStrokeColor,
    backgroundColor: COMPOSER_FRAME.gutterColor,
  };

  // rev6 — Selected-state outline halo. Paints OUTSIDE the composer border, so
  // the per-cell stroke parity is preserved. Hex matches `--swap-modal-accent`
  // for visual consistency with the primary action button.
  if (isSelected) {
    wrapperStyle.outline = '2px solid #3b6cf6';
    wrapperStyle.boxShadow = '0 0 0 2px rgba(59, 108, 246, 0.35)';
  }

  // Selection checkbox is rendered iff caller wired the toggle handler.
  const showCheckbox = selectable && !!onToggleSelection;

  if (errored) {
    return (
      <div
        style={wrapperStyle}
        className="flex flex-col items-center justify-center gap-1"
      >
        {ordinal !== null && <OrdinalBadge ordinal={ordinal} />}
        <ImageOff className="h-6 w-6 text-white/70" />
        <span className="text-[10px] text-white/70">Ảnh lỗi</span>
        {showCheckbox && (
          <SelectionCheckbox
            cropKey={cropKey}
            isSelected={isSelected}
            onToggle={onToggleSelection!}
          />
        )}
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      {ordinal !== null && <OrdinalBadge ordinal={ordinal} />}
      <img
        src={crop.media_url}
        alt={crop.name || 'Crop'}
        onError={() => {
          log.warn('ComposedCrop', 'crop image failed to load', {
            // Log only the path tail — full URL may carry signed tokens (PII).
            urlTail: crop.media_url.slice(crop.media_url.lastIndexOf('/') + 1),
          });
          setErrored(true);
        }}
        className="h-full w-full"
      />
      {showCheckbox && (
        <SelectionCheckbox
          cropKey={cropKey}
          isSelected={isSelected}
          onToggle={onToggleSelection!}
        />
      )}
    </div>
  );
}

// ── SelectionCheckbox — per-crop AFTER overlay (rev6) ────────────────────────

interface SelectionCheckboxProps {
  cropKey: string;
  isSelected: boolean;
  onToggle: (cropKey: string) => void;
}

/** Fixed 22×22 px checkbox overlay (zoom-independent — `canvas-inner` uses
 *  `width/height`, NOT `transform: scale`, so CSS px stay constant at every
 *  zoom). Padding 2px gives a ~26px hit target (≥24 a11y guideline).
 *
 *  a11y: `role="checkbox"` + `aria-checked` + `aria-label`; keyboard `Space`
 *  and `Enter` both call `preventDefault()` then toggle. `tabIndex=0` puts the
 *  checkbox in the natural DOM-order tab cycle (which matches the on-screen
 *  crop array order). */
function SelectionCheckbox({
  cropKey,
  isSelected,
  onToggle,
}: SelectionCheckboxProps) {
  const handleToggle = () => {
    // Log only the cropKey + next state — media_url MUST NOT leak.
    log.debug('toggle', 'crop selection toggled', {
      cropKey,
      next: !isSelected,
    });
    onToggle(cropKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      // Block page scroll on Space and form-submit semantics on Enter.
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label="Mark this crop to re-swap"
      tabIndex={0}
      onClick={(e) => {
        // Don't bubble — the wrapper has no listener today but future-proof
        // against ancestor click handlers (e.g. select-spread).
        e.stopPropagation();
        handleToggle();
      }}
      onKeyDown={handleKeyDown}
      // padding inflates the hit area to 26px while keeping the visible chip
      // exactly 22×22 px (Tailwind h-[22px] / w-[22px]).
      style={{ padding: 2 }}
      className={cn(
        'absolute right-1 top-1 z-30 flex h-[22px] w-[22px]',
        'cursor-pointer items-center justify-center rounded-md border-2 transition-colors',
        isSelected
          ? 'border-[#3b6cf6] bg-[#3b6cf6] text-white'
          : 'border-white/70 bg-black/60 text-transparent hover:bg-black/80',
      )}
    >
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

// ── OrdinalBadge — crop index, in the left gutter, top-aligned ────────────────

/** Frontend-only crop index (the composer bakes no ordinals). FIXED size,
 *  zoom-independent — the modal scales the sheet via container width/height,
 *  not `transform`, so `text-sm`/`px-1.5` stay constant at every zoom.
 *
 *  Always rendered in the left separating strip (`-translate-x-full` lifts it
 *  fully out of the cell) so it never overlaps artwork. The layout engine's
 *  widened left margin guarantees gutter room for the first column, so even
 *  column-1 badges stay inside the sheet without clipping. */
function OrdinalBadge({ ordinal }: { ordinal: number }) {
  return (
    <span
      className="pointer-events-none absolute left-0 top-0 z-20 -translate-x-full rounded-l-md rounded-r-none bg-black/85 px-1.5 py-0.5 text-sm font-bold leading-none tabular-nums text-white shadow-sm"
      aria-hidden="true"
    >
      {ordinal}
    </span>
  );
}

// ── LegacySingleImageFallback — AFTER render mode, pre-rev6 swap results ─────

/** Legacy fallback for an AFTER render when `selectedSwap.crops[]` is empty
 *  but `selectedSwap.media_url` is present (pre-rev6 swap results that pre-date
 *  the per-crop re-cut pipeline). Renders the single image full-size with an
 *  English banner explaining per-crop selection is unavailable.
 *
 *  Banner copy locked by Validation Session 1 Q4 — keep ENGLISH:
 *    `Legacy swap — per-crop selection unavailable` */
function LegacySingleImageFallback({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="relative h-full w-full">
      {errored ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <ImageOff className="h-8 w-8 text-white/70" />
          <span className="text-xs text-white/70">Ảnh lỗi</span>
        </div>
      ) : (
        <img
          src={url}
          alt="Legacy swap result"
          onError={() => {
            log.warn('LegacySingleImageFallback', 'image failed to load', {
              urlTail: url.slice(url.lastIndexOf('/') + 1),
            });
            setErrored(true);
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
      <span
        // English banner — locked copy per Validation S1 Q4. Card-bg token over
        // the image for legibility; same surface treatment as Before/After
        // badges in CompareBody.
        className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-2 py-0.5 text-xs text-[var(--swap-modal-text-secondary)]"
      >
        Legacy swap — per-crop selection unavailable
      </span>
    </div>
  );
}
