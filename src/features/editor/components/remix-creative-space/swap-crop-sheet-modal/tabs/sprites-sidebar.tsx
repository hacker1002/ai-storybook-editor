// sprites-sidebar.tsx — Sprite→Sheet tree for the Variants tab (sprite-swap
// model). Mirror of `batches-sidebar.tsx` on the `sprites[]` plane.
//
// Two-level ARIA tree (role=tree → sprite treeitem → sheet treeitem). Header
// `SPRITES` + [+] addSprite (subset of the active sprite's selected cells). Each
// sprite row (⚡2026-06-26 — parity with batches-sidebar):
//   row 1: caret + name + right cluster [ stepper [−] K [+] | Swap action ]
//   row 2: muted "N variants · M char" count (moved below the title).
// Clicking the per-row Swap action auto-selects that sprite then enqueues its
// swap (tab-supplied `spriteAction.onRun`). Sheet rows: dot + title + "N
// variants" pill, active highlight.
//
// PRESENTATIONAL only — the tab passes already-guarded callbacks (confirm dialog
// for destructive relayout lives in the tab). Disabled states are computed here
// from props for a11y; the tab also guards before mutating.

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixSprite } from '@/types/remix';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  SPRITE_MIN,
  LEFT_SIDEBAR_WIDTH_PX,
  SHEET_MIN,
  spriteBatchLabel,
  Z_INDEX,
} from '../swap-modal-constants';
import { spriteLineupObjects } from '@/stores/remix-store';
import { DefectCheckButton } from '../defect-check-button';
import type { DetectActionState } from './detect-gating';
import type { BatchActionState } from './use-stage-batch-tab';

// Lift in-modal tooltips above the z-4000 swapModal (shared TooltipContent ships
// at z-50). ⚡2026-06-26 (see Z_INDEX.tooltip).
const TOOLTIP_CONTENT_STYLE = { zIndex: Z_INDEX.tooltip };

const log = createLogger('Editor', 'SpritesSidebar');

/** ⚡2026-06-26 — per-sprite Swap action moved from the stage header into each
 *  sidebar sprite row. Tab supplies icon + copy + the hook-backed
 *  evaluator/runner; sidebar stays presentational. Reuses `BatchActionState`
 *  (the shared gate/busy/error shape) for parity with the stage tabs. */
export interface SpriteActionDescriptor {
  icon: LucideIcon;
  label: string;
  retryLabel: string;
  getState: (sprite: RemixSprite) => BatchActionState;
  onRun: (spriteId: string) => void;
}

/** ⚡2026-06-27 — per-sprite Check (swap-defect detect) action, sibling RIGHT of
 *  the Swap button (05-15 §4.1). The shared `DefectCheckButton` renders it; the
 *  tab supplies the hook-backed evaluator/runner + result badge. */
export interface SpriteDetectDescriptor {
  getState: (sprite: RemixSprite) => DetectActionState;
  onRun: (spriteId: string) => void;
}

// Delete-sprite affordance hidden by product decision; flip to re-enable.
const SHOW_REMOVE_SPRITE: boolean = false;

interface SpritesSidebarProps {
  sprites: RemixSprite[];
  activeSpriteRef: { spriteId: string; sheetIndex: number } | null;
  isCollapsed: (spriteId: string) => boolean;
  onToggleCollapse: (spriteId: string) => void;
  /** Steppers/add/remove globally locked while any sprite swap is running. */
  anySpriteSwapRunning: boolean;
  /** [+] button disabled when false (no selection OR busy). */
  canAddSprite: boolean;
  /** Explanatory tooltip when `[+]` is disabled. Empty string when enabled. */
  addSpriteTooltip: string;
  /** Number of cells currently ticked — drives the `(N sel)` badge + aria. */
  selectionSize: number;
  /** ⚡2026-06-26 — per-sprite Swap action rendered in each row. */
  spriteAction: SpriteActionDescriptor;
  /** ⚡2026-06-27 — per-sprite Check (detect) action, sibling right of Swap. */
  spriteDetectAction: SpriteDetectDescriptor;
  /** True while a sprite layout computes (seed / relayout — artwork dimension
   *  measurement, seconds on a cold cache). Empty state becomes a loading
   *  state; header shows a small spinner while sprites are visible. */
  layoutPending: boolean;
  onSelectSpriteSheet: (spriteId: string, sheetIndex: number) => void;
  onAddSprite: () => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SPRITE_MIN. */
  onRemoveSprite: (spriteId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only caps at crop count. */
  onAddSheet: (spriteId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SHEET_MIN. */
  onRemoveSheet: (spriteId: string, sheetIndex: number) => void;
}

export function SpritesSidebar({
  sprites,
  activeSpriteRef,
  isCollapsed,
  onToggleCollapse,
  anySpriteSwapRunning,
  canAddSprite,
  addSpriteTooltip,
  selectionSize,
  layoutPending,
  spriteAction,
  spriteDetectAction,
  onSelectSpriteSheet,
  onAddSprite,
  onRemoveSprite,
  onAddSheet,
  onRemoveSheet,
}: SpritesSidebarProps) {
  const addSpriteButton = (
    <button
      type="button"
      aria-label={`Add batch (${selectionSize} cells selected)`}
      disabled={!canAddSprite}
      onClick={() => {
        log.debug('onAddSprite', 'add sprite', {
          spriteCount: sprites.length,
          selectionSize,
        });
        onAddSprite();
      }}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--swap-modal-text-secondary)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="h-4 w-4" />
    </button>
  );

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Batches"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
            Batches
          </p>
          {layoutPending && sprites.length > 0 && (
            <Loader2
              aria-label="Đang tính lại layout batch"
              className="h-3 w-3 animate-spin text-[var(--swap-modal-text-muted)]"
            />
          )}
          {selectionSize > 0 && (
            <span
              aria-hidden="true"
              className="text-xs font-medium tabular-nums text-[var(--swap-modal-text-muted)]"
            >
              ({selectionSize} sel)
            </span>
          )}
        </div>
        {addSpriteTooltip ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={-1} className="inline-flex">
                  {addSpriteButton}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs text-xs"
                style={TOOLTIP_CONTENT_STYLE}
              >
                {addSpriteTooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          addSpriteButton
        )}
      </div>

      {sprites.length === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center"
          aria-busy={layoutPending}
        >
          {layoutPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-[var(--swap-modal-text-muted)]" />
              <p className="text-sm text-[var(--swap-modal-text-muted)]">
                Đang dựng batch — đo kích thước ảnh variant…
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--swap-modal-text-muted)]">
              Chưa có batch nào.
            </p>
          )}
        </div>
      ) : (
        <div
          role="tree"
          aria-label="Batches tree"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {sprites.map((sprite, index) => (
            <SpriteNode
              key={sprite.id}
              sprite={sprite}
              // Rendered label — "Batch N" for parity with the stage BATCHES
              // sidebars; data model stays `sprite`.
              displayName={spriteBatchLabel(sprite.order)}
              activeSpriteRef={activeSpriteRef}
              collapsed={isCollapsed(sprite.id)}
              anySpriteSwapRunning={anySpriteSwapRunning}
              // First SPRITE_MIN sprites are permanent (the seed sprite at
              // index 0); only later sprites expose the delete affordance.
              canRemoveSprite={index >= SPRITE_MIN}
              spriteAction={spriteAction}
              spriteDetectAction={spriteDetectAction}
              onToggleCollapse={onToggleCollapse}
              onSelectSpriteSheet={onSelectSpriteSheet}
              onRemoveSprite={onRemoveSprite}
              onAddSheet={onAddSheet}
              onRemoveSheet={onRemoveSheet}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface SpriteNodeProps {
  sprite: RemixSprite;
  /** Pre-derived "Batch N" label (presentational; see `spriteBatchLabel`). */
  displayName: string;
  activeSpriteRef: { spriteId: string; sheetIndex: number } | null;
  collapsed: boolean;
  anySpriteSwapRunning: boolean;
  canRemoveSprite: boolean;
  spriteAction: SpriteActionDescriptor;
  spriteDetectAction: SpriteDetectDescriptor;
  onToggleCollapse: (spriteId: string) => void;
  onSelectSpriteSheet: (spriteId: string, sheetIndex: number) => void;
  onRemoveSprite: (spriteId: string) => void;
  onAddSheet: (spriteId: string) => void;
  onRemoveSheet: (spriteId: string, sheetIndex: number) => void;
}

function SpriteNode({
  sprite,
  displayName,
  activeSpriteRef,
  collapsed,
  anySpriteSwapRunning,
  canRemoveSprite,
  spriteAction,
  spriteDetectAction,
  onToggleCollapse,
  onSelectSpriteSheet,
  onRemoveSprite,
  onAddSheet,
  onRemoveSheet,
}: SpriteNodeProps) {
  const sheetCount = sprite.crop_sheets.length;
  const isActiveSprite = activeSpriteRef?.spriteId === sprite.id;
  // `· N variants` badge — crops on this batch (cheap O(crops) reduce; skip when
  // 0 to avoid noise). Also the per-batch sheet ceiling: a sheet holds ≥1 crop,
  // so K can never exceed the crop count (replaces the old flat SHEET_MAX=10).
  const variantCount = sprite.crop_sheets.reduce(
    (acc, s) => acc + s.original_crops.length,
    0,
  );
  const objectCount = spriteLineupObjects(sprite).length;
  const removeSheetDisabled = anySpriteSwapRunning || sheetCount <= SHEET_MIN;
  const addSheetDisabled = anySpriteSwapRunning || sheetCount >= variantCount;

  // ⚡2026-06-26 — per-row Swap action (tab-supplied icon + hook gating).
  const action = spriteAction.getState(sprite);
  const ActionIcon = spriteAction.icon;
  const actionLabel = action.isError ? spriteAction.retryLabel : spriteAction.label;

  // ⚡2026-06-27 — per-row Check (swap-defect detect) action gating.
  const detect = spriteDetectAction.getState(sprite);

  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={!collapsed}
      aria-selected={isActiveSprite}
      className="flex flex-col"
    >
      <div className="flex items-start gap-1.5 px-2 pb-1.5 pt-2">
        <button
          type="button"
          aria-label={`${collapsed ? 'Mở' : 'Thu gọn'} ${displayName}`}
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(sprite.id)}
          className="flex min-w-0 flex-1 items-start gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--swap-modal-surface-hover)] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-4 shrink-0 items-center justify-center text-[var(--swap-modal-text-muted)]"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
          {/* ⚡2026-06-26 — name on row 1, count relocated to row 2. */}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-[var(--swap-modal-text-primary)]">
              {displayName}
            </span>
            {variantCount > 0 && (
              <span className="text-xs tabular-nums text-[var(--swap-modal-text-muted)]">
                {variantCount} variants
                {objectCount > 0 ? ` · ${objectCount} char` : ''}
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`Bớt sheet của ${displayName}`}
            disabled={removeSheetDisabled}
            onClick={() => {
              log.debug('onRemoveSheet', 'remove last sheet', {
                spriteId: sprite.id,
                sheetCount,
              });
              onRemoveSheet(sprite.id, sheetCount - 1);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--swap-modal-text-secondary)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span
            aria-hidden="true"
            className="min-w-[1.25rem] text-center text-xs tabular-nums text-[var(--swap-modal-text-secondary)]"
          >
            {sheetCount}
          </span>
          <button
            type="button"
            aria-label={`Thêm sheet của ${displayName}`}
            disabled={addSheetDisabled}
            onClick={() => {
              log.debug('onAddSheet', 'append sheet', {
                spriteId: sprite.id,
                sheetCount,
              });
              onAddSheet(sprite.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--swap-modal-text-secondary)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ⚡2026-06-26 — per-row Swap action. Click auto-selects the sprite then
            enqueues its swap. Icon-only; tooltip = gate reason when disabled, else
            label. aria-label carries the action + batch name (a11y for icon-only). */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={-1} className="inline-flex shrink-0">
                <button
                  type="button"
                  aria-label={`${actionLabel} ${displayName}`}
                  disabled={action.disabled || action.busy}
                  aria-busy={action.busy || undefined}
                  onClick={() => {
                    log.info('onRunSpriteAction', 'run sprite swap', {
                      spriteId: sprite.id,
                    });
                    spriteAction.onRun(sprite.id);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--swap-modal-border)] text-[var(--swap-modal-accent)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {action.busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-xs text-xs"
              style={TOOLTIP_CONTENT_STYLE}
            >
              {action.tooltip ?? actionLabel}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ⚡2026-06-27 — per-row Check (swap-defect detect). Sibling RIGHT of
            Swap; the shared DefectCheckButton renders it (click → tab auto-selects
            the sprite then enqueues the detect job, 05-15 §4.1). */}
        <DefectCheckButton
          scopeId={sprite.id}
          scopeLabel={displayName}
          detect={detect}
          onRun={spriteDetectAction.onRun}
        />

        {SHOW_REMOVE_SPRITE && canRemoveSprite && (
          <button
            type="button"
            aria-label={`Xoá ${displayName}`}
            disabled={anySpriteSwapRunning}
            onClick={() => {
              log.debug('onRemoveSprite', 'remove sprite', { spriteId: sprite.id });
              onRemoveSprite(sprite.id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!collapsed && sheetCount > 0 && (
        <div role="group" className="flex flex-col">
          {sprite.crop_sheets.map((sheet, sheetIndex) => {
            const isActive =
              isActiveSprite && activeSpriteRef?.sheetIndex === sheetIndex;
            // ⚡2026-06-26 — per-sheet variant count pill (parity with batches).
            const sheetVariantCount = sheet.original_crops.length;
            return (
              <button
                key={sheetIndex}
                type="button"
                role="treeitem"
                aria-level={2}
                aria-selected={isActive}
                onClick={() => {
                  log.debug('onSelectSpriteSheet', 'select sheet', {
                    spriteId: sprite.id,
                    sheetIndex,
                  });
                  onSelectSpriteSheet(sprite.id, sheetIndex);
                }}
                className={cn(
                  'flex items-center gap-2 py-1.5 pr-2 text-left text-sm transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]',
                  isActive
                    ? 'bg-[var(--swap-modal-selection)] text-[var(--swap-modal-text-primary)]'
                    : 'text-[var(--swap-modal-text-secondary)] hover:bg-[var(--swap-modal-surface-hover)]',
                )}
                style={{ paddingLeft: 38 }}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--swap-modal-text-muted)]"
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  Sheet {sheetIndex + 1}
                </span>
                {sheetVariantCount > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums',
                      isActive
                        ? 'bg-[var(--swap-modal-accent)]/15 text-[var(--swap-modal-text-primary)]'
                        : 'bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-muted)]',
                    )}
                  >
                    {sheetVariantCount} variants
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
