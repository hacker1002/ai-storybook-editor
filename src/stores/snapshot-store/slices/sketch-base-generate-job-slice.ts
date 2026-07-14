// sketch-base-generate-job-slice.ts — orchestrates ONE base-sheet style attempt: a 2-API chain
// generate the RAW sheet (05|06, AI — all base entities of a kind as cells) → crop each entity out
// of it (07, CV). The unit is a STYLE (kind, styleIndex), not N entities. SINGLE-FLIGHT: at most one
// op runs at a time (cross-job guard useIsAnySketchGenerating gates all 3 sketch Generate buttons).
//
// Differs from #12 (entity sheets) / #13 (spreads): per-style 2-phase status (generating → cropping)
// on ONE op, and crop reads NO DB — `imageUrl` is passed straight from the generate result (or the
// effective raw for a re-crop), so there is NO awaited flush; only a fire-and-forget
// autoSaveSnapshot() at the end for durability (base collab-lock not designed yet → collabPersist=false).
//
// Async rule (mirrors #13): runGenerate/runCrop are PLAIN async functions (NOT immer producers).
// Every mutation between awaits goes through a synchronous set((state)=>…) producer. After EVERY
// await we re-check opStale(kind, i) and bail without writing if the op was reset/cancelled/replaced.

import type { StateCreator } from 'zustand';
import type { SnapshotStore, SketchBaseGenerateJobSlice, BaseGeneratePhase } from '../types';
import type { BaseKind, SketchEntity } from '@/types/sketch';
import { sheetOf } from '@/types/sketch';
import type { Illustration, ImageReference } from '@/types/prop-types';
import type { ReferenceImage } from '@/types/remix';
import {
  callGenerateBaseSheet,
  callCropBaseSheet,
  type BaseSheetEntity,
  type BaseReferenceImage,
} from '@/apis/sketch-base-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import { uploadImageToStorage } from '@/apis/storage-api';
import { base64ToFile } from '@/utils/file-utils';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchBaseGenerateJobSlice');

/** Endpoint caps the sheet at 12 cells (1K legibility, [API 05 §Grid]) — content-area blocks first;
 *  this is the defensive net at the slice boundary. */
const MAX_BASE_ENTITIES = 12;

// Backend error codes → user-facing English (mirrors SKETCH_SPREAD_ERROR_MESSAGES in #13).
const SKETCH_BASE_ERROR_MESSAGES: Record<string, string> = {
  ART_STYLE_NOT_FOUND: 'Selected art style not found — please pick one again in settings.',
  ART_STYLE_NO_REFERENCES: 'This art style has no reference images — add some in Style settings.',
  VALIDATION_ERROR: 'Invalid base sheet request — check the entity setup.',
  LLM_ERROR: 'The image model failed to generate this sheet — please try again.',
  NO_IMAGE_IN_RESPONSE: 'The image model returned no image — please try again.',
  ALL_CROPS_FAILED: 'Could not crop any entity from the sheet — please regenerate.',
  SKIPPED_DELETED: 'Skipped — the style was removed.',
  TOO_MANY_ENTITIES: 'Too many base entities — keep it to 12 or fewer per sheet.',
};

/** Maps an ImageApiFailure (or a non-success result) to a friendly message. */
function classifyError(result: { error?: string }): string {
  const code = (result as ImageApiFailure).errorCode;
  return (code && SKETCH_BASE_ERROR_MESSAGES[code]) || result.error || 'Base sheet generation failed';
}

/** Base entities of a kind = those carrying a 'base' variant (mirrors useSketchBaseEntityKeys). */
function baseEntitiesOf(entities: SketchEntity[]): SketchEntity[] {
  return entities.filter((e) => e.variants.some((v) => v.key === 'base'));
}

/** Project one entity's 'base' variant text to the sheet-prompt row (§6 payload map). */
function baseVariantText(entity: SketchEntity): BaseSheetEntity {
  const base = entity.variants.find((v) => v.key === 'base');
  return {
    key: entity.key,
    description: base?.description ?? '',
    height: base?.height ?? '',
    visualDescription: base?.visual_design ?? '',
    artLanguage: base?.art_language ?? '',
  };
}

/** Effective raw url: selected version → newest → null. */
function effectiveIllustration(illustrations: Illustration[]): string | null {
  return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? null;
}

/** Storage prefix for user-picked base-sheet style reference images. */
const BASE_REF_PREFIX = 'sketch-base-refs';

/**
 * Upload picker reference images (base64) to storage so they persist on the style
 * (`image_references: {title, media_url}` — never base64 in JSONB). Returns BOTH the persisted
 * refs and the generate-payload refs: an uploaded image travels to the backend as a `media_url`
 * (fetched + SSRF-guarded); an image whose upload FAILS still falls back to base64 for the
 * generate call (generation fidelity preserved) but is not persisted. Per-image try/catch so one
 * bad upload never sinks the whole generate.
 */
async function uploadBaseSheetReferences(
  refs: ReferenceImage[],
): Promise<{ persisted: ImageReference[]; apiRefs: BaseReferenceImage[] }> {
  const persisted: ImageReference[] = [];
  const apiRefs: BaseReferenceImage[] = [];
  for (const ref of refs) {
    try {
      const file = base64ToFile(ref.base64Data, ref.mimeType, ref.label || 'reference');
      const { publicUrl } = await uploadImageToStorage(file, BASE_REF_PREFIX);
      persisted.push({ title: ref.label, media_url: publicUrl });
      apiRefs.push({ media_url: publicUrl });
    } catch (err) {
      log.warn('uploadBaseSheetReferences', 'upload failed — base64 fallback for generate, not persisted', {
        label: ref.label,
        error: err instanceof Error ? err.message : String(err),
      });
      apiRefs.push({ base64Data: ref.base64Data, mimeType: ref.mimeType });
    }
  }
  return { persisted, apiRefs };
}

export const createSketchBaseGenerateJobSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SketchBaseGenerateJobSlice
> = (set, get) => {
  /** Op no longer owns (kind, i) — reset / removeStyle / new op raced in between an await → bail. */
  function opStale(kind: BaseKind, styleIndex: number): boolean {
    const op = get().baseSheetGenerateOp;
    return !op || op.kind !== kind || op.styleIndex !== styleIndex;
  }

  // ── internal producers (immer) — called at await boundaries ──────────────────────────────────
  function setOpPhase(phase: BaseGeneratePhase): void {
    set((state) => {
      if (state.baseSheetGenerateOp) state.baseSheetGenerateOp.phase = phase;
    });
  }
  /** Store the (already classified, friendly) message on the op; the op is KEPT until dismiss. */
  function markOpError(message: string): void {
    set((state) => {
      if (state.baseSheetGenerateOp) state.baseSheetGenerateOp.error = message;
    });
  }
  /** Clear the op when it settled without error; on error keep it (content-area shows it inline). */
  function finalizeOp(): void {
    set((state) => {
      const op = state.baseSheetGenerateOp;
      if (op && !op.error) state.baseSheetGenerateOp = null;
    });
  }

  // ── crop (phase 2) — throws on failure so the caller's catch records the error. NO DB read. ────
  async function runCrop(
    kind: BaseKind,
    styleIndex: number,
    imageUrl: string,
    cropEntities: Array<{ key: string }>,
  ): Promise<void> {
    const result = await callCropBaseSheet({ imageUrl, entities: cropEntities, kind });
    if (opStale(kind, styleIndex)) return; // reset/cancel/removeStyle during crop → drop
    if (!result.success || !result.data) throw new Error(classifyError(result));

    const now = new Date().toISOString();
    get().setSketchBaseStyleCrops(
      kind,
      styleIndex,
      result.data.crops.map((c) => ({
        key: c.key,
        illustrations: [
          { type: 'created' as const, media_url: c.imageUrl, created_time: now, is_selected: true },
        ],
      })),
    );

    const skipped = result.data.skipped;
    if (skipped && skipped.length > 0) {
      log.warn('runCrop', 'partial crop — some entities skipped', {
        kind,
        styleIndex,
        skipped: skipped.length,
      });
      toast.warning(`${skipped.length} crop(s) failed`);
    }
  }

  // ── generate (phase 1) → crop (phase 2) chain. Plain async, fire-and-forget from start. ────────
  // `isAdd` = this op appended a fresh (empty) style up-front; if generate fails BEFORE any raw
  // lands, that style is an unreachable orphan (no delete/regenerate UI) → roll it back in catch.
  async function runGenerate(
    kind: BaseKind,
    styleIndex: number,
    params: { stylePrompt: string; referenceImages: ReferenceImage[]; artStyleId: string },
    isAdd: boolean,
  ): Promise<void> {
    // entities read AT SLICE (base variant text) — same reading-order for generate + crop.
    const entities = baseEntitiesOf(get().sketch[kind]).map(baseVariantText);
    // Closure flag: once the raw sheet is written the style is real (partial success) → never roll back.
    let rawLanded = false;

    try {
      // Upload user refs → storage (persist {title, media_url} on the style) + build the generate
      // payload refs (uploaded → media_url, failed → base64 fallback). Runs under the live op so a
      // cancel/reset mid-upload bails via opStale before we write.
      const { persisted, apiRefs } = await uploadBaseSheetReferences(params.referenceImages);
      if (opStale(kind, styleIndex)) return;
      if (persisted.length > 0) {
        log.info('runGenerate', 'persist style reference images', { kind, styleIndex, count: persisted.length });
        get().setSketchBaseStyleImageReferences(kind, styleIndex, persisted);
      }

      const result = await callGenerateBaseSheet(kind, {
        entities,
        artStyleId: params.artStyleId,
        stylePrompt: params.stylePrompt,
        referenceImages: apiRefs,
      });
      if (opStale(kind, styleIndex)) return;
      if (!result.success || !result.data) throw new Error(classifyError(result));

      log.info('runGenerate', 'raw sheet done', { kind, styleIndex });
      get().addSketchBaseStyleIllustration(kind, styleIndex, result.data.imageUrl);
      rawLanded = true;

      // Best-effort cancel: stop before the crop phase (raw already saved). Not stale → op is ours.
      if (get().baseSheetGenerateOp?.cancelRequested) {
        log.info('runGenerate', 'cancelled before crop — raw kept, crop skipped', { kind, styleIndex });
      } else {
        setOpPhase('cropping');
        await runCrop(kind, styleIndex, result.data.imageUrl, entities.map((e) => ({ key: e.key })));
      }
    } catch (err) {
      if (opStale(kind, styleIndex)) return;
      const msg = err instanceof Error ? err.message : 'Base sheet generation failed';
      log.error('runGenerate', 'failed', { kind, styleIndex, error: msg });
      markOpError(msg); // keep the op so the notifications hook toasts once
      // Roll back the orphaned empty style: only an 'add' that failed before any raw landed. The op
      // is unchanged (still owns styleIndex) so opStale stays false → finalizeOp still keeps the error.
      if (isAdd && !rawLanded) {
        log.info('runGenerate', 'rollback orphaned add-style (no raw landed)', { kind, styleIndex });
        get().removeSketchBaseStyle(kind, styleIndex);
      }
    }

    if (opStale(kind, styleIndex)) return; // op reset during the last await → nothing to finalize
    void get().autoSaveSnapshot(); // fire-and-forget durability (crop reads no DB → no awaited flush)
    finalizeOp();
  }

  // ── crop-only re-run (call-site #2, after editing the Raw sheet). ──────────────────────────────
  async function runRecrop(
    kind: BaseKind,
    styleIndex: number,
    rawUrl: string,
    cropEntities: Array<{ key: string }>,
  ): Promise<void> {
    try {
      await runCrop(kind, styleIndex, rawUrl, cropEntities);
    } catch (err) {
      if (opStale(kind, styleIndex)) return;
      const msg = err instanceof Error ? err.message : 'Base sheet crop failed';
      log.error('runRecrop', 'failed', { kind, styleIndex, error: msg });
      markOpError(msg);
    }

    if (opStale(kind, styleIndex)) return;
    void get().autoSaveSnapshot();
    finalizeOp();
  }

  return {
    baseSheetGenerateOp: null,

    startBaseSheetGenerate: ({ kind, mode, styleIndex, stylePrompt, referenceImages, artStyleId }) => {
      if (get().baseSheetGenerateOp != null) {
        log.warn('startBaseSheetGenerate', 'blocked — an op is already running', { kind });
        return; // single-flight
      }

      const baseEntities = baseEntitiesOf(get().sketch[kind]);
      if (baseEntities.length === 0) {
        log.warn('startBaseSheetGenerate', 'no base entities — nothing to generate', { kind });
        toast.warning('Import base entities first');
        return;
      }
      // Defensive net (content-area blocks first): no op exists yet → toast, don't markOpError.
      if (baseEntities.length > MAX_BASE_ENTITIES) {
        log.warn('startBaseSheetGenerate', 'too many base entities', { kind, count: baseEntities.length });
        toast.error(SKETCH_BASE_ERROR_MESSAGES.TOO_MANY_ENTITIES);
        return;
      }

      // Resolve the target style index. 'add' appends a fresh style; 'regenerate' reuses styleIndex.
      let i = styleIndex ?? -1;
      if (mode === 'add') {
        get().addSketchBaseStyle(kind, {
          style_prompt: stylePrompt,
          is_selected: false,
          image_references: [],
          illustrations: [],
          crops: [],
        });
        i = sheetOf(get().sketch.base, kind).styles.length - 1;
      }
      if (i < 0 || i >= sheetOf(get().sketch.base, kind).styles.length) {
        log.warn('startBaseSheetGenerate', 'invalid styleIndex', { kind, mode, styleIndex });
        return;
      }

      log.info('startBaseSheetGenerate', 'start', {
        kind,
        mode,
        styleIndex: i,
        entityCount: baseEntities.length,
      });
      set((state) => {
        state.baseSheetGenerateOp = {
          kind,
          styleIndex: i,
          phase: 'generating',
          startedAt: new Date().toISOString(),
          isRecrop: false,
        };
      });

      void runGenerate(kind, i, { stylePrompt, referenceImages, artStyleId }, mode === 'add');
    },

    recropBaseSheet: (kind, styleIndex) => {
      if (get().baseSheetGenerateOp != null) {
        log.warn('recropBaseSheet', 'blocked — an op is already running', { kind });
        return; // single-flight
      }

      const style = sheetOf(get().sketch.base, kind).styles[styleIndex];
      if (!style || style.illustrations.length === 0) {
        log.warn('recropBaseSheet', 'no raw sheet to crop', { kind, styleIndex });
        return; // need a raw sheet to crop from
      }
      const rawUrl = effectiveIllustration(style.illustrations);
      if (!rawUrl) {
        log.warn('recropBaseSheet', 'raw sheet has no effective url', { kind, styleIndex });
        return;
      }

      const cropEntities = baseEntitiesOf(get().sketch[kind]).map((e) => ({ key: e.key }));
      log.info('recropBaseSheet', 'start', { kind, styleIndex, entityCount: cropEntities.length });
      set((state) => {
        state.baseSheetGenerateOp = {
          kind,
          styleIndex,
          phase: 'cropping',
          startedAt: new Date().toISOString(),
          isRecrop: true,
        };
      });

      void runRecrop(kind, styleIndex, rawUrl, cropEntities);
    },

    cancelBaseSheetGenerate: () =>
      set((state) => {
        const op = state.baseSheetGenerateOp;
        if (op && !op.error) {
          log.info('cancelBaseSheetGenerate', 'cancel requested', {
            kind: op.kind,
            styleIndex: op.styleIndex,
          });
          op.cancelRequested = true; // best-effort — stops before the crop phase
        }
      }),

    dismissBaseSheetGenerateError: () =>
      set((state) => {
        const op = state.baseSheetGenerateOp;
        if (op && op.error) {
          log.debug('dismissBaseSheetGenerateError', 'clear settled-with-error op', {
            kind: op.kind,
            styleIndex: op.styleIndex,
          });
          state.baseSheetGenerateOp = null; // op was only kept to surface the error → clear it
        }
      }),
  };
};
