// crop-sheet-entity-sidebar.tsx — Left sidebar of SwapCropSheetModal (design §3.2).
// Lists every entity key of the active tab. Each entity is a block:
//   name + @key, sheet stepper [−][+], swap [⇄], and a listbox of sheet rows.
//
// DEFERRED (Validation S1): the [⇄] swap button is hard-disabled on ALL tabs
// (character/prop/mix) — the swap API is not yet wired. `onSwapEntity` is kept
// in the prop contract so a future phase only needs to flip `disabled` off.

import { ArrowLeftRight, Minus, Plus, Loader2 } from 'lucide-react';
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
import {
  SHEET_MIN,
  SWAP_DISABLED_REASON,
  type RemixEntityType,
} from './swap-modal-constants';

const log = createLogger('Editor', 'CropSheetEntitySidebar');

interface ActiveSheetRef {
  entityKey: string;
  sheetIndex: number;
}

interface CropSheetEntitySidebarProps {
  remixId: string;
  type: RemixEntityType;
  entities: RemixEntityRef[];
  activeSheetRef: ActiveSheetRef;
  /** True while any swap runs anywhere in the remix — guards every [⇄]. */
  anySwapRunning: boolean;
  onSelectSheet: (entityKey: string, sheetIndex: number) => void;
  onAddSheet: (entityKey: string) => void;
  onRemoveSheet: (entityKey: string, sheetIndex: number) => void;
  onSwapEntity: (entityKey: string) => void;
}

const SECTION_LABEL: Record<RemixEntityType, string> = {
  character: 'CHARACTERS',
  prop: 'PROPS',
  mix: 'MIXES',
};

export function CropSheetEntitySidebar({
  remixId,
  type,
  entities,
  activeSheetRef,
  anySwapRunning,
  onSelectSheet,
  onAddSheet,
  onRemoveSheet,
  onSwapEntity,
}: CropSheetEntitySidebarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-y-auto border-r border-border bg-background"
      style={{ width: 300 }}
    >
      <p className="sticky top-0 z-10 bg-background px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {SECTION_LABEL[type]}
      </p>

      {entities.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Tab này chưa có key nào.
        </p>
      ) : (
        <div className="flex flex-col gap-2 px-3 pb-4">
          {entities.map((entity) => (
            <EntityRow
              key={entity.key}
              remixId={remixId}
              type={type}
              entity={entity}
              activeSheetRef={activeSheetRef}
              anySwapRunning={anySwapRunning}
              onSelectSheet={onSelectSheet}
              onAddSheet={onAddSheet}
              onRemoveSheet={onRemoveSheet}
              onSwapEntity={onSwapEntity}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface EntityRowProps {
  remixId: string;
  type: RemixEntityType;
  entity: RemixEntityRef;
  activeSheetRef: ActiveSheetRef;
  anySwapRunning: boolean;
  onSelectSheet: (entityKey: string, sheetIndex: number) => void;
  onAddSheet: (entityKey: string) => void;
  onRemoveSheet: (entityKey: string, sheetIndex: number) => void;
  onSwapEntity: (entityKey: string) => void;
}

/** One entity block — subscribes its own swap task so a running/error state
 *  renders per-key without re-rendering siblings. */
function EntityRow({
  remixId,
  type,
  entity,
  activeSheetRef,
  anySwapRunning,
  onSelectSheet,
  onAddSheet,
  onRemoveSheet,
  onSwapEntity,
}: EntityRowProps) {
  const swapTask = useEntitySwapTask(remixId, type, entity.key);
  const sheetCount = entity.crop_sheets.length;
  const removeDisabled = sheetCount <= SHEET_MIN;
  const isRowActive = activeSheetRef.entityKey === entity.key;

  const handleSheetKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    index: number,
  ) => {
    let next = index;
    if (e.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (e.key === 'ArrowDown') next = Math.min(sheetCount - 1, index + 1);
    else return;
    e.preventDefault();
    if (next === index) return;
    log.debug('handleSheetKeyDown', 'arrow navigate sheet', {
      entityKey: entity.key,
      from: index,
      to: next,
    });
    onSelectSheet(entity.key, next);
    const sibling = e.currentTarget.parentElement?.children[next];
    if (sibling instanceof HTMLElement) sibling.focus();
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {entity.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            @{entity.key}
          </p>
        </div>

        {swapTask.state === 'running' && (
          <span
            role="status"
            aria-live="polite"
            className="flex items-center gap-1 text-xs text-primary"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {swapTask.current}/{swapTask.total}
          </span>
        )}
      </div>

      {swapTask.state === 'error' && (
        <p className="px-3 pb-1 text-xs text-destructive">
          Swap lỗi ({swapTask.failedSheets} sheet)
        </p>
      )}

      {/* Action row — stepper [−][+] + swap [⇄] */}
      <div className="flex items-center gap-1 px-3 pb-2">
        <button
          type="button"
          aria-label={`Bớt sheet cho ${entity.name}`}
          disabled={removeDisabled}
          onClick={() => {
            log.debug('onClick', 'remove sheet', {
              entityKey: entity.key,
              lastIndex: sheetCount - 1,
            });
            onRemoveSheet(entity.key, sheetCount - 1);
          }}
          className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">
          {sheetCount}
        </span>
        <button
          type="button"
          aria-label={`Thêm sheet cho ${entity.name}`}
          onClick={() => {
            log.debug('onClick', 'add sheet', { entityKey: entity.key });
            onAddSheet(entity.key);
          }}
          className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
        </button>

        <div className="flex-1" />

        {/* DEFERRED: swap hard-disabled on every tab (swap API not ready).
            Future phase → `disabled={anySwapRunning}` + drop the tooltip. */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper — a disabled button swallows hover events. */}
              <span>
                <button
                  type="button"
                  aria-label={`Swap ${entity.name} — ${SWAP_DISABLED_REASON}`}
                  aria-busy={swapTask.state === 'running'}
                  aria-disabled
                  disabled
                  onClick={() => {
                    if (anySwapRunning) return;
                    onSwapEntity(entity.key);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{SWAP_DISABLED_REASON}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Sheet rows — listbox */}
      <div
        role="listbox"
        aria-label={`Crop sheets của ${entity.name}`}
        className="flex flex-col pb-1.5"
      >
        {entity.crop_sheets.map((_, index) => {
          const isSheetActive =
            isRowActive && activeSheetRef.sheetIndex === index;
          return (
            <div
              key={`${entity.key}-sheet-${index}`}
              role="option"
              aria-selected={isSheetActive}
              tabIndex={isSheetActive ? 0 : -1}
              onClick={() => {
                log.debug('onClick', 'select sheet', {
                  entityKey: entity.key,
                  sheetIndex: index,
                });
                onSelectSheet(entity.key, index);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSheet(entity.key, index);
                  return;
                }
                handleSheetKeyDown(e, index);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 py-1 pr-3 text-sm transition-colors',
                'focus:outline-none focus:ring-1 focus:ring-inset focus:ring-ring',
                isSheetActive
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
              style={{ paddingLeft: 36 }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isSheetActive ? 'bg-primary' : 'bg-muted-foreground/40',
                )}
              />
              Sheet {index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}
