// objects-tab.tsx — Objects tab (design 03-objects-tab.md): bounding-box object extraction.
// Two box sources — manual `[+]` (instant, no API) and AI `Detect` (detect-objects). User
// curates boxes, then ⭐ Extract crops every box (crop-object-image, chunked ≤3/call) → upload
// → ExtractResult[] carrying meta.geometry/tag for geometry-positioned spawn. The hook owns
// box state + the params/overlay UI; the root owns the busy flags (mirrors segment/layers).

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';
import {
  callDetectObjects,
  callCropObjectImage,
  type DetectObjectsResult,
  type CropObjectImageResult,
  type CropBoundingBox,
  type DetectTag,
} from '@/apis/retouch-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { SpreadImage } from '@/types/spread-types';
import {
  BOUNDING_MODEL_OPTIONS,
  DEFAULT_BOUNDING_MODEL,
  OBJECT_BOX_COLORS,
  OBJECT_DEFAULT_BOX_SIZE_PERCENT,
  OBJECT_MIN_BOX_SIZE_PERCENT,
  CROP_BATCH_SIZE,
  Z_INDEX,
  type ExtractResult,
  type ObjectBox,
  type ObjectRatio,
} from './extract-image-modal-constants';
import { mapExtractError, uploadCroppedToStorage } from './extract-image-modal-utils';
import {
  basisGeometryToPercent,
  chunk,
  clamp,
  lockRatioForRatio,
  nearestAllowedRatio,
  snapBoxToRatio,
} from './extract-box-geometry-utils';
import { ObjectBoxOverlay } from './object-box-overlay';

const log = createLogger('Editor', 'ObjectsTab');

const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };
const DARK_TRIGGER_CLASS =
  'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';
const SECTION_LABEL_CLASS =
  'mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';

export interface ObjectsTabHandle {
  boxes: ObjectBox[];
  selectedBoxId: string | null;
  interactionMode: 'box-overlay';
  commitMode: 'crop-on-extract';
  /** boxes.length > 0 → ⭐ Extract enabled (root AND-gates with !busy && source). */
  canRun: boolean;
  /** detectContext has both visualDescription + snapshotId → 🔍 Detect enabled. */
  canDetect: boolean;
  ParamsPanel: ReactNode;
  CanvasOverlay: ReactNode;
  /** Source <img> onLoad → captures natural dims for ratio-lock + nearest-ratio math. */
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  addBox: () => void;
  selectBox: (id: string | null) => void;
  deleteBox: (id: string) => void;
  /** Calls detect-objects; maps results into detected boxes (replaces detected, keeps manual). */
  detect: (sourceUrl: string) => Promise<void>;
  /** Crops every valid box → upload → ExtractResult[]; throws on empty/all-fail (root toasts). */
  commitExtract: (sourceUrl: string) => Promise<ExtractResult[]>;
  reset: () => void;
}

interface UseObjectsTabOptions {
  /** processing || committing — disables the overlay/params controls. */
  isBusy: boolean;
  /** detect-objects context; absent → canDetect=false (manual crop still works). */
  detectContext?: { visualDescription: string; snapshotId: string };
}

/** "miu_cat" → "Miu Cat" — friendly badge from the structured tag. */
function humanizeLabel(tag: DetectTag | undefined, fallback: string): string {
  const key = tag?.object_key?.trim();
  if (!key) return fallback;
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const colorAt = (i: number): string => OBJECT_BOX_COLORS[i % OBJECT_BOX_COLORS.length];

export function useObjectsTabState(
  image: SpreadImage,
  { isBusy, detectContext }: UseObjectsTabOptions,
): ObjectsTabHandle {
  const [boxes, setBoxes] = useState<ObjectBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [boundingModel, setBoundingModel] = useState<string>(DEFAULT_BOUNDING_MODEL);
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null);

  const canRun = boxes.length > 0;
  const canDetect = !!detectContext?.visualDescription && !!detectContext?.snapshotId;

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // ── Box management (local, no API) ─────────────────────────────────────────
  const addBox = useCallback(() => {
    const id = crypto.randomUUID();
    setBoxes((prev) => {
      const n = prev.filter((b) => b.source === 'manual').length + 1;
      const size = OBJECT_DEFAULT_BOX_SIZE_PERCENT;
      const box: ObjectBox = {
        id,
        x: clamp(50 - size / 2, 0, 100 - size),
        y: clamp(50 - size / 2, 0, 100 - size),
        w: size,
        h: size,
        ratio: 'Free',
        source: 'manual',
        color: colorAt(prev.length),
        label: `Object ${n}`,
      };
      return [...prev, box];
    });
    setSelectedBoxId(id);
    log.debug('addBox', 'added manual box', { id });
  }, []);

  const selectBox = useCallback((id: string | null) => setSelectedBoxId(id), []);

  const deleteBox = useCallback((id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedBoxId((prev) => (prev === id ? null : prev));
  }, []);

  const updateBox = useCallback(
    (id: string, patch: Partial<Pick<ObjectBox, 'x' | 'y' | 'w' | 'h'>>) => {
      setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [],
  );

  const handleRatioChange = useCallback(
    (id: string, ratio: ObjectRatio) => {
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const lock = lockRatioForRatio(ratio, imageNatural);
          if (lock == null) return { ...b, ratio }; // Free — keep geometry
          const snapped = snapBoxToRatio(
            { x: b.x, y: b.y, w: b.w, h: b.h },
            lock,
            OBJECT_MIN_BOX_SIZE_PERCENT,
          );
          return { ...b, ratio, ...snapped };
        }),
      );
    },
    [imageNatural],
  );

  // ── Detect (AI) — replaces detected boxes, keeps manual ────────────────────
  const detect = useCallback(
    async (sourceUrl: string): Promise<void> => {
      if (!canDetect || !detectContext) {
        log.debug('detect', 'skipped — no detect context', {});
        return;
      }
      log.info('detect', 'start', { model: boundingModel });
      try {
        const res = await callDetectObjects({
          imageUrl: sourceUrl,
          visualDescription: detectContext.visualDescription,
          snapshotId: detectContext.snapshotId,
          modelParams: { model: boundingModel },
        });
        if (!res.success) {
          const failure = res as ImageApiFailure;
          log.warn('detect', 'failed', { errorCode: failure.errorCode, httpStatus: failure.httpStatus });
          toast.error(mapExtractError(failure));
          return;
        }
        const objects = (res as DetectObjectsResult).data?.objects ?? [];
        const keptManual = boxes.filter((b) => b.source === 'manual');
        const detected: ObjectBox[] = objects.map((o, i) => {
          const g = basisGeometryToPercent(o.geometry);
          return {
            id: crypto.randomUUID(),
            x: g.x,
            y: g.y,
            w: g.w,
            h: g.h,
            ratio: o.ratio, // detected default = clamp ratio (aspect-locked) — design §7
            apiRatio: o.ratio,
            source: 'detected',
            color: colorAt(keptManual.length + i),
            label: humanizeLabel(o.tag, `Object ${keptManual.length + i + 1}`),
            tag: o.tag,
            object: o.object,
            confidence: o.confidence,
          };
        });
        setBoxes([...keptManual, ...detected]);
        if (detected.length > 0) {
          setSelectedBoxId(detected[0].id);
        } else {
          setSelectedBoxId((prev) => (keptManual.some((b) => b.id === prev) ? prev : null));
          toast.info('No known objects detected in this image');
        }
        log.info('detect', 'done', { detected: detected.length, kept: keptManual.length });
      } catch (err) {
        log.error('detect', 'error', { error: String(err) });
        toast.error('Object detection failed. Please try again.');
      }
    },
    [canDetect, detectContext, boundingModel, boxes],
  );

  // ── Commit Extract — crop every valid box, chunked, upload, → ExtractResult[] ─
  const commitExtract = useCallback(
    async (sourceUrl: string): Promise<ExtractResult[]> => {
      const valid = boxes.filter(
        (b) => b.w >= OBJECT_MIN_BOX_SIZE_PERCENT && b.h >= OBJECT_MIN_BOX_SIZE_PERCENT,
      );
      if (valid.length === 0) throw new Error('All crop areas are too small');

      const toCropBox = (box: ObjectBox): CropBoundingBox => ({
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        aspectRatio:
          box.ratio === 'Free' ? nearestAllowedRatio(box.w, box.h, imageNatural) : box.ratio,
      });

      const batches = chunk(valid, CROP_BATCH_SIZE);
      log.info('commitExtract', 'start', { boxes: valid.length, batches: batches.length });
      const settled = await Promise.allSettled(
        batches.map((b) => callCropObjectImage({ imageUrl: sourceUrl, boundingBoxes: b.map(toCropBox) })),
      );

      const flat: ExtractResult[] = [];
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status !== 'fulfilled') {
          log.warn('commitExtract', 'batch rejected', { batch: i, reason: String(s.reason) });
          continue;
        }
        const res = s.value;
        if (!res.success) {
          log.warn('commitExtract', 'batch api-failed', { batch: i, errorCode: (res as ImageApiFailure).errorCode });
          continue;
        }
        const data = (res as CropObjectImageResult).data;
        if (!data) continue;
        for (const cropped of data.croppedObjects) {
          const box = batches[i][cropped.boxIndex]; // local boxIndex within this batch
          if (!box) continue;
          // Per-crop guard: a single malformed base64 / upload failure must not sink the whole
          // run (this loop is outside allSettled) — skip it, keep the rest.
          try {
            const publicUrl = await uploadCroppedToStorage(
              `data:${cropped.mimeType};base64,${cropped.base64}`,
              'extract-objects',
            );
            flat.push({
              id: crypto.randomUUID(),
              media_url: publicUrl,
              sourceTab: 'get_object',
              title: `${image.title ?? 'Image'} - ${box.label}`,
              meta: {
                geometry: { x: box.x, y: box.y, w: box.w, h: box.h },
                ratio: cropped.aspectRatio,
                tag: box.tag,
                boxIndex: cropped.boxIndex,
              },
            });
          } catch (uploadErr) {
            log.warn('commitExtract', 'crop upload failed — skipped', {
              batch: i,
              boxIndex: cropped.boxIndex,
              error: String(uploadErr),
            });
          }
        }
      }

      if (flat.length === 0) throw new Error('Crop failed');
      log.info('commitExtract', 'done', { spawned: flat.length });
      return flat;
    },
    [boxes, image.title, imageNatural],
  );

  const reset = useCallback(() => {
    setBoxes([]);
    setSelectedBoxId(null);
    setBoundingModel(DEFAULT_BOUNDING_MODEL);
    setImageNatural(null);
  }, []);

  const ParamsPanel = useMemo<ReactNode>(
    () => (
      <div className="flex flex-col gap-5 px-4 py-4">
        <section>
          <p className={SECTION_LABEL_CLASS}>Bounding Model</p>
          <Select value={boundingModel} onValueChange={setBoundingModel} disabled={isBusy}>
            <SelectTrigger className={DARK_TRIGGER_CLASS} aria-label="Bounding model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={SELECT_CONTENT_STYLE}>
              {BOUNDING_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-[var(--swap-modal-text-muted)]">
            Used by Detect to locate objects in the scene.
          </p>
        </section>
      </div>
    ),
    [boundingModel, isBusy],
  );

  const CanvasOverlay = useMemo<ReactNode>(
    () => (
      <ObjectBoxOverlay
        boxes={boxes}
        selectedBoxId={selectedBoxId}
        imageNatural={imageNatural}
        disabled={isBusy}
        onSelectBox={selectBox}
        onUpdateBox={updateBox}
        onRatioChange={handleRatioChange}
      />
    ),
    [boxes, selectedBoxId, imageNatural, isBusy, selectBox, updateBox, handleRatioChange],
  );

  return {
    boxes,
    selectedBoxId,
    interactionMode: 'box-overlay',
    commitMode: 'crop-on-extract',
    canRun,
    canDetect,
    ParamsPanel,
    CanvasOverlay,
    onImageLoad,
    addBox,
    selectBox,
    deleteBox,
    detect,
    commitExtract,
    reset,
  };
}
