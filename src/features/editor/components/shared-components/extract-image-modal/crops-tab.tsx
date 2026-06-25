// crops-tab.tsx — Crops tab (design 05-crops-tab.md): frame-based crop extraction with
// book-level reusable presets (books.crop_presets[]). Reuses the Objects box-overlay shell +
// crop-object-image commit, but: NO Detect/AI, NO tag, per-box dropdown = presets (not ratio),
// 3-button sidebar (edit/save/delete), and a destructive book-wide preset delete behind a
// confirm dialog. Presets are CONTROLLED props (source of truth = book.crop_presets, parent
// persists); the hook owns only the session box state + derived dirty marker.

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createLogger } from '@/utils/logger';
import {
  callCropObjectImage,
  type CropObjectImageResult,
  type CropBoundingBox,
} from '@/apis/retouch-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { SpreadImage } from '@/types/spread-types';
import {
  CROP_DEFAULT_BOX_SIZE_PERCENT,
  CROP_MIN_BOX_SIZE_PERCENT,
  CROP_BATCH_SIZE,
  type ExtractResult,
  type CropBox,
  type CropPreset,
} from './extract-image-modal-constants';
import { uploadCroppedToStorage } from './extract-image-modal-utils';
import { chunk, clamp, nearestAllowedRatio } from './extract-box-geometry-utils';
import { ObjectBoxOverlay } from './object-box-overlay';

const log = createLogger('Editor', 'CropsTab');

/** Storage category folder for crop-on-extract crops (Crops tab). */
const CROP_FOLDER = 'extract-crops';
/** Float-noise epsilon (%) for the dirty marker geometry compare (design §4.3). */
const GEOM_EPS = 0.05;

type Geometry = { x: number; y: number; w: number; h: number };

/** Clamp a preset geometry into bounds: size ≥ min, x+w ≤ 100, y+h ≤ 100. */
function clampToBounds(g: Geometry): Geometry {
  const w = clamp(g.w, CROP_MIN_BOX_SIZE_PERCENT, 100);
  const h = clamp(g.h, CROP_MIN_BOX_SIZE_PERCENT, 100);
  return { x: clamp(g.x, 0, 100 - w), y: clamp(g.y, 0, 100 - h), w, h };
}

/** Per-axis approximate equality (anti float-noise) for the dirty marker. */
function geomEqual(a: Geometry, b: Geometry): boolean {
  return (
    Math.abs(a.x - b.x) <= GEOM_EPS &&
    Math.abs(a.y - b.y) <= GEOM_EPS &&
    Math.abs(a.w - b.w) <= GEOM_EPS &&
    Math.abs(a.h - b.h) <= GEOM_EPS
  );
}

export interface CropsTabHandle {
  boxes: CropBox[];
  selectedBoxId: string | null;
  editingBoxId: string | null;
  confirmDeleteBoxId: string | null;
  interactionMode: 'box-overlay';
  commitMode: 'crop-on-extract';
  hasParams: false;
  /** boxes.length > 0 → ⭐ Extract enabled (root AND-gates with !busy && source). */
  canRun: boolean;
  CanvasOverlay: ReactNode;
  /** Source <img> onLoad → captures natural dims for the crop aspectRatio metadata. */
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  addBox: () => void;
  selectBox: (id: string | null) => void;
  setEditingBox: (id: string | null) => void;
  applyPreset: (boxId: string, presetId: string | null) => void;
  renameBox: (boxId: string, title: string) => void;
  saveBox: (boxId: string) => void;
  /** ✕ / Delete hotkey — remove box from the image (KEEPS the book preset). */
  deleteBox: (id: string) => void;
  /** 🗑 sidebar — preset-linked → open confirm; else remove box directly. */
  deleteCropPreset: (boxId: string) => void;
  confirmDeletePreset: () => void;
  cancelDeletePreset: () => void;
  /** Crops every valid box → upload → ExtractResult[]; throws on empty/all-fail (root toasts). */
  commitExtract: (sourceUrl: string) => Promise<ExtractResult[]>;
  /** box.title + ` *` when the box diverges from its linked preset (dirty). */
  displayLabel: (boxId: string) => string;
  /** Whether 💾 Save can persist (onUpsertCropPreset wired). */
  canSave: boolean;
  reset: () => void;
}

interface UseCropsTabOptions {
  /** processing || committing — disables overlay controls. */
  isBusy: boolean;
  /** book.crop_presets — dropdown source + Save target (controlled). */
  cropPresets: CropPreset[];
  onUpsertCropPreset?: (preset: CropPreset) => void;
  onDeleteCropPreset?: (presetId: string) => void;
}

export function useCropsTabState(
  image: SpreadImage,
  { isBusy, cropPresets, onUpsertCropPreset, onDeleteCropPreset }: UseCropsTabOptions,
): CropsTabHandle {
  const [boxes, setBoxes] = useState<CropBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [confirmDeleteBoxId, setConfirmDeleteBoxId] = useState<string | null>(null);
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null);

  const canRun = boxes.length > 0;
  const canSave = !!onUpsertCropPreset;

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // ── Derived dirty marker (NOT stored — recompute from box geometry vs preset) ──
  const isDirty = useCallback(
    (box: CropBox): boolean => {
      if (!box.presetId) return false;
      const preset = cropPresets.find((p) => p.id === box.presetId);
      if (!preset) return false; // stale (deleted elsewhere) → no target to compare
      return !geomEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, preset.geometry);
    },
    [cropPresets],
  );

  const displayLabel = useCallback(
    (boxId: string): string => {
      const box = boxes.find((b) => b.id === boxId);
      if (!box) return '';
      return isDirty(box) ? `${box.title} *` : box.title;
    },
    [boxes, isDirty],
  );

  // ── Box management (local, no API) ─────────────────────────────────────────
  const addBox = useCallback(() => {
    const id = crypto.randomUUID();
    setBoxes((prev) => {
      const n = prev.filter((b) => b.presetId === null).length + 1;
      const size = CROP_DEFAULT_BOX_SIZE_PERCENT;
      const box: CropBox = {
        id,
        x: clamp(50 - size / 2, 0, 100 - size),
        y: clamp(50 - size / 2, 0, 100 - size),
        w: size,
        h: size,
        title: `Custom ${n}`,
        presetId: null,
      };
      return [...prev, box];
    });
    setSelectedBoxId(id);
    log.debug('addBox', 'added crop box', { id });
  }, []);

  const selectBox = useCallback((id: string | null) => setSelectedBoxId(id), []);
  const setEditingBox = useCallback((id: string | null) => setEditingBoxId(id), []);

  const updateBox = useCallback(
    (id: string, patch: Partial<Pick<CropBox, 'x' | 'y' | 'w' | 'h'>>) => {
      setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [],
  );

  const applyPreset = useCallback(
    (boxId: string, presetId: string | null) => {
      if (presetId === null) {
        // Custom: drop the link, keep geometry, free resize.
        setBoxes((prev) => prev.map((b) => (b.id === boxId ? { ...b, presetId: null } : b)));
        log.debug('applyPreset', 'set custom', { boxId });
        return;
      }
      const preset = cropPresets.find((p) => p.id === presetId);
      if (!preset) {
        log.warn('applyPreset', 'preset stale — no-op', { boxId, presetId });
        return; // stale (deleted elsewhere)
      }
      const g = clampToBounds(preset.geometry);
      setBoxes((prev) =>
        prev.map((b) =>
          b.id === boxId
            ? { ...b, x: g.x, y: g.y, w: g.w, h: g.h, title: preset.title, presetId: preset.id }
            : b,
        ),
      );
      log.debug('applyPreset', 'applied preset', { boxId, presetId });
    },
    [cropPresets],
  );

  // Upsert the box's CURRENT geometry + given title into book.crop_presets, linking the box
  // when it has no preset yet (Custom → first save). onUpsertCropPreset fires ONCE in the body —
  // never inside a setBoxes updater (StrictMode double-invokes updaters → duplicate book writes,
  // mirror confirmDeletePreset). Shared by 💾 Save and ✎ Edit (rename auto re-saves — see renameBox).
  const upsertPresetFromBox = useCallback(
    (box: CropBox, title: string) => {
      if (!onUpsertCropPreset) return; // unwired (read-only) → caller keeps session label only
      const geometry = { x: box.x, y: box.y, w: box.w, h: box.h };
      if (box.presetId) {
        onUpsertCropPreset({ id: box.presetId, title, geometry });
        log.info('upsertPresetFromBox', 'updated preset', { boxId: box.id, presetId: box.presetId });
      } else {
        const id = crypto.randomUUID();
        onUpsertCropPreset({ id, title, geometry });
        setBoxes((prev) => prev.map((b) => (b.id === box.id ? { ...b, presetId: id } : b)));
        log.info('upsertPresetFromBox', 'created preset', { boxId: box.id, presetId: id });
      }
    },
    [onUpsertCropPreset],
  );

  const renameBox = useCallback(
    (boxId: string, title: string) => {
      const trimmed = title.trim();
      const box = boxes.find((b) => b.id === boxId);
      setEditingBoxId(null);
      if (!box || !trimmed) {
        log.debug('renameBox', 'rejected empty / missing box', { boxId });
        return; // reject empty — keep current title
      }
      setBoxes((prev) => prev.map((b) => (b.id === boxId ? { ...b, title: trimmed } : b)));
      // Auto re-save the CURRENT version (geometry + new title) into book.crop_presets: a
      // successful rename upserts the preset — creating + linking it when the box is Custom,
      // and clearing any `*` dirty marker on a linked box (geometry now matches preset).
      upsertPresetFromBox(box, trimmed);
    },
    [boxes, upsertPresetFromBox],
  );

  const saveBox = useCallback(
    (boxId: string) => {
      const box = boxes.find((b) => b.id === boxId);
      if (!box || !onUpsertCropPreset) {
        log.debug('saveBox', 'no-op — missing box or unwired', { boxId });
        return; // no-op guard (read-only / unwired)
      }
      upsertPresetFromBox(box, box.title);
    },
    [boxes, onUpsertCropPreset, upsertPresetFromBox],
  );

  const deleteBox = useCallback((id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedBoxId((prev) => (prev === id ? null : prev));
    setEditingBoxId((prev) => (prev === id ? null : prev));
    log.debug('deleteBox', 'removed box from image', { id });
  }, []);

  const deleteCropPreset = useCallback(
    (boxId: string) => {
      const box = boxes.find((b) => b.id === boxId);
      if (box?.presetId && onDeleteCropPreset) {
        setConfirmDeleteBoxId(boxId); // destructive (book-wide) → confirm first
        log.debug('deleteCropPreset', 'open confirm', { boxId, presetId: box.presetId });
      } else {
        deleteBox(boxId); // no preset / unwired → remove box directly
      }
    },
    [boxes, onDeleteCropPreset, deleteBox],
  );

  const confirmDeletePreset = useCallback(() => {
    // Read state directly + run side effects OUTSIDE any updater: React StrictMode invokes
    // state-updater fns twice (dev), which would double-fire onDeleteCropPreset → a duplicate
    // updateBook write. The handler body itself runs once per click.
    const boxId = confirmDeleteBoxId;
    if (!boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    if (box?.presetId && onDeleteCropPreset) {
      onDeleteCropPreset(box.presetId);
      log.info('confirmDeletePreset', 'deleted preset book-wide', { presetId: box.presetId });
    }
    deleteBox(boxId);
    setConfirmDeleteBoxId(null);
  }, [confirmDeleteBoxId, boxes, onDeleteCropPreset, deleteBox]);

  const cancelDeletePreset = useCallback(() => setConfirmDeleteBoxId(null), []);

  // ── Commit Extract — crop every valid box, chunked, upload, → ExtractResult[] ─
  const commitExtract = useCallback(
    async (sourceUrl: string): Promise<ExtractResult[]> => {
      const valid = boxes.filter(
        (b) => b.w >= CROP_MIN_BOX_SIZE_PERCENT && b.h >= CROP_MIN_BOX_SIZE_PERCENT,
      );
      if (valid.length === 0) throw new Error('All crop areas are too small');

      const toCropBox = (box: CropBox): CropBoundingBox => ({
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        aspectRatio: nearestAllowedRatio(box.w, box.h, imageNatural),
      });

      const batches = chunk(valid, CROP_BATCH_SIZE);
      log.info('commitExtract', 'start', { boxes: valid.length, batches: batches.length });
      const settled = await Promise.allSettled(
        batches.map((b) => callCropObjectImage({ imageUrl: sourceUrl, boundingBoxes: b.map(toCropBox) })),
      );

      const flat: ExtractResult[] = [];
      const failureCodes: string[] = []; // per-batch failure reasons → classify the thrown message
      let uploadFailures = 0; // crops returned OK from the API but the storage upload threw
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status !== 'fulfilled') {
          failureCodes.push('REJECTED');
          log.warn('commitExtract', 'batch rejected', { batch: i, reason: String(s.reason) });
          continue;
        }
        const res = s.value;
        if (!res.success) {
          const code = (res as ImageApiFailure).errorCode ?? 'UNKNOWN';
          failureCodes.push(code);
          log.warn('commitExtract', 'batch api-failed', { batch: i, errorCode: code });
          continue;
        }
        const data = (res as CropObjectImageResult).data;
        if (!data) continue;
        for (const cropped of data.croppedObjects) {
          const box = batches[i][cropped.boxIndex]; // local boxIndex within this batch
          if (!box) continue;
          try {
            const publicUrl = await uploadCroppedToStorage(
              `data:${cropped.mimeType};base64,${cropped.base64}`,
              CROP_FOLDER,
            );
            flat.push({
              id: crypto.randomUUID(),
              media_url: publicUrl,
              sourceTab: 'crop',
              title: `${image.title ?? 'Image'} - ${box.title}`,
              // Frame-only spawn: geometry positions the crop; NO tag (unlike Objects).
              meta: {
                geometry: { x: box.x, y: box.y, w: box.w, h: box.h },
                ratio: cropped.aspectRatio,
                boxIndex: cropped.boxIndex,
              },
            });
          } catch (uploadErr) {
            uploadFailures++;
            log.warn('commitExtract', 'crop upload failed — skipped', {
              batch: i,
              boxIndex: cropped.boxIndex,
              error: String(uploadErr),
            });
          }
        }
      }

      if (flat.length === 0) {
        // No crop survived — classify so the toast names the real cause (connection vs API vs
        // upload) instead of the opaque "Crop failed". CONNECTION_ERROR = host unreachable
        // (offline / CORS / gateway, e.g. Cloudflare 523) — all batches hit one origin at once,
        // so any connection failure means the service is down, not the crop.
        log.error('commitExtract', 'all crops failed', { batches: settled.length, failureCodes, uploadFailures });
        if (failureCodes.includes('CONNECTION_ERROR')) {
          throw new Error('Image service unavailable — could not reach the server. Please try again later.');
        }
        if (failureCodes.length > 0) {
          throw new Error('Crop failed — the image service returned an error. Please try again.');
        }
        throw new Error('Crop failed — could not save the cropped images. Please try again.');
      }
      log.info('commitExtract', 'done', { spawned: flat.length });
      return flat;
    },
    [boxes, image.title, imageNatural],
  );

  const reset = useCallback(() => {
    setBoxes([]);
    setSelectedBoxId(null);
    setEditingBoxId(null);
    setConfirmDeleteBoxId(null);
    setImageNatural(null);
  }, []);

  const presetOptions = useMemo(
    () => cropPresets.map((p) => ({ id: p.id, title: p.title })),
    [cropPresets],
  );

  const CanvasOverlay = useMemo<ReactNode>(
    () => (
      <ObjectBoxOverlay
        boxes={boxes}
        selectedBoxId={selectedBoxId}
        imageNatural={imageNatural}
        disabled={isBusy}
        toolbarMode="preset"
        freeForm
        presetOptions={presetOptions}
        onSelectBox={selectBox}
        onUpdateBox={updateBox}
        onApplyPreset={applyPreset}
        onCloseBox={deleteBox}
        displayLabel={displayLabel}
      />
    ),
    [boxes, selectedBoxId, imageNatural, isBusy, presetOptions, selectBox, updateBox, applyPreset, deleteBox, displayLabel],
  );

  return {
    boxes,
    selectedBoxId,
    editingBoxId,
    confirmDeleteBoxId,
    interactionMode: 'box-overlay',
    commitMode: 'crop-on-extract',
    hasParams: false,
    canRun,
    CanvasOverlay,
    onImageLoad,
    addBox,
    selectBox,
    setEditingBox,
    applyPreset,
    renameBox,
    saveBox,
    deleteBox,
    deleteCropPreset,
    confirmDeletePreset,
    cancelDeletePreset,
    commitExtract,
    displayLabel,
    canSave,
    reset,
  };
}
