// crop-sheet-entity-sidebar.tsx — Left sidebar of SwapCropSheetModal (design §3.2).
// 3-level tree for character / prop entities:
//   Entity ─▶ Variant ─▶ Sheet
// 2-level tree for mix entities:
//   Entity ─▶ Sheet
//
// Heavy lifting (entity row, variant row, sheet row, collapse state, keyboard
// navigation) lives in `./sidebar/`. This file is the orchestrator: section
// header + entity loop + collapse-state owner.
//
// Validation Session 1:
//  • The [⇄] swap button is HARD-DISABLED on every tab — the swap endpoint is
//    not shipped. `onSwapEntity` is kept in the contract for spec parity; the
//    EntityRow does NOT wire it to any click handler.
//    TODO(swap-endpoint): re-enable khi POST /api/jobs/remix/{id}/entity-swap ship.

import { createLogger } from '@/utils/logger';
import type { RemixEntityRef } from '@/types/remix';
import {
  HEADER_HEIGHT_PX,
  LEFT_SIDEBAR_WIDTH_PX,
  type RemixEntityType,
} from './swap-modal-constants';
import { EntityRow } from './sidebar/entity-row';
import { useSidebarCollapseState } from './sidebar/use-collapse-state';

const log = createLogger('Editor', 'CropSheetEntitySidebar');

interface ActiveSheetRef {
  entityKey: string;
  variantKey: string | null;
  sheetIndex: number;
}

interface CropSheetEntitySidebarProps {
  remixId: string;
  type: RemixEntityType;
  entities: RemixEntityRef[];
  activeSheetRef: ActiveSheetRef;
  /** True while any swap runs anywhere in the remix — v1 always false ([⇄] disabled). */
  anySwapRunning: boolean;
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
  /** Kept for spec parity — Validation S1 hard-disables the [⇄] button. */
  onSwapEntity: (entityKey: string) => void;
  /** char/prop only — opens VariantsVisualModal (Phase 05). */
  onOpenVariants: (entityKey: string) => void;
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
  onSelectVariant,
  onSelectSheet,
  onAddSheet,
  onRemoveSheet,
  onSwapEntity,
  onOpenVariants,
}: CropSheetEntitySidebarProps) {
  const collapse = useSidebarCollapseState();

  log.debug('render', 'render sidebar', {
    type,
    entityCount: entities.length,
    activeEntityKey: activeSheetRef.entityKey,
  });

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-bg)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
    >
      <div
        className="flex shrink-0 items-center border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          {SECTION_LABEL[type]}
        </p>
      </div>

      {entities.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--swap-modal-text-muted)]">
          Tab này chưa có key nào.
        </p>
      ) : (
        <div
          role="tree"
          aria-label={`Danh sách ${SECTION_LABEL[type].toLowerCase()}`}
          className="flex flex-col gap-1 overflow-y-auto py-2"
        >
          {entities.map((entity) => (
            <EntityRow
              key={entity.key}
              remixId={remixId}
              type={type}
              entity={entity}
              activeSheetRef={activeSheetRef}
              anySwapRunning={anySwapRunning}
              collapse={collapse}
              onSelectVariant={onSelectVariant}
              onSelectSheet={onSelectSheet}
              onAddSheet={onAddSheet}
              onRemoveSheet={onRemoveSheet}
              onSwapEntity={onSwapEntity}
              onOpenVariants={onOpenVariants}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
