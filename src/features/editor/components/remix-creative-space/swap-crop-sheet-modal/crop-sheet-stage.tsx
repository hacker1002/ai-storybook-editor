// crop-sheet-stage.tsx — Center stage of SwapCropSheetModal (design §3.3).
//
// rev2 (Phase 09): generic stage reused by BOTH the Variants and Batches tabs.
// The tab supplies the primary header action (`headerPrimary` — "Generate" for
// Variants, "Swap" for Batches) and a discriminated `source`:
//   - variants: before/after are plain portrait image URLs.
//   - batches:  before = composed crop sheet (crops[] + sheet_geometry),
//               after  = the selected swap-result image URL.
//
// StageHeader: tab-supplied primary button + Compare toggle [▣] + zoom slider.
// StageCanvas: renders the active "before" (img | ComposedCropSheet) alone, or
// in a before/after react-compare-slider when Compare is on and an "after"
// image exists. Compare is disabled until an "after" is available.
//
// Slider engine: react-compare-slider@4 has no controlled `position` prop, only
// uncontrolled `defaultPosition`. `dividerPosition` is therefore an init value;
// the inner body is keyed by the after URL so a parent reset re-applies it.

import { useRef } from 'react';
import { ReactCompareSlider } from 'react-compare-slider';
import {
  Columns2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/utils';
import { ZoomControl } from '../../shared-components/zoom-control';
import { createLogger } from '@/utils/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  SwapPreviewState,
  BatchSwapTaskStatus,
  SwapDefect,
} from '@/types/remix';
import { ZOOM, HEADER_HEIGHT_PX, Z_INDEX } from './swap-modal-constants';
import { DefectOverlay } from './crop-sheet-stage/defect-overlay';

// Lift in-modal tooltips above the z-4000 swapModal (shared TooltipContent ships
// at z-50, otherwise occluded). ⚡2026-06-26 (see Z_INDEX.tooltip).
const TOOLTIP_CONTENT_STYLE = { zIndex: Z_INDEX.tooltip };
import type {
  StageAfterComposeMode,
  StageComposeMode,
} from './stage-tab-config';
import { ComposedCropSheet } from './crop-sheet-stage/composed-crop-sheet';
import type {
  RenderableCrop,
  StageSheet,
  StageSwapResult,
} from './crop-sheet-stage/composed-crop-sheet';
import { useStageZoom } from './crop-sheet-stage/use-stage-zoom';

const log = createLogger('Editor', 'CropSheetStage');

// ── Public contract (imported by VariantsTab/BatchesTab — Phase 07/08) ───────

/** Tab-supplied primary action rendered at the left of the stage header.
 *  Variants → "Generate"/"Retry"; Batches → "Swap". */
export interface StageHeaderPrimary {
  label: string;
  /** Optional leading icon; hidden while busy (spinner takes its place). */
  icon?: LucideIcon;
  disabled: boolean;
  /** Optional gating reason shown as a tooltip when present. */
  tooltip?: string;
  /** Spinner + aria-busy while the action is in flight. */
  busy?: boolean;
  onClick: () => void;
}

/** Discriminated before/after source. The tab owns deriving these.
 *
 *  rev6 — batches mode now carries the full `selectedSwap: SwapResult | null`
 *  (was `selectedSwapUrl: string | null`). The stage composes the AFTER side
 *  from `selectedSwap.crops[]` instead of rendering a single <img>, so it needs
 *  the array (not just the URL). The legacy `media_url` is reached via
 *  `selectedSwap.media_url` (used by the compare-slider key + the legacy
 *  single-image fallback when `crops[]` is empty). */
// `batches` mode is reused by BOTH the Batches (mix) and Variants (sprite) tabs
// — the sheet/swap shapes are the shared generic base (`StageSheet`/
// `StageSwapResult`), so `RemixCropSheet`/`RemixSpriteCropSheet` both assign.
export type StageSource =
  | { mode: 'variants'; beforeUrl: string | null; afterUrl: string | null }
  | {
      mode: 'batches';
      sheet: StageSheet | null;
      selectedSwap: StageSwapResult | null;
    };

export interface CropSheetStageProps {
  source: StageSource;
  /** Optional primary action button rendered at the left of the stage header.
   *  ⚡2026-06-26: NO tab supplies this anymore — all 4 tabs (Sprites + the 3
   *  stage tabs) moved their Swap/Remove BG/Upscale action into the per-row
   *  sidebar buttons. Kept as a reserved header-action slot for a future tab;
   *  `StageHeader` renders `PrimaryActionButton` only when present. */
  headerPrimary?: StageHeaderPrimary;
  /** Optional extra header actions rendered AFTER the Compare toggle (e.g. the
   *  Sprites tab's read-only "Settings" review button). Tab-supplied node so the
   *  Stage stays presentational. */
  headerActions?: React.ReactNode;
  // Shared view state (owned by the modal root, passed through the tab):
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  /** Busy/error overlay source.
   *  - variants: per-variant `SwapPreviewState` (status loading|error).
   *  - batches:  per-batch `BatchSwapTaskStatus` (state running|error). */
  swapTask?: SwapPreviewState | BatchSwapTaskStatus;
  /** Batches only — true while the enqueue POST is in flight ("Starting swap…"
   *  before the job's running state takes over). Ignored in variants mode. */
  isSubmitting?: boolean;
  /** ⚡2026-06-12 — BEFORE compose treatment (STAGE_TAB_CONFIG[stage]):
   *  'ordinal' (default — mixes/Sprites parity) | 'plain' (rmbgs/upscales). */
  composeMode?: StageComposeMode;
  /** ⚡2026-06-12 — AFTER source priority (STAGE_TAB_CONFIG[stage]). Default
   *  'crops-or-sheet'. */
  afterComposeMode?: StageAfterComposeMode;
  /** ⚡2026-06-12 — overlay copy per stage. `runningLabel` formats the busy
   *  progress line; `submittingLabel` shows during the enqueue POST. Defaults
   *  keep the historical Swap copy. */
  runningLabel?: (current: number, total: number) => string;
  submittingLabel?: string;
  onToggleCompare: () => void;
  onZoomChange: (zoom: number) => void;
  onDividerChange: (pos: number) => void;

  // ⚡rev6 — Selective add-batch (AFTER selection overlay). Batches-only; the
  // Variants and Lotties tabs leave these undefined. The Stage re-gates on
  // mode + selectedSwap.crops + non-compare via `effectiveSelectable` and only
  // forwards to the AFTER `ComposedCropSheet`. Selection state itself lives in
  // a `<SelectionProvider>` owned by the modal (Phase 04).
  /** Caller intent — passes `true` when the modal is in a state where the user
   *  can mark crops for re-swap (e.g. swap completed, not submitting, not
   *  running). Stage re-gates on its own preconditions. */
  selectableSwapCrops?: boolean;
  /** Set of cropKeys currently selected by the user (scheme = `cropKeyOf`). */
  selectedSwapCropKeys?: ReadonlySet<string>;
  /** Toggle callback fired by per-crop checkboxes; receives the `cropKey`. */
  onToggleSwapCropSelection?: (cropKey: string) => void;
  /** Per-crop key accessor forwarded to `ComposedCropSheet`. Absent → mix key
   *  `${spread_id}/${id}` (Batches default, backward compatible). The Variants
   *  tab passes `${type}/${object_key}/${variant_key}`. */
  cropKeyOf?: (crop: RenderableCrop) => string;

  // ⚡rev7 — Cross-plane ownership overlay (AFTER non-compare only). Stage gates
  // on the same preconditions as the rev6 selection overlay; the tab supplies
  // both `getOwnership` (from `useCropOwnership` / `useSpriteOwnership`) and the
  // click handler that routes into `takeFinalBack` / `takeSpriteFinalBack`.
  /** Resolves per-crop ownership by cropKey. Passed through to ComposedCropSheet. */
  getOwnership?: (
    cropKey: string,
  ) => import('./hooks/use-crop-ownership').CropOwnershipState;
  /** Click handler — receives the cropKey (scheme = `cropKeyOf`). */
  onTakeBack?: (cropKey: string) => void;
  /** Disables the take-back chip (e.g. `anyMixSwapRunning` / `anySpriteSwapRunning`). */
  takeBackDisabled?: boolean;

  // ── Swap-defect detection (Variants Check, 05-15 §3.2) ────────────────────
  /** Per-sheet defect overlay data + host-computed visibility gate (AFTER
   *  non-compare + has defects + not stale). batches mode only; the DefectOverlay
   *  mounts over the sheet frame (above the composed art, below selection/★ —
   *  pointer-events:none so it never blocks the checkboxes). */
  defectOverlay?: {
    defects: SwapDefect[];
    swappedDimensions: { width: number; height: number } | null;
    visible: boolean;
  };
  /** Detect job progress — when running, a NON-blocking status chip announces
   *  "Đang kiểm tra sheet {c}/{t}…" (aria-live polite) without hiding the swap
   *  result the user is reviewing. Null when no detect is running. */
  detectProgress?: { current: number; total: number } | null;
}

// ── Source helpers — collapse the discriminated union to canvas primitives ───

/** The "after" image URL for the current mode. Batches: the persisted sheet
 *  `media_url` — ⚡2026-06-12 nullable (upscales compose-only). */
function afterUrlOf(source: StageSource): string | null {
  return source.mode === 'variants'
    ? source.afterUrl
    : (source.selectedSwap?.media_url ?? null);
}

/** True when an AFTER exists to compare against — ⚡2026-06-12: a stage result
 *  may have NO sheet media_url (upscales) but still compose from `crops[]`. */
function hasAfter(source: StageSource): boolean {
  if (source.mode === 'variants') return source.afterUrl !== null;
  const swap = source.selectedSwap;
  if (!swap) return false;
  return swap.media_url != null || (swap.crops?.length ?? 0) > 0;
}

/** Stable per-swap remount key for the uncontrolled compare slider —
 *  `media_url` may be null (upscales), `created_time` is always present. */
function swapKeyOf(swap: StageSwapResult): string {
  return swap.media_url ?? swap.created_time;
}

/** sheet_geometry for the zoom hook (variants have no sheet → null no-op). */
function sheetGeometryOf(source: StageSource) {
  return source.mode === 'batches'
    ? (source.sheet?.sheet_geometry ?? null)
    : null;
}

// ── Overlay model — normalize variant/batch task into a single render shape ──

type OverlayState =
  | { kind: 'busy'; label: string }
  | { kind: 'error'; message: string }
  | null;

/** Resolve the overlay from mode + task + submitting flag. ⚡2026-06-12: the
 *  stage tab supplies per-stage copy via `runningLabel`/`submittingLabel`. */
function resolveOverlay(
  source: StageSource,
  swapTask: SwapPreviewState | BatchSwapTaskStatus | undefined,
  isSubmitting: boolean | undefined,
  runningLabel?: (current: number, total: number) => string,
  submittingLabel?: string,
): OverlayState {
  if (source.mode === 'variants') {
    const task = swapTask as SwapPreviewState | undefined;
    if (task?.status === 'loading') return { kind: 'busy', label: 'Đang swap…' };
    if (task?.status === 'error') {
      return { kind: 'error', message: task.errorMessage ?? 'Swap failed' };
    }
    return null;
  }
  // batches
  const task = swapTask as BatchSwapTaskStatus | undefined;
  if (task?.state === 'running') {
    return {
      kind: 'busy',
      label:
        runningLabel?.(task.current, task.total) ??
        `Swapping sheet ${task.current}/${task.total}…`,
    };
  }
  // The in-flight enqueue cue wins over a stale error from a prior attempt.
  if (isSubmitting) {
    return { kind: 'busy', label: submittingLabel ?? 'Starting swap…' };
  }
  if (task?.state === 'error') {
    return { kind: 'error', message: task.message };
  }
  return null;
}

export function CropSheetStage({
  source,
  headerPrimary,
  headerActions,
  compareMode,
  zoomLevel,
  dividerPosition,
  swapTask,
  isSubmitting,
  composeMode = 'ordinal',
  afterComposeMode = 'crops-or-sheet',
  runningLabel,
  submittingLabel,
  onToggleCompare,
  onZoomChange,
  onDividerChange,
  selectableSwapCrops,
  selectedSwapCropKeys,
  onToggleSwapCropSelection,
  cropKeyOf,
  getOwnership,
  onTakeBack,
  takeBackDisabled,
  defectOverlay,
  detectProgress,
}: CropSheetStageProps) {
  // Compare needs an "after" to diff the "before" against (⚡2026-06-12 —
  // upscales have media_url=null but compose from crops[]).
  const compareDisabled = !hasAfter(source);

  // ⚡rev6 — `effectiveSelectable` gate. Caller (BatchesTab) already derives
  // `selectableSwapCrops` from its own preconditions (not submitting / not
  // running / swap completed) but Stage applies a second layer:
  //   1. mode === 'batches'    — Variants/Lotties never opt in.
  //   2. selectedSwap !== null — nothing to select if no swap was run.
  //   3. crops.length > 0      — legacy fallback (single media_url, no crops[])
  //                              skips the per-crop overlay entirely.
  //   4. !compareMode          — slider hides per-crop affordances.
  // The Stage stays presentational: selection state lives in a
  // `<SelectionProvider>` owned by the modal (Phase 04).
  const effectiveSelectable =
    source.mode === 'batches' &&
    !!selectableSwapCrops &&
    source.selectedSwap !== null &&
    (source.selectedSwap.crops?.length ?? 0) > 0 &&
    !compareMode;

  return (
    <section
      // Dark theme container: swap-modal-bg base so the stage sits on the
      // modal's dark canvas without bleeding light surfaces.
      className="flex h-full min-w-0 flex-1 flex-col bg-[var(--swap-modal-bg)]"
      aria-label="Crop sheet stage"
    >
      <StageHeader
        headerPrimary={headerPrimary}
        headerActions={headerActions}
        compareMode={compareMode}
        compareDisabled={compareDisabled}
        zoomLevel={zoomLevel}
        onToggleCompare={onToggleCompare}
        onZoomChange={onZoomChange}
      />

      <StageCanvas
        source={source}
        compareMode={compareMode}
        zoomLevel={zoomLevel}
        dividerPosition={dividerPosition}
        swapTask={swapTask}
        isSubmitting={isSubmitting}
        composeMode={composeMode}
        afterComposeMode={afterComposeMode}
        runningLabel={runningLabel}
        submittingLabel={submittingLabel}
        onZoomChange={onZoomChange}
        onDividerChange={onDividerChange}
        effectiveSelectable={effectiveSelectable}
        selectedSwapCropKeys={selectedSwapCropKeys}
        onToggleSwapCropSelection={onToggleSwapCropSelection}
        cropKeyOf={cropKeyOf}
        getOwnership={getOwnership}
        onTakeBack={onTakeBack}
        takeBackDisabled={takeBackDisabled}
        defectOverlay={defectOverlay}
        detectProgress={detectProgress}
      />
    </section>
  );
}

// ── StageHeader ──────────────────────────────────────────────────────────────

interface StageHeaderProps {
  headerPrimary?: StageHeaderPrimary;
  headerActions?: React.ReactNode;
  compareMode: boolean;
  compareDisabled: boolean;
  zoomLevel: number;
  onToggleCompare: () => void;
  onZoomChange: (zoom: number) => void;
}

function StageHeader({
  headerPrimary,
  headerActions,
  compareMode,
  compareDisabled,
  zoomLevel,
  onToggleCompare,
  onZoomChange,
}: StageHeaderProps) {
  return (
    <div
      // Dark stage header: surface + border tokens.
      className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
      style={{ height: HEADER_HEIGHT_PX }}
    >
      <div className="flex items-center gap-2">
        {/* ⚡2026-06-26 — only the Variants/Sprites tab still supplies a header
            action; the 3 stage tabs render it per-batch in the sidebar. */}
        {headerPrimary && <PrimaryActionButton headerPrimary={headerPrimary} />}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <button
                  type="button"
                  aria-pressed={compareMode}
                  aria-label="So sánh trước/sau"
                  disabled={compareDisabled}
                  onClick={() => {
                    log.debug('onClick', 'toggle compare', {
                      next: !compareMode,
                    });
                    onToggleCompare();
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
                    'disabled:pointer-events-none disabled:opacity-40',
                    compareMode
                      ? 'border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-selection)] font-medium text-[var(--swap-modal-text-primary)]'
                      : 'border-[var(--swap-modal-border)] text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]',
                  )}
                >
                  <Columns2 className="h-4 w-4" aria-hidden="true" />
                  Compare
                </button>
              </span>
            </TooltipTrigger>
            {compareDisabled && (
              <TooltipContent style={TOOLTIP_CONTENT_STYLE}>
                Chưa có swap result để so sánh
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {headerActions}
      </div>

      <ZoomControl
        value={zoomLevel}
        onChange={(next) => {
          log.debug('onZoomChange', 'zoom change', { from: zoomLevel, to: next });
          onZoomChange(next);
        }}
        min={ZOOM.min}
        max={ZOOM.max}
        step={ZOOM.step}
      />
    </div>
  );
}

// ── PrimaryActionButton — tab-supplied Generate | Swap ───────────────────────

function PrimaryActionButton({
  headerPrimary,
}: {
  headerPrimary: StageHeaderPrimary;
}) {
  const { label, icon: Icon, disabled, tooltip, busy, onClick } = headerPrimary;

  const button = (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={() => {
        log.debug('onClick', 'primary action', { label });
        onClick();
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
        'bg-[var(--swap-modal-accent)] text-[var(--swap-modal-bg)]',
        'hover:bg-[var(--swap-modal-accent-hover)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );

  // Only wrap in a tooltip when a gating reason is supplied (disabled state).
  if (!tooltip) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{button}</span>
        </TooltipTrigger>
        <TooltipContent style={TOOLTIP_CONTENT_STYLE}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── StageCanvas ──────────────────────────────────────────────────────────────

interface StageCanvasProps {
  source: StageSource;
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  swapTask: SwapPreviewState | BatchSwapTaskStatus | undefined;
  isSubmitting: boolean | undefined;
  composeMode: StageComposeMode;
  afterComposeMode: StageAfterComposeMode;
  runningLabel?: (current: number, total: number) => string;
  submittingLabel?: string;
  onZoomChange: (zoom: number) => void;
  onDividerChange: (pos: number) => void;
  // ⚡rev6 — Selection forwarding for the AFTER `ComposedCropSheet`. Already
  // gated by `CropSheetStage.effectiveSelectable` before reaching here.
  effectiveSelectable: boolean;
  selectedSwapCropKeys?: ReadonlySet<string>;
  onToggleSwapCropSelection?: (cropKey: string) => void;
  cropKeyOf?: (crop: RenderableCrop) => string;
  // ⚡rev7 — Ownership overlay forwarding (AFTER non-compare only). Gated
  // upstream by `effectiveSelectable`'s sibling preconditions in
  // `BatchesCanvasBody`.
  getOwnership?: (
    cropKey: string,
  ) => import('./hooks/use-crop-ownership').CropOwnershipState;
  onTakeBack?: (cropKey: string) => void;
  takeBackDisabled?: boolean;
  // ── Swap-defect detection forwarding (batches mode only) ──────────────────
  defectOverlay?: {
    defects: SwapDefect[];
    swappedDimensions: { width: number; height: number } | null;
    visible: boolean;
  };
  detectProgress?: { current: number; total: number } | null;
}

function StageCanvas({
  source,
  compareMode,
  zoomLevel,
  dividerPosition,
  swapTask,
  isSubmitting,
  composeMode,
  afterComposeMode,
  runningLabel,
  submittingLabel,
  onZoomChange,
  onDividerChange,
  effectiveSelectable,
  selectedSwapCropKeys,
  onToggleSwapCropSelection,
  cropKeyOf,
  getOwnership,
  onTakeBack,
  takeBackDisabled,
  defectOverlay,
  detectProgress,
}: StageCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Fit-to-canvas + center-anchored zoom. Called before any early return
  // (Rules of Hooks) — `sheetGeometry: null` makes the hook a no-op when there
  // is no sheet (variants mode always passes null).
  const sheetGeometry = sheetGeometryOf(source);
  useStageZoom({ viewportRef, sheetGeometry, zoomLevel, onZoomChange });

  const overlay = resolveOverlay(
    source,
    swapTask,
    isSubmitting,
    runningLabel,
    submittingLabel,
  );
  const afterUrl = afterUrlOf(source);

  // Empty state: variants has no "before" portrait, or batches has no sheet.
  const hasBefore =
    source.mode === 'variants'
      ? source.beforeUrl !== null
      : source.sheet !== null;

  if (!hasBefore) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--swap-modal-canvas-bg)] p-8 text-center">
        <p className="text-sm text-[var(--swap-modal-text-muted)]">
          {source.mode === 'variants'
            ? 'Chọn một variant để xem trước'
            : 'Tab này chưa có sheet nào'}
        </p>
      </div>
    );
  }

  // Canvas-inner real size: variants use the after/before natural box (img is
  // object-contain inside the frame, so we let the frame fill the viewport);
  // batches scale the sheet's pixel size by zoom (child crops positioned in %).
  const inner =
    source.mode === 'batches'
      ? {
          width: (source.sheet!.sheet_geometry.width * zoomLevel) / 100,
          height: (source.sheet!.sheet_geometry.height * zoomLevel) / 100,
        }
      : null;

  return (
    <div
      ref={viewportRef}
      // viewport — scrolls the canvas-inner. Dark muted backdrop (canvas-bg
      // token) so the white sheet frame pops against deep navy.
      className="relative min-h-0 flex-1 overflow-auto bg-[var(--swap-modal-canvas-bg)]"
    >
      <div
        // Centering layer — smaller content centers, larger scrolls. `safe`
        // keeps the left/top edges reachable when content overflows.
        className="flex min-h-full min-w-full"
        style={{ justifyContent: 'safe center', alignItems: 'safe center' }}
      >
        {source.mode === 'batches' ? (
          <div
            // Sheet frame: 'ordinal' keeps the white composer-parity frame;
            // 'plain' (rmbg/upscale RGBA stages) goes dark so transparent
            // sheet areas read against the per-crop checkerboard, not white.
            className={cn(
              'relative shrink-0 overflow-hidden rounded-md shadow-2xl',
              composeMode === 'plain'
                ? 'bg-[var(--swap-modal-card-bg)]'
                : 'bg-[var(--swap-modal-sheet-frame-bg)]',
            )}
            style={{ width: inner!.width, height: inner!.height }}
          >
            <BatchesCanvasBody
              sheet={source.sheet!}
              selectedSwap={source.selectedSwap}
              compareMode={compareMode}
              dividerPosition={dividerPosition}
              zoomLevel={zoomLevel}
              composeMode={composeMode}
              afterComposeMode={afterComposeMode}
              onDividerChange={onDividerChange}
              effectiveSelectable={effectiveSelectable}
              selectedSwapCropKeys={selectedSwapCropKeys}
              onToggleSwapCropSelection={onToggleSwapCropSelection}
              cropKeyOf={cropKeyOf}
              getOwnership={getOwnership}
              onTakeBack={onTakeBack}
              takeBackDisabled={takeBackDisabled}
            />
            {/* Defect overlay — fills the sheet frame OVER the composed art.
                pointer-events:none (shapes opt back in for hover), no z-index →
                the z-30 selection checkbox / ★ still paint above it (05-15 §3.2).
                Host gates `visible` (AFTER non-compare + has defects + not stale). */}
            {defectOverlay?.swappedDimensions && (
              <DefectOverlay
                defects={defectOverlay.defects}
                swappedDimensions={defectOverlay.swappedDimensions}
                visible={defectOverlay.visible}
              />
            )}
          </div>
        ) : (
          <div
            // Variants: portrait images are free-sized; frame grows to the
            // viewport so object-contain centers the portrait.
            className="relative flex h-full max-h-full w-full max-w-full shrink overflow-hidden rounded-md shadow-2xl"
          >
            <VariantsCanvasBody
              beforeUrl={source.beforeUrl!}
              afterUrl={afterUrl}
              compareMode={compareMode}
              dividerPosition={dividerPosition}
              onDividerChange={onDividerChange}
            />
          </div>
        )}
      </div>

      {/* Busy/error overlays. aria-live polite so SRs announce progress. */}
      {overlay?.kind === 'busy' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--swap-modal-backdrop)] backdrop-blur-sm"
        >
          <Loader2 className="h-7 w-7 animate-spin text-[var(--swap-modal-accent)]" />
          <span className="text-sm text-[var(--swap-modal-text-secondary)]">
            {overlay.label}
          </span>
        </div>
      )}

      {overlay?.kind === 'error' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--swap-modal-backdrop)] px-4 text-center backdrop-blur-sm"
        >
          <AlertTriangle className="h-7 w-7 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            Swap failed
          </span>
          <span className="text-xs text-destructive">{overlay.message}</span>
          <span className="mt-1 flex items-center gap-1 text-xs text-[var(--swap-modal-text-muted)]">
            <RotateCcw className="h-3.5 w-3.5" />
            Thử lại từ nút hành động
          </span>
        </div>
      )}

      {/* Detect-progress chip — NON-blocking (the swap result stays visible
          while Check runs). aria-live polite announces sheet progress (05-15 §9). */}
      {detectProgress && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
        >
          <span className="flex items-center gap-2 rounded-full bg-[var(--swap-modal-card-bg)]/90 px-3 py-1.5 text-xs text-[var(--swap-modal-text-secondary)] shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--swap-modal-accent)]" />
            Đang kiểm tra sheet {detectProgress.current}/{detectProgress.total}…
          </span>
        </div>
      )}
    </div>
  );
}

// ── BatchesCanvasBody — composed sheet (before) ↔ composed swap (after) ──────

interface BatchesCanvasBodyProps {
  sheet: StageSheet;
  /** rev6 — full SwapResult so AFTER side can compose from `crops[]`. Null
   *  when nothing has been swapped yet (renders BEFORE only). */
  selectedSwap: StageSwapResult | null;
  compareMode: boolean;
  dividerPosition: number;
  zoomLevel: number;
  composeMode: StageComposeMode;
  afterComposeMode: StageAfterComposeMode;
  onDividerChange: (pos: number) => void;
  // ⚡rev6 — Selection forwarding. Only consumed on the AFTER non-compare path
  // (compare suppresses per-crop overlays; BEFORE never shows them).
  effectiveSelectable: boolean;
  selectedSwapCropKeys?: ReadonlySet<string>;
  onToggleSwapCropSelection?: (cropKey: string) => void;
  cropKeyOf?: (crop: RenderableCrop) => string;
  // ⚡rev7 — Ownership overlay forwarding (AFTER non-compare only).
  getOwnership?: (
    cropKey: string,
  ) => import('./hooks/use-crop-ownership').CropOwnershipState;
  onTakeBack?: (cropKey: string) => void;
  takeBackDisabled?: boolean;
}

/** Renders the batches canvas body in 3 modes:
 *  - Compare ON + a swap exists → before/after slider, both sides composed.
 *  - Non-compare + a swap exists → AFTER composed (full sheet of swap crops).
 *  - No swap → BEFORE composed (legacy default — sheet.crops with ordinal badges).
 *
 *  AFTER renders pass `cropsSource='after'` and `selectedSwap`; the composer
 *  falls back to a single legacy <img> + banner when `selectedSwap.crops[]` is
 *  empty but a `media_url` is present (pre-rev6 results).
 *
 *  rev6 — Selection overlay (per-crop checkbox + outline halo) is forwarded
 *  ONLY to the AFTER non-compare path. Compare ON keeps the slider clean; the
 *  legacy single-image fallback never renders a `ComposedCrop`. */
function BatchesCanvasBody({
  sheet,
  selectedSwap,
  compareMode,
  dividerPosition,
  zoomLevel,
  composeMode,
  afterComposeMode,
  onDividerChange,
  effectiveSelectable,
  selectedSwapCropKeys,
  onToggleSwapCropSelection,
  cropKeyOf,
  getOwnership,
  onTakeBack,
  takeBackDisabled,
}: BatchesCanvasBodyProps) {
  if (compareMode && selectedSwap !== null) {
    return (
      <CompareBody
        // Remount the uncontrolled slider when the selected swap changes so it
        // re-applies `defaultPosition` (key falls back to created_time when
        // media_url is null — upscales).
        key={swapKeyOf(selectedSwap)}
        before={
          <div className="relative h-full w-full">
            <ComposedCropSheet
              sheet={sheet}
              zoomLevel={zoomLevel}
              cropsSource="before"
              composeMode={composeMode}
              cropKeyOf={cropKeyOf}
            />
          </div>
        }
        after={
          <div className="relative h-full w-full">
            <ComposedCropSheet
              sheet={sheet}
              zoomLevel={zoomLevel}
              cropsSource="after"
              selectedSwap={selectedSwap}
              composeMode={composeMode}
              afterComposeMode={afterComposeMode}
              cropKeyOf={cropKeyOf}
            />
          </div>
        }
        dividerPosition={dividerPosition}
        onDividerChange={onDividerChange}
      />
    );
  }

  if (selectedSwap !== null) {
    return (
      <div className="relative h-full w-full" key={swapKeyOf(selectedSwap)}>
        <ComposedCropSheet
          sheet={sheet}
          zoomLevel={zoomLevel}
          cropsSource="after"
          selectedSwap={selectedSwap}
          composeMode={composeMode}
          afterComposeMode={afterComposeMode}
          cropKeyOf={cropKeyOf}
          // rev6 — only the AFTER non-compare path opts into per-crop overlays.
          selectableSwapCrops={effectiveSelectable}
          selectedSwapCropKeys={selectedSwapCropKeys}
          onToggleSwapCropSelection={onToggleSwapCropSelection}
          // ⚡rev7 — Ownership overlay; sibling path to the rev6 checkbox.
          getOwnership={getOwnership}
          onTakeBack={onTakeBack}
          takeBackDisabled={takeBackDisabled}
        />
      </div>
    );
  }

  // No result yet — BEFORE composed (ordinal badges only under 'ordinal').
  return (
    <div className="relative h-full w-full">
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={zoomLevel}
        cropsSource="before"
        composeMode={composeMode}
        cropKeyOf={cropKeyOf}
      />
    </div>
  );
}

// ── VariantsCanvasBody — portrait before ↔ after images ──────────────────────

interface VariantsCanvasBodyProps {
  beforeUrl: string;
  afterUrl: string | null;
  compareMode: boolean;
  dividerPosition: number;
  onDividerChange: (pos: number) => void;
}

function VariantsCanvasBody({
  beforeUrl,
  afterUrl,
  compareMode,
  dividerPosition,
  onDividerChange,
}: VariantsCanvasBodyProps) {
  if (compareMode && afterUrl !== null) {
    // rev6 — CompareBody now takes `after: ReactNode` (the batches branch needs
    // to compose AFTER, so the slider can't hardcode an <img>). Variants still
    // wants a portrait img — wrap CanvasImage as the node.
    return (
      <CompareBody
        key={afterUrl}
        before={<CanvasImage url={beforeUrl} />}
        after={<CanvasImage url={afterUrl} />}
        dividerPosition={dividerPosition}
        onDividerChange={onDividerChange}
      />
    );
  }
  // Non-compare: show the after when present, else the before portrait.
  const url = afterUrl ?? beforeUrl;
  return <CanvasImage key={url} url={url} />;
}

// ── CanvasImage — single image (object-contain) ──────────────────────────────

function CanvasImage({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt=""
      onError={() => {
        log.warn('CanvasImage', 'image failed to load', {
          // Log only the path tail — full URL may carry signed tokens (PII).
          urlTail: url.slice(url.lastIndexOf('/') + 1),
        });
      }}
      className="relative h-full w-full object-contain"
    />
  );
}

// ── CompareBody — before/after slider ────────────────────────────────────────

interface CompareBodyProps {
  before: React.ReactNode;
  /** rev6 — was `afterUrl: string`. AFTER may now be a composed sheet (batches)
   *  OR a portrait img (variants), so the caller supplies the node. */
  after: React.ReactNode;
  dividerPosition: number;
  onDividerChange: (pos: number) => void;
}

/** before/after compare slider. Both sides are mode-specific nodes: variants
 *  pass portrait <img>s; batches pass composed crop sheets. The parent keys
 *  the body by a stable per-swap identifier (variants: afterUrl; batches:
 *  selectedSwap.media_url) so the uncontrolled slider resets to
 *  `dividerPosition` on change. */
function CompareBody({
  before,
  after,
  dividerPosition,
  onDividerChange,
}: CompareBodyProps) {
  return (
    <>
      <ReactCompareSlider
        defaultPosition={dividerPosition}
        onPositionChange={onDividerChange}
        className="relative h-full w-full"
        itemOne={before}
        itemTwo={after}
      />
      {/* Before/After badges — card-bg token over the image for legibility. */}
      <span className="absolute left-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-1.5 py-0.5 text-xs text-[var(--swap-modal-text-secondary)]">
        Before
      </span>
      <span className="absolute right-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-1.5 py-0.5 text-xs text-[var(--swap-modal-text-secondary)]">
        After
      </span>
    </>
  );
}
