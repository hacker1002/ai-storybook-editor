// sprites-sidebar.tsx — Sprite→Sheet tree for the Variants tab (sprite-swap
// model). Mirror of `batches-sidebar.tsx` on the `sprites[]` plane.
//
// Two-level ARIA tree (role=tree → sprite treeitem → sheet treeitem). Header
// `SPRITES` + [+] addSprite (subset of the active sprite's selected cells). Each
// sprite row: caret (collapse) + name + `· N variants` badge + sheet stepper
// [−] K [+] + [✕] removeSprite. Sheet rows: dot + title, active highlight.
//
// PRESENTATIONAL only — the tab passes already-guarded callbacks (confirm dialog
// for destructive relayout lives in the tab). Disabled states are computed here
// from props for a11y; the tab also guards before mutating.

import { ChevronDown, ChevronRight, Minus, Plus, X } from 'lucide-react';
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
  SHEET_MAX,
  SHEET_MIN,
} from '../swap-modal-constants';
import { spriteLineupObjects } from '@/stores/remix-store';

const log = createLogger('Editor', 'SpritesSidebar');

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
  onSelectSpriteSheet: (spriteId: string, sheetIndex: number) => void;
  onAddSprite: () => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SPRITE_MIN. */
  onRemoveSprite: (spriteId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SHEET_MAX. */
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
  onSelectSpriteSheet,
  onAddSprite,
  onRemoveSprite,
  onAddSheet,
  onRemoveSheet,
}: SpritesSidebarProps) {
  const canRemoveSprite = sprites.length > SPRITE_MIN;

  const addSpriteButton = (
    <button
      type="button"
      aria-label={`Add sprite (${selectionSize} cells selected)`}
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
      aria-label="Sprites"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
            Sprites
          </p>
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
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {addSpriteTooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          addSpriteButton
        )}
      </div>

      {sprites.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Chưa có sprite nào.
          </p>
        </div>
      ) : (
        <div
          role="tree"
          aria-label="Sprites tree"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {sprites.map((sprite) => (
            <SpriteNode
              key={sprite.id}
              sprite={sprite}
              activeSpriteRef={activeSpriteRef}
              collapsed={isCollapsed(sprite.id)}
              anySpriteSwapRunning={anySpriteSwapRunning}
              canRemoveSprite={canRemoveSprite}
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
  activeSpriteRef: { spriteId: string; sheetIndex: number } | null;
  collapsed: boolean;
  anySpriteSwapRunning: boolean;
  canRemoveSprite: boolean;
  onToggleCollapse: (spriteId: string) => void;
  onSelectSpriteSheet: (spriteId: string, sheetIndex: number) => void;
  onRemoveSprite: (spriteId: string) => void;
  onAddSheet: (spriteId: string) => void;
  onRemoveSheet: (spriteId: string, sheetIndex: number) => void;
}

function SpriteNode({
  sprite,
  activeSpriteRef,
  collapsed,
  anySpriteSwapRunning,
  canRemoveSprite,
  onToggleCollapse,
  onSelectSpriteSheet,
  onRemoveSprite,
  onAddSheet,
  onRemoveSheet,
}: SpriteNodeProps) {
  const sheetCount = sprite.crop_sheets.length;
  const isActiveSprite = activeSpriteRef?.spriteId === sprite.id;
  const removeSheetDisabled = anySpriteSwapRunning || sheetCount <= SHEET_MIN;
  const addSheetDisabled = anySpriteSwapRunning || sheetCount >= SHEET_MAX;
  // `· N variants` badge — distinct character object_keys on this sprite (cheap
  // O(crops) reduce; skip when 0 to avoid noise).
  const variantCount = sprite.crop_sheets.reduce(
    (acc, s) => acc + s.crops.length,
    0,
  );
  const objectCount = spriteLineupObjects(sprite).length;

  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={!collapsed}
      aria-selected={isActiveSprite}
      className="flex flex-col"
    >
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-2">
        <button
          type="button"
          aria-label={`${collapsed ? 'Mở' : 'Thu gọn'} ${sprite.name}`}
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(sprite.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--swap-modal-surface-hover)] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]"
        >
          <span
            aria-hidden="true"
            className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--swap-modal-text-muted)]"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--swap-modal-text-primary)]">
            {sprite.name}
          </span>
          {variantCount > 0 && (
            <span
              aria-hidden="true"
              className="ml-1 shrink-0 text-xs tabular-nums text-[var(--swap-modal-text-muted)]"
            >
              · {variantCount} variants
              {objectCount > 0 ? ` · ${objectCount} char` : ''}
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`Bớt sheet của ${sprite.name}`}
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
            aria-label={`Thêm sheet của ${sprite.name}`}
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

        {canRemoveSprite && (
          <button
            type="button"
            aria-label={`Xoá ${sprite.name}`}
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
          {sprite.crop_sheets.map((_, sheetIndex) => {
            const isActive =
              isActiveSprite && activeSpriteRef?.sheetIndex === sheetIndex;
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
                <span className="truncate font-medium">Sheet {sheetIndex + 1}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
