// variant-row.tsx — Middle level of the 3-level sidebar tree (char/prop only).
// Header: caret ▾/▸ + name + @variantKey + stepper [−][+].
//   • Click caret  → toggle variant collapse (sheet group show/hide).
//   • Click name   → onSelectVariant(entityKey, variantKey).
//   • Stepper      → onAddSheet / onRemoveSheet (variantKey-scoped).
// Stepper events stopPropagation so the click does NOT bubble to the variant
// name handler.

import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixVariantGroup } from '@/types/remix';
import { SHEET_MIN } from '../swap-modal-constants';

const log = createLogger('Editor', 'VariantRow');

interface VariantRowProps {
  entityKey: string;
  variant: RemixVariantGroup;
  isCollapsed: boolean;
  isActive: boolean;
  onToggleCollapse: () => void;
  onSelectVariant: () => void;
  onAddSheet: () => void;
  onRemoveSheet: () => void;
  /** ID of the sheet-group region (for `aria-controls`). */
  sheetGroupId: string;
}

export function VariantRow({
  entityKey,
  variant,
  isCollapsed,
  isActive,
  onToggleCollapse,
  onSelectVariant,
  onAddSheet,
  onRemoveSheet,
  sheetGroupId,
}: VariantRowProps) {
  const removeDisabled = variant.sheetIndices.length <= SHEET_MIN;

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      log.debug('handleNameKeyDown', 'activate variant via keyboard', {
        entityKey,
        variantKey: variant.variantKey,
      });
      onSelectVariant();
    }
  };

  return (
    <div
      role="treeitem"
      aria-level={2}
      aria-expanded={!isCollapsed}
      aria-selected={isActive}
      aria-controls={sheetGroupId}
      className={cn(
        'flex items-center gap-1 py-1 pr-2 text-sm transition-colors',
        'focus-within:outline-none',
        isActive
          ? 'bg-[var(--swap-modal-selection)] text-[var(--swap-modal-text-primary)]'
          : 'text-[var(--swap-modal-text-secondary)] hover:bg-[var(--swap-modal-surface-hover)]',
      )}
      style={{ paddingLeft: 20 }}
    >
      {/* Caret — toggles collapse only, does NOT select the variant. */}
      <button
        type="button"
        aria-label={`${isCollapsed ? 'Mở' : 'Đóng'} sheet của variant ${variant.name}`}
        onClick={(e) => {
          e.stopPropagation();
          log.debug('onClick', 'toggle variant caret', {
            entityKey,
            variantKey: variant.variantKey,
            wasCollapsed: isCollapsed,
          });
          onToggleCollapse();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)]"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Name + @key — clicking here sets variant active. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          log.debug('onClick', 'select variant', {
            entityKey,
            variantKey: variant.variantKey,
          });
          onSelectVariant();
        }}
        onKeyDown={handleNameKeyDown}
        className="min-w-0 flex-1 cursor-pointer truncate focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]"
      >
        <span className="truncate font-medium">{variant.name}</span>
        <span className="ml-1 text-xs text-[var(--swap-modal-text-muted)]">
          · @{variant.variantKey}
        </span>
      </div>

      {/* Stepper — stopPropagation so clicks don't bubble into the name handler. */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Bớt sheet cho variant ${variant.name}`}
          disabled={removeDisabled}
          onClick={(e) => {
            e.stopPropagation();
            log.debug('onClick', 'remove sheet from variant', {
              entityKey,
              variantKey: variant.variantKey,
              count: variant.sheetIndices.length,
            });
            onRemoveSheet();
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-[var(--swap-modal-surface-hover)] text-[rgba(255,255,255,0.75)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label={`Thêm sheet cho variant ${variant.name}`}
          onClick={(e) => {
            e.stopPropagation();
            log.debug('onClick', 'add sheet to variant', {
              entityKey,
              variantKey: variant.variantKey,
              count: variant.sheetIndices.length,
            });
            onAddSheet();
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-[var(--swap-modal-surface-hover)] text-[rgba(255,255,255,0.75)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)]"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
