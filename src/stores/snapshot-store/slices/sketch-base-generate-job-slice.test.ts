import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createSketchSlice } from './sketch-slice';
import { createSketchBaseGenerateJobSlice } from './sketch-base-generate-job-slice';
import type { SketchEntity } from '@/types/sketch';
import { callGenerateBaseSheet, callCropBaseSheet, type GenerateBaseSheetResult, type CropBaseSheetResult } from '@/apis/sketch-base-api';
import { uploadImageToStorage } from '@/apis/storage-api';

// Mock the api-client seam
vi.mock('@/apis/sketch-base-api', () => ({
  callGenerateBaseSheet: vi.fn(),
  callCropBaseSheet: vi.fn(),
}));
const mockedGenerateCall = vi.mocked(callGenerateBaseSheet);
const mockedCropCall = vi.mocked(callCropBaseSheet);

// Mock resource-lock-store to isolate from collab
vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => ({ collabPersist: false, myUserId: null, holderNames: new Map() }) },
}));

// Mock sonner toast
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

// Mock storage upload + base64→File seams (reference-image persistence path). base64ToFile is
// mocked so the test does not depend on a global File/atob in the runner.
vi.mock('@/apis/storage-api', () => ({ uploadImageToStorage: vi.fn() }));
vi.mock('@/utils/file-utils', async (orig) => ({
  ...(await orig<typeof import('@/utils/file-utils')>()),
  base64ToFile: vi.fn(() => new Blob(['x'], { type: 'image/png' })),
}));
const mockedUpload = vi.mocked(uploadImageToStorage);

/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore(metaId: string | null = 'snap-1') {
  const autoSaveSnapshot = vi.fn(async () => {});
  const store = create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchSlice as any)(...a),
      ...(createSketchBaseGenerateJobSlice as any)(...a),
      sync: { isDirty: false, isSaving: false },
      meta: { id: metaId },
      autoSaveSnapshot,
    })),
  );
  return { store, autoSaveSnapshot };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Drain microtasks
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Success response helper (camelCase matching backend contract)
const okGenerate = (imageUrl: string): GenerateBaseSheetResult => ({
  success: true,
  data: {
    imageUrl,
    storagePath: `path/${imageUrl}`,
    cellOrder: ['entity1', 'entity2'],
    grid: { cols: 2, rows: 2, cellWidth: 256, cellHeight: 256 },
  },
});

const okCrop = (crops: Array<{ key: string; imageUrl: string }>, skipped?: { key: string }[]): CropBaseSheetResult => ({
  success: true,
  data: {
    crops: crops.map((c) => ({
      key: c.key,
      imageUrl: c.imageUrl,
      geometry: { x: 0, y: 0, width: 128, height: 128 },
      source: 'crop',
    })),
    skipped,
  },
});

describe('SketchBaseGenerateJobSlice', () => {
  let store: ReturnType<typeof createTestStore>['store'];
  let autoSaveSnapshot: ReturnType<typeof createTestStore>['autoSaveSnapshot'];

  beforeEach(() => {
    mockedGenerateCall.mockReset();
    mockedCropCall.mockReset();
    mockedUpload.mockReset();
    ({ store, autoSaveSnapshot } = createTestStore());
  });

  it('add-mode: start → generate → crop chain writes raw + crops → op finalizes to null', async () => {
    // Setup base entities
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [
        {
          key: 'base',
          description: '',
          visual_design: 'mighty warrior',
          art_language: '',
        },
      ],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    // Mock successful generate → crop chain
    mockedGenerateCall.mockResolvedValueOnce(okGenerate('raw.png'));
    mockedCropCall.mockResolvedValueOnce(okCrop([{ key: 'hero', imageUrl: 'crop-hero.png' }]));

    // Start the job in 'add' mode (creates a new style)
    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test prompt',
      referenceImages: [],
      artStyleId: 'style-1',
    });
    await tick();
    await tick();
    await tick();

    // Assert raw written (prepended + selected)
    const style = store.getState().sketch.base.character_sheet.styles[0];
    expect(style.illustrations).toHaveLength(1);
    expect(style.illustrations[0].media_url).toBe('raw.png');
    expect(style.illustrations[0].is_selected).toBe(true);

    // Assert crops written
    expect(style.crops).toHaveLength(1);
    expect(style.crops[0].key).toBe('hero');
    expect(style.crops[0].illustrations[0].media_url).toBe('crop-hero.png');

    // Assert op finalized (null after success)
    expect(store.getState().baseSheetGenerateOp).toBeNull();

    // Assert autoSave called
    expect(autoSaveSnapshot).toHaveBeenCalled();
  });

  it('opStale: reset op mid-await → crops NOT written', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    const dGen = deferred<ReturnType<typeof okGenerate>>();
    mockedGenerateCall.mockReturnValueOnce(dGen.promise as never);

    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test',
      referenceImages: [],
      artStyleId: 'style-1',
    });
    await tick();

    // Simulate op reset (cancel or removeStyle mid-chain)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setState((s: any) => {
      s.baseSheetGenerateOp = null;
    });

    // Resolve generate (but op is stale, runCrop guard should bail)
    dGen.resolve(okGenerate('raw.png'));
    await tick();
    await tick();

    // Assert raw NOT written
    const style = store.getState().sketch.base.character_sheet.styles[0];
    expect(style.illustrations).toEqual([]); // no raw added

    // Assert crop was never called (opStale prevented runCrop)
    expect(mockedCropCall).not.toHaveBeenCalled();
  });

  it('single-flight: second start blocked while op != null', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    const dGen = deferred<ReturnType<typeof okGenerate>>();
    mockedGenerateCall.mockReturnValueOnce(dGen.promise as never);

    // First start
    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test',
      referenceImages: [],
      artStyleId: 'style-1',
    });
    await tick();
    expect(mockedGenerateCall).toHaveBeenCalledTimes(1);

    // Second start while op != null → no-op
    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test2',
      referenceImages: [],
      artStyleId: 'style-2',
    });
    expect(mockedGenerateCall).toHaveBeenCalledTimes(1); // still 1, not 2

    dGen.resolve(okGenerate('raw.png'));
    await tick();
  });

  it('recrop: style with raw → crop-only overwrites crops', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    // Add style with raw + old crops
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [
        { type: 'created' as const, media_url: 'raw.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
      ],
      crops: [
        {
          key: 'hero',
          illustrations: [
            { type: 'created' as const, media_url: 'old-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
          ],
        },
      ],
    });

    // Mock crop result (new crops)
    mockedCropCall.mockResolvedValueOnce(okCrop([{ key: 'hero', imageUrl: 'new-crop.png' }]));

    // Start recrop (crop-only, references the existing raw at style index 0)
    store.getState().recropBaseSheet('characters', 0);
    await tick();
    await tick();

    // Assert raw untouched
    const style = store.getState().sketch.base.character_sheet.styles[0];
    expect(style.illustrations[0].media_url).toBe('raw.png');

    // Assert crops overwritten
    expect(style.crops[0].illustrations[0].media_url).toBe('new-crop.png');
  });

  it('error: add-mode generate fail (no raw) → orphaned style rolled back + op.error persists until dismiss', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);
    // Sheet starts empty — add appends one style, which must be rolled back on failure.
    expect(store.getState().sketch.base.character_sheet.styles).toHaveLength(0);

    // Mock generate fail
    /* eslint-disable @typescript-eslint/no-explicit-any */
    mockedGenerateCall.mockResolvedValueOnce({
      success: false,
      error: 'boom',
      errorCode: 'LLM_ERROR',
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test',
      referenceImages: [],
      artStyleId: 'style-1',
    });
    await tick();
    await tick();

    // Assert the appended (empty) style was rolled back — sheet back to original length.
    expect(store.getState().sketch.base.character_sheet.styles).toHaveLength(0);

    // Assert op.error set + op kept (not finalized to null)
    expect(store.getState().baseSheetGenerateOp).not.toBeNull();
    expect(store.getState().baseSheetGenerateOp?.error).toContain('image model');

    // Dismiss
    store.getState().dismissBaseSheetGenerateError();
    expect(store.getState().baseSheetGenerateOp).toBeNull();
  });

  it('refs: uploads → persists image_references on the style + sends media_url refs to generate', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    mockedUpload.mockResolvedValueOnce({ publicUrl: 'https://cdn/ref-a.png', path: 'sketch-base-refs/ref-a.png' });
    mockedGenerateCall.mockResolvedValueOnce(okGenerate('raw.png'));
    mockedCropCall.mockResolvedValueOnce(okCrop([{ key: 'hero', imageUrl: 'crop-hero.png' }]));

    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test',
      referenceImages: [{ label: 'ref-a.jpg', base64Data: 'QUFB', mimeType: 'image/png' }],
      artStyleId: 'style-1',
    });
    await tick();
    await tick();
    await tick();

    const style = store.getState().sketch.base.character_sheet.styles[0];
    expect(style.image_references).toEqual([{ title: 'ref-a.jpg', media_url: 'https://cdn/ref-a.png' }]);
    // Generate received the uploaded URL (NOT base64).
    const genArg = mockedGenerateCall.mock.calls[0][1];
    expect(genArg.referenceImages).toEqual([{ media_url: 'https://cdn/ref-a.png' }]);
  });

  it('refs: upload failure → base64 fallback to generate, image_references stays empty', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    mockedUpload.mockRejectedValueOnce(new Error('storage down'));
    mockedGenerateCall.mockResolvedValueOnce(okGenerate('raw.png'));
    mockedCropCall.mockResolvedValueOnce(okCrop([{ key: 'hero', imageUrl: 'crop-hero.png' }]));

    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test',
      referenceImages: [{ label: 'ref-a.jpg', base64Data: 'QUFB', mimeType: 'image/png' }],
      artStyleId: 'style-1',
    });
    await tick();
    await tick();
    await tick();

    const style = store.getState().sketch.base.character_sheet.styles[0];
    expect(style.image_references).toEqual([]); // upload failed → not persisted
    const genArg = mockedGenerateCall.mock.calls[0][1];
    expect(genArg.referenceImages).toEqual([{ base64Data: 'QUFB', mimeType: 'image/png' }]); // base64 fallback
  });

  it('error: add-mode crop fail AFTER raw landed → style KEPT (not rolled back) + op.error set', async () => {
    const baseEntity: SketchEntity = {
      key: 'hero',
      variants: [{ key: 'base', description: '', visual_design: 'test', art_language: '' }],
    };
    store.getState().setSketchEntities('characters', [baseEntity]);

    // Generate succeeds (raw lands), crop fails → partial success → keep the style.
    mockedGenerateCall.mockResolvedValueOnce(okGenerate('raw.png'));
    /* eslint-disable @typescript-eslint/no-explicit-any */
    mockedCropCall.mockResolvedValueOnce({
      success: false,
      error: 'boom',
      errorCode: 'ALL_CROPS_FAILED',
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    store.getState().startBaseSheetGenerate({
      kind: 'characters',
      mode: 'add',
      stylePrompt: 'test',
      referenceImages: [],
      artStyleId: 'style-1',
    });
    await tick();
    await tick();
    await tick();

    // Style KEPT (raw already landed = partial success) with the raw illustration.
    const styles = store.getState().sketch.base.character_sheet.styles;
    expect(styles).toHaveLength(1);
    expect(styles[0].illustrations[0].media_url).toBe('raw.png');

    // op.error set + kept
    expect(store.getState().baseSheetGenerateOp).not.toBeNull();
    expect(store.getState().baseSheetGenerateOp?.error).toContain('crop');
  });
});
