// texts-tab.tsx — Texts tab (design 06-texts-tab.md): OCR text extraction.
// One box source only — AI `Detect` (detect-texts, Gemini OCR). Boxes are SELECT-ONLY
// (geometry immutable, no `[+]` manual add, no move/resize). ⭐ Extract is client-side ONLY:
// it maps each detected box → `ExtractedTextbox { content, geometry }` and the parent spawns
// raw_textboxes[] into the current spread (NO API / upload). Font size is NOT inferred from box
// height (Validation S1) — the parent assembles typography from the book default.
// The hook owns box state + the params/overlay UI; the root owns the busy flags (mirrors objects).

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
import { callDetectTexts, type DetectTextsResult } from '@/apis/retouch-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { SpreadImage } from '@/types/spread-types';
import {
  OCR_MODEL_OPTIONS,
  DEFAULT_OCR_MODEL,
  TEXT_BOX_COLORS,
  Z_INDEX,
  type ExtractedTextbox,
  type TextBox,
} from './extract-image-modal-constants';
import { mapExtractError, resolveSourceImageUrl } from './extract-image-modal-utils';
import { basisGeometryToPercent } from './extract-box-geometry-utils';
import { ObjectBoxOverlay } from './object-box-overlay';

const log = createLogger('Editor', 'TextsTab');

const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };
const DARK_TRIGGER_CLASS =
  'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';
const SECTION_LABEL_CLASS =
  'mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';

const colorAt = (i: number): string => TEXT_BOX_COLORS[i % TEXT_BOX_COLORS.length];

/** Stable no-op for the readOnly overlay's required `onUpdateBox` (never invoked — Texts boxes
 *  are select-only). Lowercase so react-refresh doesn't treat it as a component export. */
const noopUpdateBox = () => {};

/** Handle exposed to the root — shares the box-overlay field names (`selectedBoxId`/`deleteBox`)
 *  with ObjectsTabHandle so the root drives all box-overlay tabs through one contract. NOTE:
 *  `commitExtract` is SYNC here (client-side spawn) unlike Objects/Crops (async crop+upload) —
 *  the root routes commit by `commitMode`, so it never calls this through the shared handle. */
export interface TextsTabHandle {
  texts: TextBox[];
  selectedBoxId: string | null;
  interactionMode: 'box-overlay';
  commitMode: 'spawn-textbox';
  manualAdd: false;
  /** texts.length > 0 → ⭐ Extract enabled (root AND-gates with !busy). */
  canRun: boolean;
  /** Source image present → 🔍 Detect enabled (OCR needs no scene context). */
  canDetect: boolean;
  ParamsPanel: ReactNode;
  CanvasOverlay: ReactNode;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  selectBox: (id: string | null) => void;
  /** Removes the text + its box (1:1) — does NOT re-number the remaining badges. */
  deleteBox: (id: string) => void;
  /** Calls detect-texts and REPLACES the whole list (no manual boxes to keep). */
  detect: (sourceUrl: string) => Promise<void>;
  /** Maps every detected box → ExtractedTextbox (SYNC — no API/upload). */
  commitExtract: () => ExtractedTextbox[];
  reset: () => void;
}

interface UseTextsTabOptions {
  /** processing || committing — disables the params controls. */
  isBusy: boolean;
  /** Attribution-only snapshot version id → ai_service_logs.snapshot_id (book cost). */
  snapshotId?: string;
}

export function useTextsTabState(
  image: SpreadImage,
  { isBusy, snapshotId }: UseTextsTabOptions,
): TextsTabHandle {
  const [texts, setTexts] = useState<TextBox[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [ocrModel, setOcrModel] = useState<string>(DEFAULT_OCR_MODEL);
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null);

  const canRun = texts.length > 0;
  const canDetect = !!resolveSourceImageUrl(image);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const selectBox = useCallback((id: string | null) => setSelectedTextId(id), []);

  const deleteBox = useCallback((id: string) => {
    // No re-number — badges stay stable so the user's mental map of "box 3" doesn't shift.
    setTexts((prev) => prev.filter((t) => t.id !== id));
    setSelectedTextId((prev) => (prev === id ? null : prev));
  }, []);

  // ── Detect (AI OCR) — REPLACES the whole list (no manual boxes exist) ──────
  const detect = useCallback(
    async (sourceUrl: string): Promise<void> => {
      if (!sourceUrl) {
        log.debug('detect', 'skipped — no source url', {});
        return;
      }
      log.info('detect', 'start', { model: ocrModel });
      try {
        const res = await callDetectTexts({
          imageUrl: sourceUrl,
          modelParams: { model: ocrModel },
          snapshotId,
        });
        if (!res.success) {
          const failure = res as ImageApiFailure;
          log.warn('detect', 'failed', { errorCode: failure.errorCode, httpStatus: failure.httpStatus });
          toast.error(mapExtractError(failure));
          return;
        }
        const detected = (res as DetectTextsResult).data?.texts ?? [];
        // basis 10000 → %, 1-based ordinal badge, cycled color.
        const next: TextBox[] = detected.map((t, i) => {
          const g = basisGeometryToPercent(t.geometry);
          return {
            id: crypto.randomUUID(),
            index: i + 1,
            content: t.content,
            x: g.x,
            y: g.y,
            w: g.w,
            h: g.h,
            color: colorAt(i),
            confidence: t.confidence,
          };
        });
        setTexts(next);
        setSelectedTextId(next[0]?.id ?? null);
        if (next.length === 0) {
          log.debug('detect', 'no text detected', {});
          toast.info('No text detected in this image');
        }
        log.info('detect', 'done', { count: next.length });
      } catch (err) {
        // ⚠️ never include OCR content in error context (PII).
        log.error('detect', 'error', { error: String(err) });
        toast.error('Text detection failed. Please try again.');
      }
    },
    [ocrModel, snapshotId],
  );

  // ── Commit Extract — map boxes → ExtractedTextbox (SYNC, no API/upload) ─────
  const commitExtract = useCallback((): ExtractedTextbox[] => {
    if (texts.length === 0) {
      log.debug('commitExtract', 'no texts — nothing to spawn', {});
      return []; // root canRun=false blocks this path first.
    }
    const specs = texts.map((t) => ({
      content: t.content,
      geometry: { x: t.x, y: t.y, w: t.w, h: t.h },
    }));
    log.info('commitExtract', 'done', { count: specs.length });
    return specs;
  }, [texts]);

  const reset = useCallback(() => {
    setTexts([]);
    setSelectedTextId(null);
    setOcrModel(DEFAULT_OCR_MODEL);
    setImageNatural(null);
  }, []);

  const ParamsPanel = useMemo<ReactNode>(
    () => (
      <div className="flex flex-col gap-5 px-4 py-4">
        <section>
          <p className={SECTION_LABEL_CLASS}>OCR Model</p>
          <Select value={ocrModel} onValueChange={setOcrModel} disabled={isBusy}>
            <SelectTrigger className={DARK_TRIGGER_CLASS} aria-label="OCR model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={SELECT_CONTENT_STYLE}>
              {OCR_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-[var(--swap-modal-text-muted)]">
            Used by Detect to read text from the image.
          </p>
        </section>
      </div>
    ),
    [ocrModel, isBusy],
  );

  const CanvasOverlay = useMemo<ReactNode>(
    () => (
      <ObjectBoxOverlay
        boxes={texts.map((t) => ({
          id: t.id,
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
          color: t.color,
          label: String(t.index),
        }))}
        selectedBoxId={selectedTextId}
        imageNatural={imageNatural}
        readOnly
        numbered
        onSelectBox={selectBox}
        // Required by the shared props but never called in readOnly (geometry is immutable).
        onUpdateBox={noopUpdateBox}
      />
    ),
    [texts, selectedTextId, imageNatural, selectBox],
  );

  return {
    texts,
    selectedBoxId: selectedTextId,
    interactionMode: 'box-overlay',
    commitMode: 'spawn-textbox',
    manualAdd: false,
    canRun,
    canDetect,
    ParamsPanel,
    CanvasOverlay,
    onImageLoad,
    selectBox,
    deleteBox,
    detect,
    commitExtract,
    reset,
  };
}
