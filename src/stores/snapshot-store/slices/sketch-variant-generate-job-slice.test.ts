import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createSketchSlice } from './sketch-slice';
import { createSketchVariantGenerateJobSlice } from './sketch-variant-generate-job-slice';
import type { SketchEntity } from '@/types/sketch';
import {
  callGenerateVariantSheet,
  callCropSheetRow,
  type GenerateVariantSheetResult,
  type CropSheetRowResult,
} from '@/apis/sketch-variant-api';

// Mock the sonner toast (no-snapshot + geo-warning paths toast) + the api-client seam.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/apis/sketch-variant-api', () => ({
  callGenerateVariantSheet: vi.fn(),
  callCropSheetRow: vi.fn(),
}));
const mockedGen = vi.mocked(callGenerateVariantSheet);
const mockedCut = vi.mocked(callCropSheetRow);

// Isolate resource-lock (collabPersist=false → legacy flushSnapshot path) + book-store (artStyleId).
// This unit test imports the slice DIRECTLY (bypassing snapshot-store/index), so the real modules
// would close the slice ↔ store cycle.
vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => ({ collabPersist: false }) },
}));
vi.mock('@/stores/book-store', () => ({
  useBookStore: { getState: () => ({ currentBook: { sketchstyle_id: 'style-1' } }) },
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
// Isolated harness: sketch slice (state + per-variant setters) + the variant-job slice, plus the only
// cross-slice deps runGenerate touches — sync, meta.id (snapshotId after the awaited flush),
// flushSnapshot (awaited; stubbed no-op) and autoSaveSnapshot (fire-and-forget; stubbed no-op).
function createTestStore(metaId: string | null = 'snap-1') {
  const flushSnapshot = vi.fn(async () => {});
  const autoSaveSnapshot = vi.fn(async () => {});
  const store = create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchSlice as any)(...a),
      ...(createSketchVariantGenerateJobSlice as any)(...a),
      sync: { isDirty: false, isSaving: false },
      meta: { id: metaId },
      flushSnapshot,
      autoSaveSnapshot,
    })),
  );
  return { store, flushSnapshot, autoSaveSnapshot };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Drain microtasks by yielding a macrotask.
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

const REF = { kind: 'characters', entityKey: 'kid', variantKey: 'hero' } as const;

// Entity carrying a base + a non-base 'hero' variant (setters no-op if the variant is absent).
const entityWithVariant = (): SketchEntity => ({
  key: 'kid',
  variants: [
    { key: 'base', description: '', visual_design: '', art_language: '' },
    { key: 'hero', description: '', visual_design: 'brave knight', art_language: '' },
  ],
});

const okGen = (imageUrl: string): GenerateVariantSheetResult => ({
  success: true,
  data: {
    imageUrl,
    storagePath: `p/${imageUrl}`,
    entityKey: 'kid',
    variantKey: 'hero',
    grid: { cols: 4, rows: 1, aspectRatio: '21:9', cellCount: 4 },
  },
});

const okCut = (
  urls: string[],
  meta?: CropSheetRowResult['meta'],
): CropSheetRowResult => ({
  success: true,
  data: {
    crops: urls.map((u, i) => ({
      cell: i + 1,
      imageUrl: u,
      storagePath: `p/${u}`,
      geometry: { x: 0, y: 0, w: 10, h: 10 },
      source: 'rect' as const,
    })),
    cellCount: urls.length,
    sheetDimensions: { width: 100, height: 50 },
  },
  meta,
});

const variantHero = (store: ReturnType<typeof createTestStore>['store']) =>
  store.getState().sketch.characters.find((e: SketchEntity) => e.key === 'kid')!.variants.find(
    (v: { key: string }) => v.key === 'hero',
  )!;

describe('SketchVariantGenerateJobSlice', () => {
  let store: ReturnType<typeof createTestStore>['store'];
  let flushSnapshot: ReturnType<typeof createTestStore>['flushSnapshot'];
  let autoSaveSnapshot: ReturnType<typeof createTestStore>['autoSaveSnapshot'];

  beforeEach(() => {
    mockedGen.mockReset();
    mockedCut.mockReset();
    ({ store, flushSnapshot, autoSaveSnapshot } = createTestStore());
    store.getState().setSketchEntities('characters', [entityWithVariant()]);
  });

  it('(a) flushes the snapshot BEFORE calling generate', async () => {
    mockedGen.mockResolvedValueOnce(okGen('raw.png'));
    mockedCut.mockResolvedValueOnce(okCut(['c1.png', 'c2.png', 'c3.png', 'c4.png']));

    store.getState().startVariantSheetGenerate(REF);
    await tick();

    expect(flushSnapshot).toHaveBeenCalled();
    expect(mockedGen).toHaveBeenCalledTimes(1);
    // Order: the awaited flush must run before generate is dispatched.
    expect(flushSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      mockedGen.mock.invocationCallOrder[0],
    );
    // Snapshot-reading payload carries the resolved snapshotId + artStyleId (not entity text).
    expect(mockedGen.mock.calls[0][0]).toBe('characters'); // kind dispatch
    expect(mockedGen.mock.calls[0][1]).toMatchObject({
      snapshotId: 'snap-1',
      entityKey: 'kid',
      variantKey: 'hero',
      artStyleId: 'style-1',
    });
  });

  it('(b) meta.id == null → toasts + does NOT call generate + keeps the errored op', async () => {
    ({ store, flushSnapshot } = createTestStore(null)); // meta.id stays null through the stubbed flush
    store.getState().setSketchEntities('characters', [entityWithVariant()]);
    mockedGen.mockResolvedValue(okGen('raw.png'));

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    await tick();

    const { toast } = await import('sonner');
    expect(flushSnapshot).toHaveBeenCalled();
    expect(mockedGen).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Save the book first, then generate.');
    // op kept (error set) so the notifications hook can surface it.
    expect(store.getState().variantSheetGenerateOp).not.toBeNull();
    expect(store.getState().variantSheetGenerateOp?.error).toBe('Save the book first, then generate.');
  });

  it('(c) advances phase generate → cut', async () => {
    const dGen = deferred<GenerateVariantSheetResult>();
    const dCut = deferred<CropSheetRowResult>();
    mockedGen.mockReturnValueOnce(dGen.promise as never);
    mockedCut.mockReturnValueOnce(dCut.promise as never);

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    expect(store.getState().variantSheetGenerateOp?.phase).toBe('generate');

    dGen.resolve(okGen('raw.png'));
    await tick();
    expect(store.getState().variantSheetGenerateOp?.phase).toBe('cut');

    dCut.resolve(okCut(['c1.png', 'c2.png', 'c3.png', 'c4.png']));
    await tick();
    // op finalized to null after a clean run.
    expect(store.getState().variantSheetGenerateOp).toBeNull();
  });

  it('(d) writes raw (prepend, selected) + crops via the setters with the right pathPrefix', async () => {
    mockedGen.mockResolvedValueOnce(okGen('raw.png'));
    mockedCut.mockResolvedValueOnce(okCut(['c1.png', 'c2.png', 'c3.png', 'c4.png']));

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    await tick();
    await tick();

    const hero = variantHero(store);
    // Raw sheet: 1 version, prepended + selected.
    expect(hero.raw_sheet.illustrations).toHaveLength(1);
    expect(hero.raw_sheet.illustrations[0].media_url).toBe('raw.png');
    expect(hero.raw_sheet.illustrations[0].is_selected).toBe(true);
    // Crops: 4 positional cells, one canonical illustration each.
    expect(hero.raw_sheet.crops).toHaveLength(4);
    expect(hero.raw_sheet.crops.map((c: { illustrations: { media_url: string }[] }) => c.illustrations[0].media_url)).toEqual([
      'c1.png',
      'c2.png',
      'c3.png',
      'c4.png',
    ]);
    // Cut endpoint got the derived pathPrefix + fixed cellCount 4.
    expect(mockedCut.mock.calls[0][0]).toMatchObject({
      imageUrl: 'raw.png',
      cellCount: 4,
      pathPrefix: 'sketches/variants/characters/kid/hero',
    });
    // Durability autosave fired.
    expect(autoSaveSnapshot).toHaveBeenCalled();
    expect(store.getState().variantSheetGenerateOp).toBeNull();
  });

  it('(e) crops are NOT auto-locked (cell.is_selected=false, inner illustration selected)', async () => {
    mockedGen.mockResolvedValueOnce(okGen('raw.png'));
    mockedCut.mockResolvedValueOnce(okCut(['c1.png', 'c2.png', 'c3.png', 'c4.png']));

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    await tick();
    await tick();

    const crops = variantHero(store).raw_sheet.crops;
    expect(crops.every((c: { is_selected: boolean }) => c.is_selected === false)).toBe(true);
    expect(crops.every((c: { illustrations: { is_selected: boolean }[] }) => c.illustrations[0].is_selected === true)).toBe(true);
  });

  it('(f) single-flight: a second start while an op runs is a no-op', async () => {
    const dGen = deferred<GenerateVariantSheetResult>();
    mockedGen.mockReturnValueOnce(dGen.promise as never);

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    expect(mockedGen).toHaveBeenCalledTimes(1);

    // Second start (even a different ref) blocked while an op != null.
    store.getState().startVariantSheetGenerate({ kind: 'props', entityKey: 'sword', variantKey: 'gold' });
    expect(mockedGen).toHaveBeenCalledTimes(1); // still 1
    expect(store.getState().variantSheetGenerateOp?.entityKey).toBe('kid'); // original op unchanged

    dGen.resolve(okGen('raw.png'));
    await tick();
  });

  it('(g) error path keeps the op (with friendly message) until dismiss clears it', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    mockedGen.mockResolvedValueOnce({ success: false, error: 'boom', errorCode: 'LLM_ERROR' } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    await tick();

    const op = store.getState().variantSheetGenerateOp;
    expect(op).not.toBeNull();
    expect(op?.error).toContain('image model'); // LLM_ERROR friendly copy
    // No crops/raw written on a generate failure.
    expect(variantHero(store).raw_sheet).toBeUndefined();
    expect(mockedCut).not.toHaveBeenCalled();

    store.getState().dismissVariantSheetGenerateError();
    expect(store.getState().variantSheetGenerateOp).toBeNull();
  });

  it('opStale: op reset mid-generate → raw + crops NOT written, cut never called', async () => {
    const dGen = deferred<GenerateVariantSheetResult>();
    mockedGen.mockReturnValueOnce(dGen.promise as never);

    store.getState().startVariantSheetGenerate(REF);
    await tick();

    // Simulate resetSnapshot clearing the op while the generate call is in flight.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setState((s: any) => {
      s.variantSheetGenerateOp = null;
    });
    dGen.resolve(okGen('raw.png'));
    await tick();
    await tick();

    expect(variantHero(store).raw_sheet).toBeUndefined(); // no raw written
    expect(mockedCut).not.toHaveBeenCalled(); // opStale bailed before the cut phase
  });

  it('non-fatal: geoFallback/fullbleed warning toasts but still writes crops', async () => {
    mockedGen.mockResolvedValueOnce(okGen('raw.png'));
    mockedCut.mockResolvedValueOnce(
      okCut(['c1.png', 'c2.png', 'c3.png', 'c4.png'], { geoFallbackCount: 2, fullbleedWarning: true }),
    );

    store.getState().startVariantSheetGenerate(REF);
    await tick();
    await tick();
    await tick();

    const { toast } = await import('sonner');
    expect(toast.warning).toHaveBeenCalledWith('Some cells may be misaligned');
    expect(variantHero(store).raw_sheet.crops).toHaveLength(4); // crops still written
    expect(store.getState().variantSheetGenerateOp).toBeNull(); // warning is non-fatal → op finalized
  });
});
