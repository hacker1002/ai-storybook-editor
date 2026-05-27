// variants-sidebar.tsx — Entity→Variant tree for the rev2 VariantsTab.
//
// Two-level ARIA tree (role=tree → entity treeitem → variant treeitem). Each
// entity row toggles a LOCAL `collapsedEntities` Set (owned by the tab, NOT the
// shared use-collapse-state hook — Phase 08 reworks that). Caret/name on the
// entity toggles collapse only; clicking a variant fires `onSelectVariant`.
//
// Renders ONLY the variants present in `entity.variants[]` (raw projection — no
// synthetic base group in the rev2 model). A "CHƯA SWAP" pill marks variants
// whose `visualSwapUrl` is still null (no swapped visual generated yet).

import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixVariantEntity } from '@/types/remix';
import { LEFT_SIDEBAR_WIDTH_PX } from '../swap-modal-constants';

const log = createLogger('Editor', 'VariantsSidebar');

interface VariantsSidebarProps {
  entities: RemixVariantEntity[];
  activeVariantRef: { entityKey: string; variantKey: string } | null;
  collapsedEntities: Set<string>;
  onToggleEntity: (entityKey: string) => void;
  onSelectVariant: (entityKey: string, variantKey: string) => void;
}

export function VariantsSidebar({
  entities,
  activeVariantRef,
  collapsedEntities,
  onToggleEntity,
  onSelectVariant,
}: VariantsSidebarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Variants"
    >
      <div className="flex shrink-0 items-center border-b border-[var(--swap-modal-border)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          Variants
        </p>
      </div>

      {entities.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Không có character/prop nào.
          </p>
        </div>
      ) : (
        <div role="tree" aria-label="Variants tree" className="min-h-0 flex-1 overflow-y-auto py-1">
          {entities.map((entity) => (
            <EntityNode
              key={entity.key}
              entity={entity}
              activeVariantRef={activeVariantRef}
              collapsed={collapsedEntities.has(entity.key)}
              onToggleEntity={onToggleEntity}
              onSelectVariant={onSelectVariant}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface EntityNodeProps {
  entity: RemixVariantEntity;
  activeVariantRef: { entityKey: string; variantKey: string } | null;
  collapsed: boolean;
  onToggleEntity: (entityKey: string) => void;
  onSelectVariant: (entityKey: string, variantKey: string) => void;
}

function EntityNode({
  entity,
  activeVariantRef,
  collapsed,
  onToggleEntity,
  onSelectVariant,
}: EntityNodeProps) {
  const isActiveEntity = activeVariantRef?.entityKey === entity.key;

  const toggle = () => {
    log.debug('toggle', 'toggle entity collapse', {
      entityKey: entity.key,
      wasCollapsed: collapsed,
    });
    onToggleEntity(entity.key);
  };

  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={!collapsed}
      aria-selected={isActiveEntity}
      className="flex flex-col"
    >
      {/* Entity header — caret + name toggles collapse only (never sets active). */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className="flex cursor-pointer items-center gap-1.5 px-3 pb-2 pt-2.5 transition-colors hover:bg-[var(--swap-modal-surface-hover)] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--swap-modal-text-muted)]"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--swap-modal-text-primary)]">
            {entity.name}
          </p>
          <p className="truncate text-xs text-[var(--swap-modal-text-muted)]">
            @{entity.key}
          </p>
        </div>
      </div>

      {!collapsed && entity.variants.length > 0 && (
        <div role="group" className="flex flex-col">
          {entity.variants.map((variant) => {
            const isActive =
              activeVariantRef?.entityKey === entity.key &&
              activeVariantRef?.variantKey === variant.variantKey;
            const notSwapped = variant.visualSwapUrl == null;
            return (
              <div
                key={variant.variantKey}
                role="treeitem"
                aria-level={2}
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => {
                  log.debug('onClick', 'select variant', {
                    entityKey: entity.key,
                    variantKey: variant.variantKey,
                  });
                  onSelectVariant(entity.key, variant.variantKey);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectVariant(entity.key, variant.variantKey);
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 py-1.5 pr-2 text-sm transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]',
                  isActive
                    ? 'bg-[var(--swap-modal-selection)] text-[var(--swap-modal-text-primary)]'
                    : 'text-[var(--swap-modal-text-secondary)] hover:bg-[var(--swap-modal-surface-hover)]',
                )}
                style={{ paddingLeft: 32 }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="truncate font-medium">{variant.name}</span>
                  <span className="ml-1.5 text-xs text-[var(--swap-modal-text-muted)]">
                    @{variant.variantKey}
                  </span>
                </span>
                {notSwapped && (
                  <span className="shrink-0 rounded bg-[var(--swap-modal-surface-hover-strong)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
                    Chưa swap
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
