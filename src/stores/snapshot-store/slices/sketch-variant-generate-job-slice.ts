// sketch-variant-generate-job-slice.ts — orchestrates ONE non-base variant sheet: a 2-phase chain
// generate the RAW 4-cell 21:9 sheet (08|09, AI — 4 independent draws of the SAME variant) → AUTO-CUT
// the 4 cells out of it (10, CV). The unit is a VARIANT (kind, entityKey, variantKey), not N entities.
// SINGLE-FLIGHT: at most one op runs at a time. Auto-cut ALWAYS runs after a raw sheet lands (no
// Re-cut button, no confirm). NO auto-select after cut — the user locks 1/4 later via
// selectSketchVariantCrop (phase-01).
//
// ⚡⚡ SNAPSHOT-READING (the #1 correctness point — differs from base #14): generate 08/09 reads
// `snapshot.sketch` from the DB by snapshotId, so we MUST land the variant's edited text in the DB
// BEFORE calling generate.
//   • SOLO (collabPersist=false): AWAITED `flushSnapshot()` (legacy path), then read meta.id.
//   • COLLAB (collabPersist=true, ADR-047): autoSaveSnapshot/flushSnapshot are SUPPRESSED, so we
//     persist the WHOLE sketch entity node through the gateway via `flushSketchEntityUnderLock`
//     (acquires-if-needed, saves, KEEPS the lock held for the component held-session) BEFORE the AI
//     reads the DB — else it draws from STALE text / missing base crops (risk #1). A failed flush
//     (peer lock / reject) ABORTS generate so we never burn AI tokens on a stale / peer-owned node.
// This mirrors sketch-spread-generate-job-slice.ts (also snapshot-reading). Base does NOT need this
// (base ships entity text inside the generate payload).
//
// Async rule (mirrors #13/#14): runGenerate/runCut are PLAIN async functions (NOT immer producers).
// Every mutation between awaits goes through a synchronous set((state)=>…) producer. After EVERY await
// we re-check opStale(ref) and bail WITHOUT writing if the op was reset/replaced.

import type { StateCreator } from 'zustand';
import type {
  SnapshotStore,
  SketchVariantGenerateJobSlice,
  VariantGeneratePhase,
} from '../types';
import type { VariantRef, SketchVariant } from '@/types/sketch';
import type { Illustration } from '@/types/prop-types';
import {
  callGenerateVariantSheet,
  callCropSheetRow,
} from '@/apis/sketch-variant-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
// resource-lock-store is a leaf store loaded before the slices in snapshot-store/index, so this
// static import resolves cleanly in the app (no cycle back to snapshot-store). The isolated slice
// unit tests import this module directly (bypassing index) and mock it.
import { useResourceLockStore } from '@/stores/resource-lock-store';
// Sibling slice-helper (same dir) — whole sketch-entity gateway flush that KEEPS the lock held so
// the component held-session stays the sole releaser (ADR-047). Reads no store (caller passes node).
import { flushSketchEntityUnderLock } from './collab-sketch-variant-save-helper';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchVariantGenerateJobSlice');

/** Variant sheet is a fixed 4-cell / 1-row / 21:9 grid (08/09 §Grid) → cut exactly 4 cells. */
const VARIANT_CELL_COUNT = 4;

/** Shown when the book was never saved (no snapshot row yet) — generate would read nothing. Kept on
 *  the op (so it surfaces inline / via the notifications hook) AND toasted immediately. Exported so
 *  the notifications hook can skip re-toasting THIS message (the slice already toasts it directly). */
export const NO_SNAPSHOT_MESSAGE = 'Save the book first, then generate.';

// Backend error codes (api/sketch/08,09 §Error + 10 §Error) → user-facing English. Mirrors
// SKETCH_BASE_ERROR_MESSAGES in #14. Unmapped codes fall back to the raw backend message.
const SKETCH_VARIANT_ERROR_MESSAGES: Record<string, string> = {
  // generate (08/09)
  VALIDATION_ERROR: 'Invalid variant sheet request — check the variant setup.',
  SSRF_BLOCKED: 'A reference image URL was blocked — please try again.',
  SNAPSHOT_NOT_FOUND: 'Could not find the saved book — save it again, then generate.',
  ENTITY_NOT_FOUND: 'This entity is missing from the saved book — save it, then generate.',
  VARIANT_NOT_FOUND: 'This variant is missing from the saved book — save it, then generate.',
  ART_STYLE_NOT_FOUND: 'Selected sketch style not found — please pick one again in settings.',
  CANNOT_GENERATE_BASE_VARIANT: 'The base variant is generated in the Base workspace, not here.',
  BASE_NOT_READY: 'Generate and lock this entity’s base first — the variant needs it as an anchor.',
  EMPTY_VARIANT_DESCRIPTION: 'This variant has no visual description yet — add one before generating.',
  ART_STYLE_NO_REFERENCES: 'This sketch style has no reference images — add some in Style settings.',
  IMAGE_FETCH_ERROR: 'A reference image could not be loaded — please try again.',
  PROMPT_TEMPLATE_NOT_FOUND: 'The image prompt is misconfigured — please contact support.',
  LLM_ERROR: 'The image model failed to generate this sheet — please try again.',
  NO_IMAGE_IN_RESPONSE: 'The image model returned no image — please try again.',
  STORAGE_UPLOAD_ERROR: 'Could not save the generated image — please try again.',
  // crop (10)
  DECODE_ERROR: 'The generated sheet could not be read for cutting — please regenerate.',
  ALL_CROPS_FAILED: 'Could not cut any cell from the sheet — please regenerate.',
  // shared
  INTERNAL: 'Something went wrong — please try again.',
};

/** Maps an ImageApiFailure (or a non-success result) to a friendly message. */
function classifyError(result: { error?: string }): string {
  const code = (result as ImageApiFailure).errorCode;
  return (code && SKETCH_VARIANT_ERROR_MESSAGES[code]) || result.error || 'Variant sheet generation failed';
}

export const createSketchVariantGenerateJobSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SketchVariantGenerateJobSlice
> = (set, get) => {
  /** Op no longer owns this ref — reset / new op raced in between an await → bail. */
  function opStale(ref: VariantRef): boolean {
    const op = get().variantSheetGenerateOp;
    return (
      !op ||
      op.kind !== ref.kind ||
      op.entityKey !== ref.entityKey ||
      op.variantKey !== ref.variantKey
    );
  }

  /** Resolve the live variant node (or undefined) for reading its current raw_sheet versions. */
  function variantOf(ref: VariantRef): SketchVariant | undefined {
    return get()
      .sketch[ref.kind].find((e) => e.key === ref.entityKey)
      ?.variants.find((v) => v.key === ref.variantKey);
  }

  /** Resolve the live WHOLE entity node (the gateway save grain — step 1, whole-node). Read FRESH
   *  at call time (anti stale-closure) so the flush persists the latest text/crops. */
  function entityNodeOf(ref: VariantRef): unknown | null {
    return get().sketch[ref.kind].find((e) => e.key === ref.entityKey) ?? null;
  }

  /** Effective raw sheet url: selected version → newest → null (mirrors the base slice). */
  function effectiveRawUrl(ref: VariantRef): string | null {
    const illustrations = variantOf(ref)?.raw_sheet?.illustrations ?? [];
    return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? null;
  }

  /** Persist the RESULT of a generate/recrop chain (raw sheet + crops already landed in the store).
   *  ⚡ PERSIST-AFTER is the deliberate EXCEPTION to this space's batch-at-release model (ADR-043 Rev
   *  2026-07-16): cheap gestures (text / pick / crop edit) wait for the release-save, but AI output
   *  must never be lost to a crash / leaving the space mid-chain. Fire-and-forget.
   *  COLLAB → gateway whole-entity flush; `releaseIfAcquired:true` (one-shot) because the user MAY
   *  have browsed to another entity during the long AI call → the held-session already released THIS
   *  entity and re-acquiring + keeping would orphan the lock (H1). Still held (didn't browse) → the
   *  lock is KEPT for the held-session (the sole releaser). SOLO (incl. the space unmounted →
   *  collabPersist flipped false) → the legacy owner-direct autoSaveSnapshot. */
  function persistVariantEntity(ref: VariantRef): void {
    if (useResourceLockStore.getState().collabPersist) {
      void flushSketchEntityUnderLock(ref.kind, ref.entityKey, entityNodeOf(ref), {
        releaseIfAcquired: true,
      });
    } else {
      void get().autoSaveSnapshot();
    }
  }

  // ── internal producers (immer) — called at await boundaries ──────────────────────────────────
  function setOpPhase(phase: VariantGeneratePhase): void {
    set((state) => {
      if (state.variantSheetGenerateOp) state.variantSheetGenerateOp.phase = phase;
    });
  }
  /** Store the (already classified, friendly) message on the op; the op is KEPT until dismiss. */
  function markOpError(message: string): void {
    set((state) => {
      if (state.variantSheetGenerateOp) state.variantSheetGenerateOp.error = message;
    });
  }
  /** Clear the op when it settled without error; on error keep it (content-area shows it inline). */
  function finalizeOp(): void {
    set((state) => {
      const op = state.variantSheetGenerateOp;
      if (op && !op.error) state.variantSheetGenerateOp = null;
    });
  }

  // ── auto-cut (phase 2) — throws on failure so the caller's catch records the error. Reads NO DB. ─
  async function runCut(ref: VariantRef, rawImageUrl: string): Promise<void> {
    // kind = 'characters' | 'props' — the crop endpoint groups uploads under this prefix.
    const pathPrefix = `sketches/variants/${ref.kind}/${ref.entityKey}/${ref.variantKey}`;
    const result = await callCropSheetRow({
      imageUrl: rawImageUrl,
      cellCount: VARIANT_CELL_COUNT,
      pathPrefix,
    });
    if (opStale(ref)) return; // reset/replaced during the crop call → drop
    if (!result.success || !result.data) throw new Error(classifyError(result));

    const now = new Date().toISOString();
    // Map crops → positional cells. Each cell holds ONE canonical 'created' illustration (is_selected),
    // but the CELL itself is NOT auto-locked (is_selected=false) — the user picks 1/4 later.
    get().setSketchVariantCrops(
      ref.kind,
      ref.entityKey,
      ref.variantKey,
      result.data.crops.map((c) => ({
        is_selected: false,
        illustrations: [
          { type: 'created' as const, media_url: c.imageUrl, created_time: now, is_selected: true },
        ],
      })),
    );

    // Non-fatal geometry warnings — the sheet still cut, cells may just be slightly off.
    const meta = result.meta;
    if ((meta?.geoFallbackCount ?? 0) > 0 || meta?.fullbleedWarning) {
      log.warn('runCut', 'geometry warning — some cells may be misaligned', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
        geoFallbackCount: meta?.geoFallbackCount,
        fullbleedWarning: meta?.fullbleedWarning,
      });
      toast.warning('Some cells may be misaligned');
    }
  }

  // ── generate (phase 1) → auto-cut (phase 2) chain. Plain async, fire-and-forget from start. ─────
  async function runGenerate(ref: VariantRef): Promise<void> {
    try {
      // ⚡⚡ FLUSH-BEFORE-GENERATE (mirror sketch-spread-generate-job-slice.ts — generate is
      // SNAPSHOT-READING). autoSaveSnapshot self-guards to a no-op when another save holds isSaving
      // AND is suppressed under collab → the endpoint would read STALE DB text. Land the entity node
      // in the DB first: SOLO → awaited flushSnapshot(); COLLAB → gateway whole-node flush (keeps lock).
      const collab = useResourceLockStore.getState().collabPersist;
      if (collab) {
        const flushed = await flushSketchEntityUnderLock(ref.kind, ref.entityKey, entityNodeOf(ref));
        if (opStale(ref)) return; // op reset during the flush
        if (!flushed) {
          log.warn('runGenerate', 'flush-before-generate failed — abort (stale DB / peer lock)', {
            kind: ref.kind,
            entityKey: ref.entityKey,
            variantKey: ref.variantKey,
          });
          // Do NOT call the AI on a stale / peer-owned node (would burn tokens + write the wrong text).
          markOpError('Could not save before generating — the entity may be locked by another editor.');
          return;
        }
      } else {
        await get().flushSnapshot(); // legacy solo: land edits + mint the snapshot row
        if (opStale(ref)) return; // op reset during the flush
      }

      const snapshotId = get().meta.id; // ⚡ meta.id (NOT meta.snapshotId); brand-new book: null till first save
      if (!snapshotId) {
        log.warn('runGenerate', 'no snapshot id — cannot generate', { kind: ref.kind, collab });
        markOpError(NO_SNAPSHOT_MESSAGE); // keep the op (error set) so it surfaces; retryable after dismiss
        toast.error(NO_SNAPSHOT_MESSAGE);
        return; // do NOT call the endpoint (it would fail SNAPSHOT_NOT_FOUND)
      }

      // ⚡ Contract (ADR-047): artStyleId DROPPED (backend extra=forbid); modelParams optional (omit →
      // DB default — the variant space has no model UI yet). Style is inferred from the BASE_VARIANT.
      const gen = await callGenerateVariantSheet(ref.kind, {
        snapshotId,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
      });
      if (opStale(ref)) return; // reset/replaced during the generate call → drop
      if (!gen.success || !gen.data) throw new Error(classifyError(gen));

      log.info('runGenerate', 'raw sheet done', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
      });

      // Prepend the raw sheet version (newest selected, clear prior selection) — preserves crops[].
      const now = new Date().toISOString();
      const prev = variantOf(ref)?.raw_sheet?.illustrations ?? [];
      const next: Illustration[] = [
        { type: 'created' as const, media_url: gen.data.imageUrl, created_time: now, is_selected: true },
        ...prev.map((i) => ({ ...i, is_selected: false })),
      ];
      get().setSketchVariantRawSheetIllustrations(ref.kind, ref.entityKey, ref.variantKey, next);

      // Phase 2 — AUTO-CUT (ALWAYS runs; no Re-cut button, no confirm).
      setOpPhase('cut');
      await runCut(ref, gen.data.imageUrl);
    } catch (err) {
      if (opStale(ref)) return;
      const msg = err instanceof Error ? err.message : 'Variant sheet generation failed';
      log.error('runGenerate', 'failed', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
        error: msg,
      });
      markOpError(msg); // keep the op so the notifications hook toasts once
    }

    if (opStale(ref)) return; // op reset during the last await → nothing to finalize
    persistVariantEntity(ref); // persist-after (raw sheet + crops landed in the store)
    finalizeOp(); // clear the op if it settled without error
  }

  // ── cut-only re-run (call-site #2: the user EDITED the raw sheet in the Raw tab → crops stale). ──
  // Mirrors runRecrop in #14. A full failure keeps the PREVIOUS crops[] (runCut only writes on
  // success) → the raw↔crops mismatch is accepted and surfaced by ONE toast from the notifications
  // hook (markOpError); the user re-triggers by editing the raw again / regenerating. No rollback of
  // the raw edit, no auto-retry (KISS — chốt Validation Session 1).
  async function runRecrop(ref: VariantRef, rawImageUrl: string): Promise<void> {
    try {
      await runCut(ref, rawImageUrl);
    } catch (err) {
      if (opStale(ref)) return;
      const msg = err instanceof Error ? err.message : 'Variant sheet cut failed';
      log.error('runRecrop', 'failed', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
        error: msg,
      });
      markOpError(msg); // keep the op so the notifications hook toasts once
    }

    if (opStale(ref)) return; // op reset during the last await → nothing to finalize
    // Persist even on a cut failure: the RAW edit that triggered this re-cut is already in the store
    // and must land (the crops simply stay as they were).
    persistVariantEntity(ref);
    finalizeOp();
  }

  return {
    variantSheetGenerateOp: null,

    startVariantSheetGenerate: (ref: VariantRef) => {
      if (get().variantSheetGenerateOp != null) {
        log.warn('startVariantSheetGenerate', 'blocked — an op is already running', { kind: ref.kind });
        return; // single-flight
      }

      // ⚡ Contract (ADR-047): the art-style gate is GONE — generate no longer requires
      // book.sketchstyle_id (style is inferred from the BASE_VARIANT anchor; backend dropped
      // artStyleId). snapshotId is resolved AFTER the flush (may be null before the first save).
      log.info('startVariantSheetGenerate', 'start', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
      });
      set((state) => {
        state.variantSheetGenerateOp = {
          kind: ref.kind,
          entityKey: ref.entityKey,
          variantKey: ref.variantKey,
          phase: 'generate',
          startedAt: new Date().toISOString(),
        };
      });

      void runGenerate({ kind: ref.kind, entityKey: ref.entityKey, variantKey: ref.variantKey });
    },

    recropVariantSheet: (ref: VariantRef) => {
      if (get().variantSheetGenerateOp != null) {
        // Reachable: the edit-image modal stays OPEN after a raw commit, so a 2nd commit can land
        // while the 1st re-cut is still in flight. Dropping it silently would leave crops[] cut from
        // the PREVIOUS raw with no signal and no reason for the user to re-trigger — toast so the
        // mismatch is visible and actionable (mirrors the recrop-failure policy: non-fatal toast,
        // keep the old crops, user re-triggers).
        log.warn('recropVariantSheet', 'blocked — an op is already running', {
          kind: ref.kind,
          entityKey: ref.entityKey,
          variantKey: ref.variantKey,
        });
        toast.warning('Still processing the previous change — the cells were not re-cut. Try again in a moment.');
        return; // single-flight (shared with generate — one op at a time)
      }

      // Reads the effective raw SYNCHRONOUSLY, so a caller that just wrote a new raw version (the
      // Raw-tab edit commit) re-cuts from THAT version.
      const rawUrl = effectiveRawUrl(ref);
      if (!rawUrl) {
        log.warn('recropVariantSheet', 'no raw sheet to cut — skip', {
          kind: ref.kind,
          entityKey: ref.entityKey,
          variantKey: ref.variantKey,
        });
        return; // nothing generated yet → nothing to cut
      }

      log.info('recropVariantSheet', 'start', {
        kind: ref.kind,
        entityKey: ref.entityKey,
        variantKey: ref.variantKey,
      });
      set((state) => {
        state.variantSheetGenerateOp = {
          kind: ref.kind,
          entityKey: ref.entityKey,
          variantKey: ref.variantKey,
          phase: 'cut', // skips 'generate' — the raw already exists (content-area shows "Cutting cells…")
          startedAt: new Date().toISOString(),
        };
      });

      void runRecrop({ kind: ref.kind, entityKey: ref.entityKey, variantKey: ref.variantKey }, rawUrl);
    },

    dismissVariantSheetGenerateError: () =>
      set((state) => {
        const op = state.variantSheetGenerateOp;
        if (op && op.error) {
          log.debug('dismissVariantSheetGenerateError', 'clear settled-with-error op', {
            kind: op.kind,
            entityKey: op.entityKey,
            variantKey: op.variantKey,
          });
          state.variantSheetGenerateOp = null; // op was only kept to surface the error → clear it
        }
      }),
  };
};
