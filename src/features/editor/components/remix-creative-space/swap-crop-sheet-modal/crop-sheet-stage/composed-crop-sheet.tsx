// composed-crop-sheet.tsx — Renders a crop sheet client-side by composing each
// crop as an absolutely-positioned <img> inside a frame sized by the sheet's
// `sheet_geometry` (design 05-05 §7 + 05-03 §4.1).
//
// ⚡2026-06-12 (pipeline 3 stage):
//   - `composeMode` ('ordinal' | 'plain') — BEFORE treatment. `ordinal` keeps
//     the composer-parity stroke + ordinal badges (Gemini needs the numbers);
//     `plain` renders bare crops (parity with job 09's plain compose).
//   - `afterComposeMode` — AFTER source priority per stage:
//       'crops-or-sheet' (mixes/Sprites): compose crops; legacy 1-img fallback.
//       'sheet-or-crops' (rmbgs): persisted sheet RGBA 1-img FAST PATH wins;
//         selection/ownership overlays render as transparent geometry boxes.
//       'crops-only' (upscales): always compose crops (`media_url` null);
//         print-dim pieces FIT-IN-BOX (object-contain), never stretched.
//   - Lean join: swap crops carry NO geometry/tags — AFTER joins
//     `sheet.original_crops[]` by `(spread_id, id)`; orphans skip + warn.
//     (Sprite swap crops still carry geometry — used directly when present.)
//   - Checkerboard is DARK on every tab (validation S1).

import { useState } from 'react';
import { Check, ImageOff } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { CropSheetBase, SwapResultBase } from '@/types/remix';
import { COMPOSER_FRAME, resolveStrokePx } from '../swap-modal-constants';
import type {
  StageAfterComposeMode,
  StageComposeMode,
} from '../stage-tab-config';
import type { CropOwnershipState } from '../hooks/use-crop-ownership';
import { StarBadge } from './star-badge';
import { TakeBackOverlay } from './take-back-overlay';

// Checkerboard background behind every crop (⚡2026-06-12, validation S1:
// every tab; essential for RGBA review on the rmbg/upscale stages). LIGHT
// gray-white caro — the app-wide standard pattern (image-zoom-preview /
// edit-image / erase-image / segment-layer modals), 16px tile.
// Zoom-independent (modal scales via width/height, not `transform`).
const CHECKERBOARD_BACKGROUND_IMAGE =
  'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%)';
const CHECKERBOARD_BACKGROUND_SIZE = '16px 16px';

const log = createLogger('Editor', 'ComposedCropSheet');

/** The structural shape `ComposedCrop` needs from EITHER plane's crop entry.
 *  Plane-discriminant fields are optional so both the mix crops
 *  (`CropEntry`/`SwapResultCrop` — carry `spread_id`/`id`) and the sprite crops
 *  (`SpriteCrop`/`SwapResultSpriteCrop` — carry `type`/`object_key`/`variant_key`)
 *  structurally assign. `geometry` is optional: LEAN mix swap crops carry none
 *  — the AFTER renderer joins `original_crops[]` by cropKey instead. */
export type RenderableCrop = {
  geometry?: { x: number; y: number; w: number; h: number };
  media_url: string;
  /** Alt text — swap crops do not carry names. Falls back to 'Crop'. */
  name?: string;
  // ── mix plane discriminants ──
  spread_id?: string;
  id?: string;
  // ── sprite plane discriminants ──
  type?: string;
  object_key?: string;
  variant_key?: string;
};

/** Stage sheet/swap shapes — accept BOTH planes (mix + sprite) via the shared
 *  generic base over `RenderableCrop`. */
export type StageSheet = CropSheetBase<RenderableCrop, RenderableCrop>;
export type StageSwapResult = SwapResultBase<RenderableCrop>;

/** Default cropKey accessor — mix plane `${spread_id}/${id}` (backward
 *  compatible: callers that omit `cropKeyOf` keep the exact mix key). */
const defaultMixCropKey = (crop: RenderableCrop): string =>
  `${crop.spread_id ?? ''}/${crop.id ?? ''}`;

/** A swap crop resolved against the sheet's original_crops — render-ready. */
interface ResolvedAfterCrop {
  crop: RenderableCrop;
  cropKey: string;
  geometry: { x: number; y: number; w: number; h: number };
}

interface ComposedCropSheetProps {
  /** Sheet (BEFORE) geometry + crops source. AFTER uses sheet geometry only. */
  sheet: StageSheet;
  /** Current zoom % — drives the parity stroke width (sheet-px × zoom/100). */
  zoomLevel: number;
  /** ⚡rev6 — which crops to compose. 'before' uses `sheet.original_crops[]`;
   *  'after' uses `selectedSwap.crops[]` ⋈ original. Defaults to 'before'. */
  cropsSource?: 'before' | 'after';
  /** Required when `cropsSource === 'after'`. */
  selectedSwap?: StageSwapResult | null;
  /** Per-crop key accessor — `${spread_id}/${id}` (mix, default) or
   *  `${type}/${object_key}/${variant_key}` (sprite). Drives the lean AFTER
   *  join, selection set lookup, ownership lookup, and callback payloads. */
  cropKeyOf?: (crop: RenderableCrop) => string;
  /** ⚡2026-06-12 — BEFORE treatment per stage (`STAGE_TAB_CONFIG`).
   *  Default 'ordinal' (mixes/Sprites parity). */
  composeMode?: StageComposeMode;
  /** ⚡2026-06-12 — AFTER source priority per stage. Default 'crops-or-sheet'. */
  afterComposeMode?: StageAfterComposeMode;
  /** Show ordinal badges (BEFORE default under 'ordinal'); AFTER hides them. */
  showOrdinal?: boolean;

  // ⚡rev6 — Per-crop selection overlay (AFTER-only).
  selectableSwapCrops?: boolean;
  selectedSwapCropKeys?: ReadonlySet<string>;
  onToggleSwapCropSelection?: (cropKey: string) => void;

  // ⚡rev7 — Ownership UI (AFTER non-compare only) — see ComposedCrop.
  getOwnership?: (cropKey: string) => CropOwnershipState;
  onTakeBack?: (cropKey: string) => void;
  takeBackDisabled?: boolean;
}

/** Composes a crop sheet over a frame sized by `sheet.sheet_geometry`. */
export function ComposedCropSheet({
  sheet,
  zoomLevel,
  cropsSource = 'before',
  selectedSwap = null,
  cropKeyOf = defaultMixCropKey,
  composeMode = 'ordinal',
  afterComposeMode = 'crops-or-sheet',
  showOrdinal,
  selectableSwapCrops = false,
  selectedSwapCropKeys,
  onToggleSwapCropSelection,
  getOwnership,
  onTakeBack,
  takeBackDisabled = false,
}: ComposedCropSheetProps) {
  const { width: sw, height: sh } = sheet.sheet_geometry;
  const isPlain = composeMode === 'plain';
  // Plain mode: no composer stroke (job 09 parity — strokes would read as part
  // of the RGBA foreground).
  const strokePx = isPlain ? 0 : resolveStrokePx(zoomLevel);

  const isAfter = cropsSource === 'after';
  // Ordinal badges: only in 'ordinal' compose mode, BEFORE renders by default.
  const renderOrdinal = (showOrdinal ?? !isAfter) && !isPlain;

  const enableSelection =
    isAfter && selectableSwapCrops && !!onToggleSwapCropSelection;
  const enableOwnership = isAfter && !!getOwnership;

  // ── AFTER: resolve swap crops against original_crops (lean join) ───────────
  const afterEntries: ResolvedAfterCrop[] = [];
  if (isAfter) {
    const originalByKey = new Map<string, RenderableCrop>();
    for (const o of sheet.original_crops) originalByKey.set(cropKeyOf(o), o);
    for (const crop of selectedSwap?.crops ?? []) {
      const cropKey = cropKeyOf(crop);
      // Sprite swap crops still carry geometry; lean mix/stage crops join.
      const geometry = crop.geometry ?? originalByKey.get(cropKey)?.geometry;
      if (!geometry) {
        log.warn('render', 'orphan swap crop — no original geometry, skip', {
          cropKey,
        });
        continue;
      }
      afterEntries.push({ crop, cropKey, geometry });
    }
  }

  // Degenerate sheet guard (both render modes).
  if (sw <= 0 || sh <= 0) {
    log.debug('render', 'degenerate sheet geometry — placeholder', { sw, sh });
    return <EmptySheetPlaceholder isAfter={isAfter} afterComposeMode={afterComposeMode} />;
  }

  if (isAfter) {
    // 'sheet-or-crops' (rmbgs): persisted sheet RGBA wins as a 1-img fast
    // path. Selection/ownership overlays render as TRANSPARENT geometry boxes
    // (no child <img>) so per-crop affordances still work on the flat sheet.
    if (afterComposeMode === 'sheet-or-crops' && selectedSwap?.media_url) {
      return (
        <SheetImageFastPath
          url={selectedSwap.media_url}
          entries={afterEntries}
          sheetWidth={sw}
          sheetHeight={sh}
          enableSelection={enableSelection}
          selectedSwapCropKeys={selectedSwapCropKeys}
          onToggleSwapCropSelection={onToggleSwapCropSelection}
          getOwnership={enableOwnership ? getOwnership : undefined}
          onTakeBack={onTakeBack}
          takeBackDisabled={takeBackDisabled}
        />
      );
    }

    // 'crops-or-sheet' legacy fallback: empty crops + a media_url → 1 img.
    if (
      afterComposeMode === 'crops-or-sheet' &&
      afterEntries.length === 0 &&
      selectedSwap?.media_url
    ) {
      log.debug('render', 'after legacy fallback — empty crops, single img', {});
      return <LegacySingleImageFallback url={selectedSwap.media_url} />;
    }

    if (afterEntries.length === 0) {
      return (
        <EmptySheetPlaceholder isAfter afterComposeMode={afterComposeMode} />
      );
    }

    // 'crops-only' (upscales): print dims ≠ layout box → fit-in-box.
    const fitInBox = afterComposeMode === 'crops-only';
    return (
      <div className="relative h-full w-full">
        {afterEntries.map(({ crop, cropKey, geometry }) => {
          const isSelected = enableSelection
            ? (selectedSwapCropKeys?.has(cropKey) ?? false)
            : false;
          const ownership = enableOwnership ? getOwnership!(cropKey) : null;
          return (
            <ComposedCrop
              key={cropKey}
              crop={crop}
              cropKey={cropKey}
              geometry={geometry}
              ordinal={null}
              sheetWidth={sw}
              sheetHeight={sh}
              strokePx={strokePx}
              fitInBox={fitInBox}
              selectable={enableSelection}
              isSelected={isSelected}
              onToggleSelection={onToggleSwapCropSelection}
              ownership={ownership}
              onTakeBack={onTakeBack}
              takeBackDisabled={takeBackDisabled}
            />
          );
        })}
      </div>
    );
  }

  // ── BEFORE: compose original_crops (ordinal parity / plain per stage) ─────
  if (sheet.original_crops.length === 0) {
    return <EmptySheetPlaceholder isAfter={false} afterComposeMode={afterComposeMode} />;
  }
  return (
    <div className="relative h-full w-full">
      {sheet.original_crops.map((crop, index) => (
        <ComposedCrop
          key={cropKeyOf(crop)}
          crop={crop}
          cropKey={cropKeyOf(crop)}
          geometry={crop.geometry ?? { x: 0, y: 0, w: 0, h: 0 }}
          // 1-based index — drawn as a badge for navigation. Order matches
          // `req.crops` so preview numbering lines up with the composed sheet.
          ordinal={renderOrdinal ? index + 1 : null}
          sheetWidth={sw}
          sheetHeight={sh}
          strokePx={strokePx}
        />
      ))}
    </div>
  );
}

// ── EmptySheetPlaceholder ────────────────────────────────────────────────────

function EmptySheetPlaceholder({
  isAfter,
  afterComposeMode,
}: {
  isAfter: boolean;
  afterComposeMode: StageAfterComposeMode;
}) {
  const detail = !isAfter
    ? 'Sheet này chưa có crop nào'
    : afterComposeMode === 'crops-only'
      ? 'No upscale result yet'
      : 'Swap result chưa có crop nào';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
      <ImageOff className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Sheet trống</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

// ── SheetImageFastPath — rmbgs AFTER (persisted RGBA sheet, 1 img) ───────────

interface SheetImageFastPathProps {
  url: string;
  entries: ResolvedAfterCrop[];
  sheetWidth: number;
  sheetHeight: number;
  enableSelection: boolean;
  selectedSwapCropKeys?: ReadonlySet<string>;
  onToggleSwapCropSelection?: (cropKey: string) => void;
  getOwnership?: (cropKey: string) => CropOwnershipState;
  onTakeBack?: (cropKey: string) => void;
  takeBackDisabled?: boolean;
}

/** Full-sheet RGBA <img> + transparent per-crop overlay boxes (geometry from
 *  the lean join) carrying the selection checkbox / ownership affordances.
 *  The boxes render NO child image — the flat sheet already shows the art. */
function SheetImageFastPath({
  url,
  entries,
  sheetWidth,
  sheetHeight,
  enableSelection,
  selectedSwapCropKeys,
  onToggleSwapCropSelection,
  getOwnership,
  onTakeBack,
  takeBackDisabled = false,
}: SheetImageFastPathProps) {
  const [errored, setErrored] = useState(false);
  const showOverlays = enableSelection || !!getOwnership;

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
          alt=""
          onError={() => {
            log.warn('SheetImageFastPath', 'sheet image failed to load', {
              urlTail: url.slice(url.lastIndexOf('/') + 1),
            });
            setErrored(true);
          }}
          className="absolute inset-0 h-full w-full"
        />
      )}
      {showOverlays &&
        entries.map(({ cropKey, geometry }) => {
          const isSelected = enableSelection
            ? (selectedSwapCropKeys?.has(cropKey) ?? false)
            : false;
          const ownership = getOwnership ? getOwnership(cropKey) : null;
          const isOwnedCurrent = ownership?.state === 'owned-current';
          const isOwnedForeign = ownership?.state === 'owned-foreign';
          const wireTakeBack = isOwnedForeign && !!onTakeBack;
          const showCheckbox =
            enableSelection && !!onToggleSwapCropSelection && !wireTakeBack;
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${(geometry.x / sheetWidth) * 100}%`,
            top: `${(geometry.y / sheetHeight) * 100}%`,
            width: `${(geometry.w / sheetWidth) * 100}%`,
            height: `${(geometry.h / sheetHeight) * 100}%`,
          };
          if (isSelected) {
            style.outline = '2px solid #3b6cf6';
            style.boxShadow = '0 0 0 2px rgba(59, 108, 246, 0.35)';
          }
          return (
            <div
              key={cropKey}
              style={style}
              className={cn('group', isOwnedForeign && 'opacity-40 saturate-50')}
            >
              {isOwnedCurrent && <StarBadge />}
              {showCheckbox && (
                <SelectionCheckbox
                  cropKey={cropKey}
                  isSelected={isSelected}
                  onToggle={onToggleSwapCropSelection!}
                />
              )}
              {wireTakeBack && (
                <TakeBackOverlay
                  cropKey={cropKey}
                  ownerBatchName={ownership!.ownerBatchName}
                  disabled={takeBackDisabled}
                  onTakeBack={onTakeBack!}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

// ── ComposedCrop — one absolutely-positioned crop image ──────────────────────

interface ComposedCropProps {
  crop: RenderableCrop;
  /** Pre-derived cropKey (via `cropKeyOf`). */
  cropKey: string;
  /** Resolved geometry (own — sprite plane — or joined from original_crops). */
  geometry: { x: number; y: number; w: number; h: number };
  /** 1-based ordinal in the left gutter; null hides it (AFTER / plain). */
  ordinal: number | null;
  sheetWidth: number;
  sheetHeight: number;
  /** Zoom-scaled stroke width (CSS px); 0 = plain mode (no composer border). */
  strokePx: number;
  /** ⚡2026-06-12 (upscales) — img object-contain inside the layout box (print
   *  dims ≠ box; never stretch). Default false (fill). */
  fitInBox?: boolean;
  // ⚡rev6 — Selection overlay. All optional; absent → no checkbox, no outline.
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (cropKey: string) => void;
  // ⚡rev7 — Ownership UI. `ownership=null` disables both badges.
  ownership?: CropOwnershipState | null;
  onTakeBack?: (cropKey: string) => void;
  takeBackDisabled?: boolean;
}

/** A single crop placed at `geometry / sheet_geometry * 100%`. Keeps its own
 *  error state so a 404 shows a per-crop placeholder without breaking siblings.
 *
 *  In 'ordinal' mode the wrapper inflates by the stroke width and draws the
 *  composer-parity border; 'plain' mode (strokePx 0) renders bare. The wrapper
 *  background is the DARK CSS checkerboard so transparent PNG areas read as
 *  the tiled pattern on every stage. */
function ComposedCrop({
  crop,
  cropKey,
  geometry,
  ordinal,
  sheetWidth,
  sheetHeight,
  strokePx,
  fitInBox = false,
  selectable = false,
  isSelected = false,
  onToggleSelection,
  ownership = null,
  onTakeBack,
  takeBackDisabled = false,
}: ComposedCropProps) {
  const [errored, setErrored] = useState(false);
  const { x, y, w, h } = geometry;

  const stroke = strokePx;
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${(x / sheetWidth) * 100}% - ${stroke}px)`,
    top: `calc(${(y / sheetHeight) * 100}% - ${stroke}px)`,
    width: `calc(${(w / sheetWidth) * 100}% + ${stroke * 2}px)`,
    height: `calc(${(h / sheetHeight) * 100}% + ${stroke * 2}px)`,
    boxSizing: 'border-box',
    backgroundImage: CHECKERBOARD_BACKGROUND_IMAGE,
    backgroundSize: CHECKERBOARD_BACKGROUND_SIZE,
  };
  if (stroke > 0) {
    wrapperStyle.borderStyle = 'solid';
    wrapperStyle.borderWidth = stroke;
    wrapperStyle.borderColor = COMPOSER_FRAME.cellStrokeColor;
  }

  // rev6 — Selected-state outline halo (paints OUTSIDE the composer border).
  if (isSelected) {
    wrapperStyle.outline = '2px solid #3b6cf6';
    wrapperStyle.boxShadow = '0 0 0 2px rgba(59, 108, 246, 0.35)';
  }

  const isOwnedCurrent = ownership?.state === 'owned-current';
  const isOwnedForeign = ownership?.state === 'owned-foreign';

  // ⚡rev7 — Top-right slot mutex: foreign → take-back chip ONLY.
  const wireTakeBack = isOwnedForeign && !!onTakeBack;
  const showCheckbox = selectable && !!onToggleSelection && !wireTakeBack;

  const wrapperClasses = cn(
    'group',
    isOwnedForeign && 'opacity-40 saturate-50',
  );

  if (errored) {
    return (
      <div
        style={wrapperStyle}
        className={cn(
          wrapperClasses,
          'flex flex-col items-center justify-center gap-1',
        )}
      >
        {ordinal !== null && <OrdinalBadge ordinal={ordinal} />}
        {isOwnedCurrent && <StarBadge />}
        <ImageOff className="h-6 w-6 text-white/70" />
        <span className="text-[10px] text-white/70">Ảnh lỗi</span>
        {showCheckbox && (
          <SelectionCheckbox
            cropKey={cropKey}
            isSelected={isSelected}
            onToggle={onToggleSelection!}
          />
        )}
        {wireTakeBack && (
          <TakeBackOverlay
            cropKey={cropKey}
            ownerBatchName={ownership!.ownerBatchName}
            disabled={takeBackDisabled}
            onTakeBack={onTakeBack!}
          />
        )}
      </div>
    );
  }

  return (
    <div style={wrapperStyle} className={wrapperClasses}>
      {ordinal !== null && <OrdinalBadge ordinal={ordinal} />}
      {isOwnedCurrent && <StarBadge />}
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
        // fit-in-box (upscales): print dims ≠ layout box — contain + center.
        className={cn('h-full w-full', fitInBox && 'object-contain')}
      />
      {showCheckbox && (
        <SelectionCheckbox
          cropKey={cropKey}
          isSelected={isSelected}
          onToggle={onToggleSelection!}
        />
      )}
      {wireTakeBack && (
        <TakeBackOverlay
          cropKey={cropKey}
          ownerBatchName={ownership!.ownerBatchName}
          disabled={takeBackDisabled}
          onTakeBack={onTakeBack!}
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
 *  `width/height`, NOT `transform: scale`). Padding 2px gives a ~26px hit
 *  target. a11y: role=checkbox + aria-checked; Space/Enter toggle. */
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
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label="Mark this crop to re-run"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
      onKeyDown={handleKeyDown}
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
 *  zoom-independent. Always rendered in the left separating strip
 *  (`-translate-x-full`) so it never overlaps artwork. */
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

/** Legacy fallback for a 'crops-or-sheet' AFTER when `selectedSwap.crops[]` is
 *  empty but a `media_url` exists (pre-rev6 results). Banner copy locked by
 *  Validation S1 Q4 — keep ENGLISH. */
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
        className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-2 py-0.5 text-xs text-[var(--swap-modal-text-secondary)]"
      >
        Legacy swap — per-crop selection unavailable
      </span>
    </div>
  );
}
