// entity-row.tsx — Top level of the 3-level sidebar tree.
// Branches by entity.type:
//   • character | prop → header (name + @key + [▣] + [⇄]) + nested VariantRow[]
//                        (each variant carries its own stepper + SheetRow[]).
//                        Click entity name → collapse/expand the whole variant
//                        group; entity name itself NEVER carries a stepper.
//   • mix              → header (name + @key + stepper [−][+] + [⇄]) + flat
//                        SheetRow[] (variantKey=null, ariaLevel=2).
//
// Subtree rendering lives in `entity-subtrees.tsx` so this file stays small.
//
// [⇄] enqueues the character crop-sheet swap job (api/jobs/04). Enabled only for
// `character` entities whose every in-scope variant has a `visualSwapUrl`; the
// disable matrix below (`resolveSwapButtonState`) covers props/mixes, a running
// swap, no sheets, and missing visuals. onClick → `onSwapEntity` (the modal's
// `handleSwapEntity` enqueues + toasts).
//
// Keyboard ↑/↓ on a SheetRow flattens visible sheets across the ENTITY'S variants
// (respecting variant-collapse state) and wraps within the entity. Stepper button
// clicks call stopPropagation so they don't bubble into the entity collapse.

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Repeat,
} from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEntitySwapTask } from '@/stores/remix-store';
import type { RemixEntityRef } from '@/types/remix';
import { SHEET_MIN, type RemixEntityType } from '../swap-modal-constants';
import { VariantIcon } from './variant-icon';
import type { CollapseApi } from './use-collapse-state';
import { MixSheets, VariantSubtree } from './entity-subtrees';

const log = createLogger('Editor', 'EntityRow');

interface ActiveSheetRef {
  entityKey: string;
  variantKey: string | null;
  sheetIndex: number;
}

interface EntityRowProps {
  remixId: string;
  type: RemixEntityType;
  entity: RemixEntityRef;
  activeSheetRef: ActiveSheetRef;
  /** True while any character_swap job runs in this remix (or an enqueue POST is
   *  in flight) — disables every [⇄]. */
  anySwapRunning: boolean;
  /** True while THIS entity's enqueue POST is in flight — shows a "Starting…"
   *  indicator before the optimistic job seed lands in jobs[]. */
  isSubmitting: boolean;
  collapse: CollapseApi;
  onSelectVariant: (entityKey: string, variantKey: string) => void;
  onSelectSheet: (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => void;
  onAddSheet: (entityKey: string, variantKey: string | null) => void;
  onRemoveSheet: (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => void;
  /** Enqueues the character crop-sheet swap job for this entity. */
  onSwapEntity: (entityKey: string) => void;
  /** char/prop only — opens VariantsVisualModal (Phase 05). */
  onOpenVariants: (entityKey: string) => void;
}

/** Flat reference to one visible sheet in the entity (for ↑/↓ navigation). */
interface FlatSheetRef {
  variantKey: string | null;
  /** Index local to the variant bucket (char/prop) or to entity.crop_sheets (mix). */
  sheetIndex: number;
}

/** [⇄] disable matrix (api/jobs/04 + modal §3.2). Priority order; first match
 *  wins. Char-only v1 — prop/mix always disabled. EN tooltip literals per spec. */
function resolveSwapButtonState(
  type: RemixEntityType,
  entity: RemixEntityRef,
  anySwapRunning: boolean,
): { disabled: boolean; tooltip: string } {
  if (type !== 'character') {
    return { disabled: true, tooltip: 'Not available for props/mixes yet' };
  }
  if (anySwapRunning) {
    return { disabled: true, tooltip: 'A swap is already running for this remix' };
  }
  if (entity.variants.length === 0) {
    return { disabled: true, tooltip: 'No crop sheets to swap yet' };
  }
  if (entity.variants.some((v) => v.visualSwapUrl == null)) {
    return {
      disabled: true,
      tooltip:
        'Generate a swapped visual for every variant first — open ▣ View Variants',
    };
  }
  return { disabled: false, tooltip: `Swap ${entity.name}` };
}

export function EntityRow({
  remixId,
  type,
  entity,
  activeSheetRef,
  anySwapRunning,
  isSubmitting,
  collapse,
  onSelectVariant,
  onSelectSheet,
  onAddSheet,
  onRemoveSheet,
  onSwapEntity,
  onOpenVariants,
}: EntityRowProps) {
  const swapTask = useEntitySwapTask(remixId, type, entity.key);
  const isMix = type === 'mix';
  const entityCollapsed = collapse.isEntityCollapsed(entity.key);
  const isRowActive = activeSheetRef.entityKey === entity.key;
  const swapButton = resolveSwapButtonState(type, entity, anySwapRunning);

  // Build flat-sheet list (in DOM render order) for keyboard ↑/↓ navigation.
  // Respects variant-collapse: a collapsed variant contributes 0 entries.
  // Mix: single bucket of entity.crop_sheets (variantKey=null).
  const flatSheets: FlatSheetRef[] = (() => {
    if (isMix) {
      return entity.crop_sheets.map((_, idx) => ({
        variantKey: null,
        sheetIndex: idx,
      }));
    }
    if (entityCollapsed) return [];
    const out: FlatSheetRef[] = [];
    for (const v of entity.variants) {
      if (collapse.isVariantCollapsed(entity.key, v.variantKey)) continue;
      for (let i = 0; i < v.sheetIndices.length; i += 1) {
        out.push({ variantKey: v.variantKey, sheetIndex: i });
      }
    }
    return out;
  })();

  /** Arrow navigation owned at entity scope so it can wrap across variants. */
  const handleArrowNavigate = (
    direction: 'up' | 'down',
    variantKey: string | null,
    sheetIndex: number,
    currentEl: HTMLElement,
  ) => {
    if (flatSheets.length === 0) return;
    const pos = flatSheets.findIndex(
      (f) => f.variantKey === variantKey && f.sheetIndex === sheetIndex,
    );
    if (pos === -1) return;
    // Wrap within entity (ARIA tree pattern §4.10).
    const last = flatSheets.length - 1;
    const next =
      direction === 'down'
        ? pos === last
          ? 0
          : pos + 1
        : pos === 0
          ? last
          : pos - 1;
    if (next === pos) return;
    const target = flatSheets[next];
    log.debug('handleArrowNavigate', 'wrap-aware arrow navigate', {
      entityKey: entity.key,
      from: { variantKey, sheetIndex },
      to: target,
    });
    onSelectSheet(entity.key, target.variantKey, target.sheetIndex);
    // Move DOM focus via data-attr selector — the new row may live in a
    // sibling variant block.
    const container = currentEl.closest('[data-entity-tree="true"]');
    if (container instanceof HTMLElement) {
      const sel = `[data-sheet-row="true"][data-entity-key="${CSS.escape(entity.key)}"][data-variant-key="${CSS.escape(target.variantKey ?? '')}"][data-sheet-index="${target.sheetIndex}"]`;
      const el = container.querySelector(sel);
      if (el instanceof HTMLElement) el.focus();
    }
  };

  // ── Header (entity-level) ────────────────────────────────────────────────
  const headerContent = (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 pb-2 pt-2.5 transition-colors',
        'hover:bg-[var(--swap-modal-surface-hover)]',
      )}
    >
      {/* Name + @key block — char/prop uses caret-style click on the whole
          block to toggle entity collapse; mix has no caret (no variants). */}
      <div
        role={isMix ? undefined : 'button'}
        tabIndex={isMix ? undefined : 0}
        onClick={
          isMix
            ? undefined
            : () => {
                log.debug('onClick', 'toggle entity collapse via name', {
                  entityKey: entity.key,
                  wasCollapsed: entityCollapsed,
                });
                collapse.toggleEntity(entity.key);
              }
        }
        onKeyDown={
          isMix
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  collapse.toggleEntity(entity.key);
                }
              }
        }
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5',
          !isMix &&
            'cursor-pointer rounded focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]',
        )}
      >
        {!isMix && (
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--swap-modal-text-muted)]"
          >
            {entityCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--swap-modal-text-primary)]">
            {entity.name}
          </p>
          <p className="truncate text-xs text-[var(--swap-modal-text-muted)]">
            @{entity.key}
          </p>
        </div>
      </div>

      {/* Trailing actions */}
      <div className="flex shrink-0 items-center gap-2">
        {(isSubmitting || swapTask.state === 'running') && (
          <span
            role="status"
            aria-live="polite"
            className="mr-1 flex items-center gap-1 text-xs text-[var(--swap-modal-accent)]"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {swapTask.state === 'running'
              ? `${swapTask.current}/${swapTask.total}`
              : 'Starting…'}
          </span>
        )}

        {/* Mix entity stepper (entity-level) — char/prop steppers live on
            VariantRow, NOT here. */}
        {isMix && (
          <>
            <button
              type="button"
              aria-label={`Bớt sheet cho ${entity.name}`}
              disabled={entity.crop_sheets.length <= SHEET_MIN}
              onClick={(e) => {
                e.stopPropagation();
                log.debug('onClick', 'remove sheet (mix)', {
                  entityKey: entity.key,
                  lastIndex: entity.crop_sheets.length - 1,
                });
                onRemoveSheet(entity.key, null, entity.crop_sheets.length - 1);
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-[var(--swap-modal-surface-hover)] text-[rgba(255,255,255,0.75)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] disabled:pointer-events-none disabled:opacity-40"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`Thêm sheet cho ${entity.name}`}
              onClick={(e) => {
                e.stopPropagation();
                log.debug('onClick', 'add sheet (mix)', {
                  entityKey: entity.key,
                });
                onAddSheet(entity.key, null);
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-[var(--swap-modal-surface-hover)] text-[rgba(255,255,255,0.75)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)]"
            >
              <Plus className="h-3 w-3" />
            </button>
          </>
        )}

        {/* [▣] Variants visual — char/prop only. */}
        {!isMix && (
          <button
            type="button"
            aria-label={`Mở variants của ${entity.name}`}
            onClick={(e) => {
              e.stopPropagation();
              log.debug('onClick', 'open variants modal', {
                entityKey: entity.key,
              });
              onOpenVariants(entity.key);
            }}
            className="flex h-6 w-6 items-center justify-center rounded bg-[var(--swap-modal-surface-hover)] text-[rgba(255,255,255,0.75)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)]"
          >
            <VariantIcon className="h-3.5 w-3.5" />
          </button>
        )}

        {/* [⇄] Swap — enqueues the character crop-sheet swap job. Disabled per
            `resolveSwapButtonState` matrix (props/mixes, busy, no sheets, missing
            visual). Defensive: `disabled` + handler re-guards (memory
            feedback_sidebar_destructive_hotkeys). */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <button
                  type="button"
                  aria-label={swapButton.tooltip}
                  aria-disabled={swapButton.disabled}
                  disabled={swapButton.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (swapButton.disabled) return;
                    log.info('onClick', 'swap entity', {
                      entityKey: entity.key,
                      type,
                    });
                    onSwapEntity(entity.key);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded bg-[var(--swap-modal-surface-hover)] text-[rgba(255,255,255,0.75)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Repeat className="h-3 w-3" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{swapButton.tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );

  // ── Subtree (variants → sheets, or just sheets for mix) ──────────────────
  const subtree = isMix ? (
    <MixSheets
      entity={entity}
      activeSheetRef={activeSheetRef}
      onSelectSheet={onSelectSheet}
      onArrowNavigate={handleArrowNavigate}
    />
  ) : (
    <VariantSubtree
      entity={entity}
      activeSheetRef={activeSheetRef}
      collapse={collapse}
      onSelectVariant={onSelectVariant}
      onSelectSheet={onSelectSheet}
      onAddSheet={onAddSheet}
      onRemoveSheet={onRemoveSheet}
      onArrowNavigate={handleArrowNavigate}
    />
  );

  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={isMix ? undefined : !entityCollapsed}
      aria-selected={isRowActive}
      data-entity-tree="true"
      className="flex flex-col"
    >
      {headerContent}
      {swapTask.state === 'error' && (
        <p className="px-3 pb-1 text-xs text-red-400">
          Swap failed ({swapTask.failedSheets} sheets)
        </p>
      )}
      {(!entityCollapsed || isMix) && subtree}
    </div>
  );
}
