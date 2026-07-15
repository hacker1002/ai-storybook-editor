// sketch-variants-creative-space.tsx — root of the Variant creative space (design README §2). ONE
// space for BOTH kinds (character + prop non-base variants) — NO `kind` prop. Owns the local UI
// state (selected variant, active tab, zoom, expanded groups, the two overlay-modal states, the
// regenerate-confirm target) and DERIVES the effective selection in RENDER (React 19: NO
// useEffect+setState, NO ref read/write in render body).
//
// Collab (ADR-047 / Path B — the 7th collab space): mounts `useCollabPersistSession` (header
// Saving…→Saved + suppress owner-direct autosave) + `useContentSyncSession` (peer refetch), and a
// per-ENTITY HELD lock (`useHeldResourceSession`, step 1 / rtype 3 char · 4 prop, whole-node grain).
// Lock-on-interact (browse ≠ lock): `activeLockEntity` is set ONLY by a genuine interaction (edit
// text / edit crop / select crop / generate), never by browsing. Every write persists the WHOLE
// entity node through the gateway; generate additionally flush-before-generate (snapshot-reading —
// risk #1) INSIDE the job slice. Peer-lock is advisory (veil + sidebar badge); the acquire 409 is
// the real authority.
//
// ⚠️ Export name MUST stay `SketchVariantsCreativeSpace` (editor-page routing imports it).

import { useCallback, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
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
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useCurrentBookId } from '@/stores/book-store';
import {
  useResourceLockStore,
  useIsLockedByOther,
  useLockHolderName,
  type LockTarget,
  type SavePayload,
} from '@/stores/resource-lock-store';
import {
  resolveSketchVariantLockTarget,
  buildSketchEntityPayload,
  flushSketchEntityUnderLock,
} from '@/stores/snapshot-store/slices/collab-sketch-variant-save-helper';
import { useCollabPersistSession } from '@/features/editor/hooks/use-collab-persist-session';
import { useContentSyncSession } from '@/features/editor/hooks/use-content-sync-session';
import { useHeldResourceSession } from '@/features/editor/hooks/use-held-resource-session';
import { LockedByOtherOverlay } from '@/features/editor/components/shared-components/sketch-locked-by-other-overlay';
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

/** The entity the user is actively editing → the held-lock target (null = browsing only). */
interface ActiveLockEntity {
  kind: BaseKind;
  entityKey: string;
}

/** Every non-base variant of a kind's entities → VariantRef[] (DRY: refs + gate share the source). */
function nonBaseRefs(kind: BaseKind, entities: SketchEntity[]): VariantRef[] {
  return entities.flatMap((e) =>
    e.variants.filter((v) => v.key !== 'base').map((v) => ({ kind, entityKey: e.key, variantKey: v.key })),
  );
}

/** True when two entity refs point at the SAME sketch entity (kind + key — key is unique per kind only). */
function sameEntity(a: ActiveLockEntity | null, b: { kind: BaseKind; entityKey: string } | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.entityKey === b.entityKey;
}

export function SketchVariantsCreativeSpace() {
  // ── Collab session mount (ADR-047) — header label + peer channels + owner-autosave suppression. ─
  const bookId = useCurrentBookId();
  useCollabPersistSession(bookId);
  useContentSyncSession(bookId);

  // Full entities (both kinds) — the source for BOTH the row refs AND the reactive gate.
  const charEntities = useSketchEntities('characters');
  const propEntities = useSketchEntities('props');
  // Single-flight op — drives the per-row spinner (across both kinds) + the content-area busy state.
  const op = useVariantSheetGenerateOp();
  const { startVariantSheetGenerate, selectSketchVariantCrop, autoSaveSnapshot } = useSnapshotActions();

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
  // LOCK-ON-INTERACT choke point: the entity the user is editing → held-lock target. Stays null
  // until a genuine interaction (never set by browse) so the lock never auto-acquires on mount.
  const [activeLockEntity, setActiveLockEntity] = useState<ActiveLockEntity | null>(null);

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

  // Generate gate — FE fail-fast on the endpoint's hard preconditions. REACTIVE: reads the
  // subscribed entities so it re-computes when the base crop / variant text changes. Never hides —
  // the sidebar disables + tooltips. ⚡ ADR-047: the `no-art-style` gate is GONE (style is inferred
  // from the BASE_VARIANT; backend dropped artStyleId) → gate = BASE_NOT_READY + EMPTY_VARIANT_DESCRIPTION.
  const gateByRef = useCallback(
    (ref: VariantRef): VariantGate => {
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
    [charEntities, propEntities],
  );

  // ── Per-entity held session (ADR-047) ──────────────────────────────────────────────────────
  // Lock target — null until a genuine interaction sets `activeLockEntity` (browse ≠ lock).
  const lockTarget = useMemo<LockTarget | null>(
    () =>
      activeLockEntity
        ? resolveSketchVariantLockTarget(activeLockEntity.kind, activeLockEntity.entityKey)
        : null,
    [activeLockEntity],
  );

  // Live (non-reactive) read of the WHOLE locked entity node — baseline + dirty-diff source. Reads
  // getState() by the closure so a switch's release-cleanup still sees the OLD entity.
  const getNode = useCallback(
    () =>
      activeLockEntity
        ? useSnapshotStore
            .getState()
            .sketch[activeLockEntity.kind].find((e) => e.key === activeLockEntity.entityKey) ?? null
        : null,
    [activeLockEntity],
  );
  const buildPayload = useCallback((node: unknown): SavePayload => buildSketchEntityPayload(node), []);

  // 409 on acquire → another editor holds this entity. Toast + drop the interaction (idle).
  const handleLockBlocked = useCallback((holder: string) => {
    log.info('handleLockBlocked', 'entity held by another editor', { hasHolder: !!holder });
    toast.info('Another editor is editing this entity — your change was not saved.');
    setActiveLockEntity(null);
  }, []);

  // Heartbeat 409 → lock stolen mid-edit. Deselect + toast; content-sync reconciles the winner's node.
  const handleLockLost = useCallback(() => {
    log.warn('handleLockLost', 'entity lock lost — deselect');
    setActiveLockEntity(null);
    toast.warning('You lost the edit lock for this entity — a later change may not have saved.');
  }, []);

  // Held session drives the SUSTAINED entity lock (peer-lock visibility while editing) + the header
  // Unsaved→Saving…→Saved cycle (beginHold/markSaving/markSaved) + onBlocked/onLost. Persistence does
  // NOT go through its `saveNow` — see `persistEntity` below (baseline-independent one-shot).
  useHeldResourceSession({
    target: lockTarget,
    getNode,
    ownedKeys: undefined, // entity = per-entity grain → baseline/dirty on the WHOLE node
    buildPayload,
    onBlocked: handleLockBlocked,
    onLost: handleLockLost,
  });

  // Single persistence choke point for the edit actions (text / edit-crop / select-crop). COLLAB →
  // `flushSketchEntityUnderLock` (whole node, BASELINE-INDEPENDENT: saves the FRESH node directly, so
  // a single-gesture pick whose held-session baseline is captured too late is never dropped — H2).
  // `releaseIfAcquired:true` → one-shot when the entity isn't already held (no lingering lock — H1);
  // kept when the held-session owns it. SOLO → legacy autoSaveSnapshot. Fire-and-forget. Generate
  // persists inside its own job slice (flush-before / persist-after), so it is NOT routed here.
  const persistEntity = useCallback(
    (kind: BaseKind, entityKey: string) => {
      if (useResourceLockStore.getState().collabPersist) {
        const node =
          useSnapshotStore.getState().sketch[kind].find((e) => e.key === entityKey) ?? null;
        void flushSketchEntityUnderLock(kind, entityKey, node, { releaseIfAcquired: true });
      } else {
        void autoSaveSnapshot();
      }
    },
    [autoSaveSnapshot],
  );

  // Peer-lock (advisory) for the DISPLAYED entity — veil the content + suppress acquire-on-interact.
  const displayedLockTarget = useMemo<LockTarget>(
    () =>
      selected
        ? resolveSketchVariantLockTarget(selected.kind, selected.entityKey)
        : { step: 1, resource_type: 3, resource_id: '', locale: null },
    [selected],
  );
  const displayedLockedByOther = useIsLockedByOther(displayedLockTarget);
  const displayedHolder = useLockHolderName(displayedLockTarget);

  // ── Handlers ────────────────────────────────────────────────────────────────────────────────
  // Browse (display only): switch the shown variant. Leaving a HELD entity commits it (null the
  // held target → the hook release-saves the OLD node). Same-entity re-select keeps the lock.
  const handleSelect = useCallback((ref: VariantRef) => {
    setSelectedVariant(ref);
    setActiveTab('raw');
    // Browsing to a DIFFERENT entity commits the held one (null → hook release-saves the OLD node);
    // a same-entity re-select (another variant of it) keeps the lock. `prev` stays null on mount.
    setActiveLockEntity((prev) => (sameEntity(prev, ref) ? prev : null));
  }, []);

  const handleToggleGroup = useCallback((kind: BaseKind) => {
    setExpandedGroups((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  // Interact (edit text): acquire this entity's held lock + open the modal.
  const handleEditVariant = useCallback((ref: VariantRef) => {
    log.info('handleEditVariant', 'interact — acquire entity lock + open text modal', {
      kind: ref.kind,
      entityKey: ref.entityKey,
    });
    setSelectedVariant(ref);
    setActiveLockEntity({ kind: ref.kind, entityKey: ref.entityKey });
    setEditingVariant(ref);
  }, []);

  // ✨ Generate: acquire the entity lock (adopt → held session releases on switch/unmount), then run.
  const doGenerate = useCallback(
    (ref: VariantRef) => {
      log.info('doGenerate', 'interact — acquire entity lock + start variant sheet generate', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
      });
      setActiveLockEntity({ kind: ref.kind, entityKey: ref.entityKey });
      startVariantSheetGenerate(ref);
    },
    [startVariantSheetGenerate],
  );

  // ✨ entry: variant already has crops → confirm EVERY time (guards pick/edit); empty → straight.
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
      doGenerate(ref);
    },
    [charEntities, propEntities, doGenerate],
  );

  const confirmRegenerate = useCallback(() => {
    if (pendingRegenerate) {
      log.info('confirmRegenerate', 'regenerate confirmed', {
        kind: pendingRegenerate.kind,
        entityKey: pendingRegenerate.entityKey,
        variantKey: pendingRegenerate.variantKey,
      });
      doGenerate(pendingRegenerate);
    }
    setPendingRegenerate(null);
  }, [pendingRegenerate, doGenerate]);

  // Interact (lock 1/4 crop): acquire the entity lock (sustained peer-lock), mutate the mutex, then
  // persist the FRESH node directly (baseline-independent → the very first pick after opening the book
  // is never lost even though the held-session acquire hasn't resolved yet — H2). Fire-and-forget.
  const handleSelectCrop = useCallback(
    (cropIndex: number) => {
      if (!selected) return;
      log.debug('handleSelectCrop', 'interact — lock crop + persist', { cropIndex });
      setActiveLockEntity({ kind: selected.kind, entityKey: selected.entityKey });
      selectSketchVariantCrop(selected.kind, selected.entityKey, selected.variantKey, cropIndex);
      persistEntity(selected.kind, selected.entityKey);
    },
    [selected, selectSketchVariantCrop, persistEntity],
  );

  // Interact (edit crop image): acquire the entity lock + open the edit-image modal.
  const handleEditCrop = useCallback(
    (cropIndex: number) => {
      if (!selected) return;
      log.info('handleEditCrop', 'interact — acquire entity lock + open image modal', {
        kind: selected.kind,
        entityKey: selected.entityKey,
        cropIndex,
      });
      setActiveLockEntity({ kind: selected.kind, entityKey: selected.entityKey });
      setEditImageTarget({
        kind: selected.kind,
        entityKey: selected.entityKey,
        variantKey: selected.variantKey,
        cropIndex,
      });
    },
    [selected],
  );

  // Content-area intent to edit → acquire the displayed entity's SUSTAINED lock (peer-lock visibility +
  // header Unsaved) unless a peer holds it. Persistence itself is baseline-independent (`persistEntity`),
  // so this is for peer visibility, not save-correctness. Guarded → setState no-op once we hold it.
  const handleContentInteract = useCallback(() => {
    if (selected && !displayedLockedByOther && !sameEntity(activeLockEntity, selected)) {
      setActiveLockEntity({ kind: selected.kind, entityKey: selected.entityKey });
    }
  }, [selected, displayedLockedByOther, activeLockEntity]);

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

      <div
        className="relative flex flex-1 min-w-[480px] overflow-hidden"
        onPointerDownCapture={handleContentInteract}
      >
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
        {/* Peer-lock veil: another editor holds the displayed entity. `interactive` → the veil
            CAPTURES pointer events so nothing beneath can be clicked while someone else is editing. */}
        {selected && displayedLockedByOther && (
          <LockedByOtherOverlay holderName={displayedHolder} interactive />
        )}
      </div>

      {/* Overlays (mount by state). Both persist the WHOLE entity node via the held session (onSaved). */}
      {editingVariant && (
        <EditVariantModal
          kind={editingVariant.kind}
          entityKey={editingVariant.entityKey}
          variantKey={editingVariant.variantKey}
          onSaved={() => persistEntity(editingVariant.kind, editingVariant.entityKey)}
          onClose={() => setEditingVariant(null)}
        />
      )}
      {editImageTarget && (
        <VariantEditImageModal
          target={editImageTarget}
          onSaved={() => persistEntity(editImageTarget.kind, editImageTarget.entityKey)}
          onClose={() => setEditImageTarget(null)}
        />
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
