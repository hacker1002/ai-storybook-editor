// sheet-row.tsx — Leaf row in the 3-level sidebar tree.
// Dot + sheet title; click selects; Enter/Space activates; ↑/↓ flatten navigation
// is owned by EntityRow (passed in as `onArrowNavigate`).

import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixCropSheet } from '@/types/remix';

const log = createLogger('Editor', 'SheetRow');

interface SheetRowProps {
  entityKey: string;
  /** null for mix entity (sheets live directly under entity). */
  variantKey: string | null;
  sheet: RemixCropSheet;
  /** Index local to the variant bucket (char/prop) or to entity.crop_sheets (mix). */
  sheetIndex: number;
  /** Indent in px — char/prop sheet = 52, mix sheet = 36 (design §4.12). */
  indentPx: number;
  isActive: boolean;
  ariaLevel: 2 | 3;
  /** Default display label "Sheet n" — caller supplies 1-based n. */
  fallbackTitleNumber: number;
  onSelect: () => void;
  /** ↑/↓ on a sheet row → parent flattens across visible variants then dispatches. */
  onArrowNavigate: (
    direction: 'up' | 'down',
    currentEl: HTMLElement,
  ) => void;
}

export function SheetRow({
  entityKey,
  variantKey,
  sheet,
  sheetIndex,
  indentPx,
  isActive,
  ariaLevel,
  fallbackTitleNumber,
  onSelect,
  onArrowNavigate,
}: SheetRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      log.debug('handleKeyDown', 'activate sheet via keyboard', {
        entityKey,
        variantKey,
        sheetIndex,
      });
      onSelect();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onArrowNavigate('up', e.currentTarget);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onArrowNavigate('down', e.currentTarget);
      return;
    }
  };

  return (
    <div
      role="treeitem"
      aria-level={ariaLevel}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      data-sheet-row="true"
      data-entity-key={entityKey}
      data-variant-key={variantKey ?? ''}
      data-sheet-index={sheetIndex}
      onClick={() => {
        log.debug('onClick', 'select sheet', {
          entityKey,
          variantKey,
          sheetIndex,
        });
        onSelect();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex cursor-pointer items-center gap-2 py-1 pr-3 text-sm transition-colors',
        'focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]',
        isActive
          ? 'bg-[var(--swap-modal-surface-hover)] font-medium text-[var(--swap-modal-text-primary)]'
          : 'text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-secondary)]',
      )}
      style={{ paddingLeft: indentPx }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          isActive ? 'bg-[var(--swap-modal-accent)]' : 'bg-white/30',
        )}
      />
      <span className="truncate">
        {sheet.title || `Sheet ${fallbackTitleNumber}`}
      </span>
    </div>
  );
}
