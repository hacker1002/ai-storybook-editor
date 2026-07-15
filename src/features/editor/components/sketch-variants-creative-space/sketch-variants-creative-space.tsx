// sketch-variants-creative-space.tsx — root of the Variant creative space (design README §2). ONE
// space for BOTH kinds (character + prop non-base variants) — NO `kind` prop. Owns the local UI
// state (selected variant, active tab, zoom, expanded groups, the two overlay-modal states, the
// regenerate-confirm target) and DERIVES the effective selection in RENDER (React 19: NO
// useEffect+setState, NO ref read/write in render body). Generate is an async 2-phase job
// (generate → auto-cut); the gate mirrors the endpoint's 3 hard preconditions and re-computes
// reactively because it reads the subscribed entities + art-style id.
//
// ⚠️ Export name MUST stay `SketchVariantsCreativeSpace` (editor-page routing imports it).

import { useCallback, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useSketchEntities,
  useSketchVariantByKey,
  useVariantSheetGenerateOp,
  useVariantSheetGenerateStatus,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { useSketchStyleId } from '@/stores/book-store';
import { CANVAS_CONFIRM_DIALOG_Z } from '@/constants/spread-constants';
import type { BaseKind, SketchEntity, VariantRef } from '@/types/sketch';
import { createLogger } from '@/utils/logger';
import { VariantKindSidebar } from './variant-kind-sidebar';
import { VariantSheetContentArea } from './variant-sheet-content-area';
import { EditVariantModal } from './edit-variant-modal';
import { VariantEditImageModal } from './variant-edit-image-modal';
import {
  KIND_GROUPS,
  ZOOM,
  isBlank,
  sameRef,
  type EditImageTarget,
  type VariantGate,
  type VariantGenStatus,
} from './sketch-variants-constants';

const log = createLogger('Editor', 'SketchVariantsCreativeSpace');

/** Every non-base variant of a kind's entities → VariantRef[] (DRY: refs + gate share the source). */
function nonBaseRefs(kind: BaseKind, entities: SketchEntity[]): VariantRef[] {
  return entities.flatMap((e) =>
    e.variants.filter((v) => v.key !== 'base').map((v) => ({ kind, entityKey: e.key, variantKey: v.key })),
  );
}

export function SketchVariantsCreativeSpace() {
  // Full entities (both kinds) — the source for BOTH the row refs AND the reactive gate.
  const charEntities = useSketchEntities('characters');
  const propEntities = useSketchEntities('props');
  // book.sketchstyle_id (art_styles.type=0) — REQUIRED to generate; the gate blocks when null.
  const artStyleId = useSketchStyleId();
  // Single-flight op — drives the per-row spinner (across both kinds) + the content-area busy state.
  const op = useVariantSheetGenerateOp();
  const { startVariantSheetGenerate, selectSketchVariantCrop } = useSnapshotActions();

  // ── Local UI state (owner = this root; state-location rule) ────────────────────────────────
  const [selectedVariant, setSelectedVariant] = useState<VariantRef | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'crop'>('raw');
  const [zoom, setZoom] = useState<number>(ZOOM.default);
  const [expandedGroups, setExpandedGroups] = useState<Record<BaseKind, boolean>>({
    characters: true,
    props: true,
  });
  const [editingVariant, setEditingVariant] = useState<VariantRef | null>(null);
  const [editImageTarget, setEditImageTarget] = useState<EditImageTarget | null>(null);
  // Regenerate confirm target (AlertDialog over canvas) — set EVERY time ✨ hits a variant that
  // already has crops (user-locked: confirm every time, guards losing the pick + per-cell edits).
  const [pendingRegenerate, setPendingRegenerate] = useState<VariantRef | null>(null);

  // Row refs per kind (non-base), derived from the subscribed entities.
  const refsByKind = useMemo<Record<BaseKind, VariantRef[]>>(
    () => ({
      characters: nonBaseRefs('characters', charEntities),
      props: nonBaseRefs('props', propEntities),
    }),
    [charEntities, propEntities],
  );
  const allRefs = useMemo(
    () => [...refsByKind.characters, ...refsByKind.props],
    [refsByKind],
  );

  // Derive the effective selection in RENDER (React 19: never set state in render): keep the user's
  // choice while it is still present, else fall back to the first available variant. Recomputes with
  // no effect + no loop when a variant is removed / the lists change.
  const selected = useMemo<VariantRef | null>(() => {
    if (selectedVariant && allRefs.some((r) => sameRef(r, selectedVariant))) return selectedVariant;
    return allRefs[0] ?? null;
  }, [selectedVariant, allRefs]);

  // Targeted reads for the content area (fallback args when nothing is selected → undefined / idle).
  const selectedVariantData = useSketchVariantByKey(
    selected?.kind ?? 'characters',
    selected?.entityKey ?? '',
    selected?.variantKey ?? '',
  );
  const genStatusSelected = useVariantSheetGenerateStatus(
    selected?.kind ?? 'characters',
    selected?.entityKey ?? '',
    selected?.variantKey ?? '',
  );

  // Per-row generate status from the single-flight op (fresh on every phase/error transition).
  const genStatusByRef = useCallback(
    (ref: VariantRef): VariantGenStatus => {
      if (op && sameRef(op, ref)) return { isBusy: !op.error, phase: op.phase, error: op.error };
      return { isBusy: false };
    },
    [op],
  );

  // Generate gate — FE fail-fast on the endpoint's 3 hard preconditions. REACTIVE: reads the
  // subscribed artStyleId + entities, so it re-computes when the art style / base crop / variant
  // text changes (the ✨ enabled state tracks live data). Never hides — the sidebar disables + tooltips.
  const gateByRef = useCallback(
    (ref: VariantRef): VariantGate => {
      // `!artStyleId` (not `== null`) matches the job's start-guard exactly, so an empty-string
      // style id gates the same way — otherwise ✨ would render enabled but no-op on click.
      if (!artStyleId) return { canGenerate: false, reason: 'no-art-style' };
      const entities = ref.kind === 'characters' ? charEntities : propEntities;
      const entity = entities.find((e) => e.key === ref.entityKey);
      const base = entity?.variants.find((v) => v.key === 'base');
      if (!base?.raw_sheet?.crops?.some((c) => c.is_selected)) {
        return { canGenerate: false, reason: 'base-not-ready' };
      }
      const variant = entity?.variants.find((v) => v.key === ref.variantKey);
      if (isBlank(variant?.visual_design) && isBlank(variant?.art_language)) {
        return { canGenerate: false, reason: 'empty-text' };
      }
      return { canGenerate: true };
    },
    [artStyleId, charEntities, propEntities],
  );

  // ── Handlers (set state only; job / store side effects delegated) ───────────────────────────
  const handleSelect = useCallback((ref: VariantRef) => {
    setSelectedVariant(ref);
    setActiveTab('raw');
  }, []);

  const handleToggleGroup = useCallback((kind: BaseKind) => {
    setExpandedGroups((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  const handleEditVariant = useCallback((ref: VariantRef) => {
    setEditingVariant(ref);
  }, []);

  // ✨ Generate: variant already has crops → confirm EVERY time (guards pick/edit); empty → straight.
  const handleGenerate = useCallback(
    (ref: VariantRef) => {
      const entities = ref.kind === 'characters' ? charEntities : propEntities;
      const variant = entities
        .find((e) => e.key === ref.entityKey)
        ?.variants.find((v) => v.key === ref.variantKey);
      const hasCrops = (variant?.raw_sheet?.crops?.length ?? 0) > 0;
      if (hasCrops) {
        log.debug('handleGenerate', 'crops present → confirm regenerate', {
          kind: ref.kind,
          entityKey: ref.entityKey,
          variantKey: ref.variantKey,
        });
        setPendingRegenerate(ref);
        return;
      }
      log.info('handleGenerate', 'start variant sheet generate', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
      });
      startVariantSheetGenerate(ref);
    },
    [charEntities, propEntities, startVariantSheetGenerate],
  );

  const confirmRegenerate = useCallback(() => {
    if (pendingRegenerate) {
      log.info('confirmRegenerate', 'regenerate confirmed', {
        kind: pendingRegenerate.kind,
        entityKey: pendingRegenerate.entityKey,
        variantKey: pendingRegenerate.variantKey,
      });
      startVariantSheetGenerate(pendingRegenerate);
    }
    setPendingRegenerate(null);
  }, [pendingRegenerate, startVariantSheetGenerate]);

  const handleSelectCrop = useCallback(
    (cropIndex: number) => {
      if (!selected) return;
      log.debug('handleSelectCrop', 'lock crop', { cropIndex });
      selectSketchVariantCrop(selected.kind, selected.entityKey, selected.variantKey, cropIndex);
    },
    [selected, selectSketchVariantCrop],
  );

  const handleEditCrop = useCallback(
    (cropIndex: number) => {
      if (!selected) return;
      setEditImageTarget({
        kind: selected.kind,
        entityKey: selected.entityKey,
        variantKey: selected.variantKey,
        cropIndex,
      });
    },
    [selected],
  );

  const regenerateMention = pendingRegenerate
    ? `@${pendingRegenerate.entityKey}/${pendingRegenerate.variantKey}`
    : '';

  return (
    <main className="flex h-full" role="main" aria-label="Sketch variant creative space">
      <VariantKindSidebar
        groups={KIND_GROUPS}
        refsByKind={refsByKind}
        selectedVariant={selected}
        expandedGroups={expandedGroups}
        genStatusByRef={genStatusByRef}
        gateByRef={gateByRef}
        onSelect={handleSelect}
        onToggleGroup={handleToggleGroup}
        onEditVariant={handleEditVariant}
        onGenerate={handleGenerate}
      />

      <div className="flex flex-1 min-w-[480px] overflow-hidden">
        {selected ? (
          <VariantSheetContentArea
            selectedVariant={selected}
            variant={selectedVariantData}
            activeTab={activeTab}
            zoom={zoom}
            genStatus={genStatusSelected}
            onChangeTab={setActiveTab}
            onChangeZoom={setZoom}
            onSelectCrop={handleSelectCrop}
            onEditCrop={handleEditCrop}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Overlays (mount by state). Text modal writes + flushes; EditImageModal is store-bound by crop. */}
      {editingVariant && (
        <EditVariantModal
          kind={editingVariant.kind}
          entityKey={editingVariant.entityKey}
          variantKey={editingVariant.variantKey}
          onClose={() => setEditingVariant(null)}
        />
      )}
      {editImageTarget && (
        <VariantEditImageModal target={editImageTarget} onClose={() => setEditImageTarget(null)} />
      )}

      {/* Regenerate confirm — over-canvas z (shadcn default z-50 is buried by canvas textboxes). */}
      <AlertDialog
        open={pendingRegenerate !== null}
        onOpenChange={(open) => !open && setPendingRegenerate(null)}
      >
        <AlertDialogContent zIndex={CANVAS_CONFIRM_DIALOG_Z}>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate {regenerateMention}?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites the current 4 candidate crops for {regenerateMention}. The picked cell and
              any per-cell edits will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegenerate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** Shown when there is no non-base variant in either kind yet (nothing imported in the Base space). */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <Copy className="h-10 w-10 opacity-60" aria-hidden="true" />
      <div>
        <p className="text-sm">No variant yet</p>
        <p className="mt-1 text-xs">Import characters/props in the Base space first.</p>
      </div>
    </div>
  );
}
