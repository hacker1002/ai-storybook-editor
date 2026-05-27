// variants-tab.tsx — Variants tab of the rev2 swap modal (Phase 07).
//
// Presentational tab panel: Entity→Variant sidebar (VariantsSidebar) + center
// CropSheetStage (mode='variants', Generate/Retry + Compare). All data flows in
// via props (root owns the shared state). The ONLY local state is
// `collapsedEntities` (sidebar tree collapse) — the shared use-collapse-state
// hook is intentionally NOT used here (Phase 08 owns reworking that).
//
// Generate orchestration lives in the ROOT (`onRunGenerate` → runVariantSwap).
// This tab only computes gating + the active before/after URLs and calls back.
// Gating reads `useRemixConfigCharacter` (read-only selector — safe in a tab).
//
// SECURITY: never log image URLs (Generate output is a real-person likeness).

import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { useRemixConfigCharacter } from '@/stores/remix-store';
import type { RemixVariantEntity, SwapPreviewState } from '@/types/remix';
import { CropSheetStage } from '../crop-sheet-stage';
import { VariantsSidebar } from './variants-sidebar';

const log = createLogger('Editor', 'VariantsTab');

export interface VariantsTabProps {
  remixId: string;
  entities: RemixVariantEntity[];
  activeVariantRef: { entityKey: string; variantKey: string } | null;
  variantSwapTasks: Record<string, SwapPreviewState>;
  onSelectVariant: (entityKey: string, variantKey: string) => void;
  onRunGenerate: (entityKey: string, variantKey: string) => void;
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  onToggleCompare: () => void;
  onZoomChange: (z: number) => void;
  onDividerChange: (p: number) => void;
}

export function VariantsTab({
  remixId,
  entities,
  activeVariantRef,
  variantSwapTasks,
  onSelectVariant,
  onRunGenerate,
  compareMode,
  zoomLevel,
  dividerPosition,
  onToggleCompare,
  onZoomChange,
  onDividerChange,
}: VariantsTabProps) {
  // Local sidebar collapse — own useState (NOT the shared collapse hook).
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleEntity = (entityKey: string) =>
    setCollapsedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityKey)) next.delete(entityKey);
      else next.add(entityKey);
      return next;
    });

  // ── Derive active entity / variant / task / before+after (phase-07 §2) ─────
  const active = activeVariantRef;
  const { entity, variant } = useMemo(() => {
    const e = active
      ? (entities.find((x) => x.key === active.entityKey) ?? null)
      : null;
    const v = e && active
      ? (e.variants.find((x) => x.variantKey === active.variantKey) ?? null)
      : null;
    return { entity: e, variant: v };
  }, [entities, active]);

  const taskKey = active ? `${active.entityKey}/${active.variantKey}` : null;
  const task = taskKey ? variantSwapTasks[taskKey] : undefined;
  const beforeUrl = variant?.illustrationUrl ?? null;
  const afterUrl = variant?.visualSwapUrl ?? task?.afterUrl ?? null;
  const isSwapping = task?.status === 'loading';

  // ── Gating (phase-07 §3 / spec §6.3) — character-only ──────────────────────
  // Read-only selector for the frozen remix_config character pick (+ joined
  // converted_image). Returns null for prop / unknown key.
  const cfgChar = useRemixConfigCharacter(remixId, entity?.key ?? '');
  const baseNode = entity?.variants.find((v) => v.isBase) ?? null;
  // Non-base variants reuse the base variant's swapped visual as Image #2 — they
  // stay gated until the base variant has been swapped. Base has no dependency.
  const baseSwapReady = variant?.isBase || baseNode?.visualSwapUrl != null;
  const hasEnabledTrait = cfgChar?.traits.some((t) => t.is_enabled) ?? false;

  const canGenerate =
    entity?.type === 'character' &&
    cfgChar?.human_id != null &&
    cfgChar?.visual != null &&
    cfgChar?.converted_image != null &&
    hasEnabledTrait &&
    beforeUrl != null &&
    baseSwapReady;

  // Tooltip reason when Generate is disabled (PII-safe — no human data).
  const gateTooltip = useMemo<string | undefined>(() => {
    if (canGenerate) return undefined;
    if (!entity) return 'Chọn một variant để tạo swap.';
    if (entity.type !== 'character')
      return 'Generate chỉ khả dụng cho character.';
    if (cfgChar == null) return 'Character này chưa được cấu hình để swap.';
    if (cfgChar.human_id == null || cfgChar.visual == null)
      return 'Chưa chọn human/visual cho character này.';
    if (cfgChar.converted_image == null)
      return 'Hãy chạy Extract cho human này trước.';
    if (!hasEnabledTrait) return 'Bật ít nhất 1 trait.';
    if (beforeUrl == null) return 'Không có visual để swap.';
    if (!baseSwapReady) return 'Hãy swap variant base trước.';
    return undefined;
  }, [
    canGenerate,
    entity,
    cfgChar,
    hasEnabledTrait,
    beforeUrl,
    baseSwapReady,
  ]);

  const generateDisabled = !canGenerate || isSwapping;

  log.debug('render', 'variants tab', {
    remixId,
    entityCount: entities.length,
    activeEntityKey: active?.entityKey ?? null,
    activeVariantKey: active?.variantKey ?? null,
    canGenerate,
    isSwapping: isSwapping ?? false,
  });

  const handleGenerate = () => {
    if (!active) return;
    log.info('handleGenerate', 'run generate for variant', {
      entityKey: active.entityKey,
      variantKey: active.variantKey,
    });
    onRunGenerate(active.entityKey, active.variantKey);
  };

  return (
    <>
      <VariantsSidebar
        entities={entities}
        activeVariantRef={active}
        collapsedEntities={collapsedEntities}
        onToggleEntity={toggleEntity}
        onSelectVariant={onSelectVariant}
      />

      {active && variant ? (
        <CropSheetStage
          source={{ mode: 'variants', beforeUrl, afterUrl }}
          headerPrimary={{
            label: task?.status === 'error' ? 'Retry' : 'Generate',
            icon: Zap,
            disabled: generateDisabled,
            tooltip: gateTooltip,
            busy: task?.status === 'loading',
            onClick: handleGenerate,
          }}
          compareMode={compareMode}
          zoomLevel={zoomLevel}
          dividerPosition={dividerPosition}
          swapTask={task}
          onToggleCompare={onToggleCompare}
          onZoomChange={onZoomChange}
          onDividerChange={onDividerChange}
        />
      ) : (
        <section
          className="flex h-full min-w-0 flex-1 items-center justify-center bg-[var(--swap-modal-bg)] p-8 text-center"
          aria-label="Variants stage"
        >
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Chọn một variant để xem visual.
          </p>
        </section>
      )}
    </>
  );
}
