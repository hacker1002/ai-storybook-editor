// crops-tab.test.tsx — useCropsTabState (design 05-crops-tab.md §4.3). Covers addBox,
// applyPreset (apply/custom/stale), saveBox (create+link / update), renameBox (reject empty /
// auto re-save current version: create+link Custom, re-save diverged geometry), deleteBox vs
// deleteCropPreset (✕ keeps preset / 🗑 confirm flow), the
// derived dirty marker, and commitExtract (filter min-size, no tag, empty → throw). The crop
// API + storage upload are the only network seams (mocked).

import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SpreadImage } from '@/types/spread-types';
import type { CropPreset } from '@/types/editor';
import { useCropsTabState } from './crops-tab';

vi.mock('@/apis/retouch-api', () => ({
  callCropObjectImage: vi.fn(),
}));
import { callCropObjectImage } from '@/apis/retouch-api';
const mockCrop = vi.mocked(callCropObjectImage);

vi.mock('./extract-image-modal-utils', () => ({
  uploadCroppedToStorage: vi.fn(async () => 'https://storage/crop.png'),
}));
import { uploadCroppedToStorage } from './extract-image-modal-utils';
const mockUpload = vi.mocked(uploadCroppedToStorage);

const IMAGE = { id: 'src-1', title: 'Scene' } as SpreadImage;
const SOURCE_URL = 'https://storage/source.png';

interface RenderOpts {
  cropPresets?: CropPreset[];
  onUpsert?: ReturnType<typeof vi.fn> | undefined;
  onDelete?: ReturnType<typeof vi.fn> | undefined;
  wireUpsert?: boolean;
  wireDelete?: boolean;
}

function renderCropsTab(opts: RenderOpts = {}) {
  const onUpsert = opts.wireUpsert === false ? undefined : opts.onUpsert ?? vi.fn();
  const onDelete = opts.wireDelete === false ? undefined : opts.onDelete ?? vi.fn();
  const utils = renderHook(
    ({ presets }: { presets: CropPreset[] }) =>
      useCropsTabState(IMAGE, {
        isBusy: false,
        cropPresets: presets,
        onUpsertCropPreset: onUpsert as ((preset: CropPreset) => void) | undefined,
        onDeleteCropPreset: onDelete as ((presetId: string) => void) | undefined,
      }),
    // StrictMode so impure state-updaters (side effects inside setX(updater)) are caught:
    // React double-invokes updaters in dev, surfacing duplicate side-effect fires.
    { initialProps: { presets: opts.cropPresets ?? [] }, wrapper: StrictMode },
  );
  return { ...utils, onUpsert, onDelete };
}

beforeEach(() => {
  mockCrop.mockReset();
  mockUpload.mockReset();
  mockUpload.mockResolvedValue('https://storage/crop.png');
});

describe('useCropsTabState — box management', () => {
  it('addBox creates a centered Custom box, selects it, canRun true', () => {
    const { result } = renderCropsTab();
    expect(result.current.canRun).toBe(false);
    act(() => result.current.addBox());
    expect(result.current.boxes).toHaveLength(1);
    const box = result.current.boxes[0];
    expect(box.title).toBe('Custom 1');
    expect(box.presetId).toBeNull();
    expect(box).toMatchObject({ x: 10, y: 10, w: 80, h: 80 }); // 10% inset per edge
    expect(result.current.selectedBoxId).toBe(box.id);
    expect(result.current.canRun).toBe(true);
  });

  it('deleteBox removes the box and keeps presets (non-destructive)', () => {
    const { result, onDelete } = renderCropsTab();
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.deleteBox(id));
    expect(result.current.boxes).toHaveLength(0);
    expect(result.current.selectedBoxId).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('useCropsTabState — applyPreset', () => {
  const preset: CropPreset = { id: 'p1', title: 'Sunny', geometry: { x: 10, y: 12, w: 20, h: 24 } };

  it('applies a preset geometry + title + link', () => {
    const { result } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    const box = result.current.boxes[0];
    expect(box).toMatchObject({ x: 10, y: 12, w: 20, h: 24, title: 'Sunny', presetId: 'p1' });
    expect(result.current.displayLabel(id)).toBe('Sunny'); // not dirty (matches preset)
  });

  it('null preset → Custom: drops link, keeps geometry', () => {
    const { result } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    act(() => result.current.applyPreset(id, null));
    const box = result.current.boxes[0];
    expect(box.presetId).toBeNull();
    expect(box).toMatchObject({ x: 10, y: 12, w: 20, h: 24 }); // geometry kept
  });

  it('stale preset id → no-op', () => {
    const { result } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    const before = { ...result.current.boxes[0] };
    act(() => result.current.applyPreset(id, 'does-not-exist'));
    expect(result.current.boxes[0]).toEqual(before);
  });
});

describe('useCropsTabState — dirty marker', () => {
  it('shows `*` when the linked preset geometry diverges from the box', () => {
    const preset: CropPreset = { id: 'p1', title: 'Sunny', geometry: { x: 10, y: 10, w: 20, h: 20 } };
    const { result, rerender } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    expect(result.current.displayLabel(id)).toBe('Sunny'); // in sync

    // Preset edited elsewhere (book-wide) → box geometry now diverges → dirty.
    rerender({ presets: [{ ...preset, geometry: { x: 50, y: 50, w: 20, h: 20 } }] });
    expect(result.current.displayLabel(id)).toBe('Sunny *');
  });
});

describe('useCropsTabState — saveBox', () => {
  it('creates a new preset and links the box when unlinked', () => {
    const { result, onUpsert } = renderCropsTab();
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.saveBox(id));
    expect(onUpsert).toHaveBeenCalledTimes(1);
    const arg = onUpsert!.mock.calls[0][0] as CropPreset;
    expect(arg.title).toBe('Custom 1');
    expect(arg.geometry).toEqual({ x: 35, y: 35, w: 30, h: 30 });
    expect(result.current.boxes[0].presetId).toBe(arg.id); // box linked
  });

  it('updates the existing preset (same id) when linked', () => {
    const preset: CropPreset = { id: 'p1', title: 'Sunny', geometry: { x: 10, y: 10, w: 20, h: 20 } };
    const { result, onUpsert } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    act(() => result.current.saveBox(id));
    expect(onUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', title: 'Sunny' }),
    );
  });

  it('no-op when onUpsert is unwired (canSave false)', () => {
    const { result } = renderCropsTab({ wireUpsert: false });
    expect(result.current.canSave).toBe(false);
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.saveBox(id)); // must not throw
    expect(result.current.boxes[0].presetId).toBeNull();
  });
});

describe('useCropsTabState — renameBox (auto re-saves current version)', () => {
  it('rejects empty / whitespace title', () => {
    const { result, onUpsert } = renderCropsTab();
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.renameBox(id, '   '));
    expect(result.current.boxes[0].title).toBe('Custom 1');
    expect(onUpsert).not.toHaveBeenCalled();
  });

  it('persists the new title to a linked preset (current geometry)', () => {
    const preset: CropPreset = { id: 'p1', title: 'Sunny', geometry: { x: 10, y: 10, w: 20, h: 20 } };
    const { result, onUpsert } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    act(() => result.current.renameBox(id, 'Sunset'));
    expect(result.current.boxes[0].title).toBe('Sunset');
    expect(onUpsert).toHaveBeenCalledWith({
      id: 'p1',
      title: 'Sunset',
      geometry: { x: 10, y: 10, w: 20, h: 20 },
    });
  });

  it('creates + links a preset when renaming an unlinked Custom box', () => {
    const { result, onUpsert } = renderCropsTab();
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    expect(result.current.boxes[0].presetId).toBeNull();
    act(() => result.current.renameBox(id, 'Hero'));
    expect(onUpsert).toHaveBeenCalledTimes(1);
    const arg = onUpsert!.mock.calls[0][0] as CropPreset;
    expect(arg.title).toBe('Hero');
    expect(arg.geometry).toEqual({ x: 35, y: 35, w: 30, h: 30 });
    expect(result.current.boxes[0].presetId).toBe(arg.id); // box now linked
  });

  it('re-saves the box geometry (not the diverged preset) on rename', () => {
    // Box applied p1, then preset edited book-wide → box geometry diverges (dirty). Rename must
    // persist the BOX's current geometry, overwriting the diverged preset with the new title.
    const preset: CropPreset = { id: 'p1', title: 'Sunny', geometry: { x: 10, y: 10, w: 20, h: 20 } };
    const { result, rerender, onUpsert } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    rerender({ presets: [{ ...preset, geometry: { x: 50, y: 50, w: 20, h: 20 } }] });
    expect(result.current.displayLabel(id)).toBe('Sunny *'); // dirty
    act(() => result.current.renameBox(id, 'Sunset'));
    expect(onUpsert).toHaveBeenLastCalledWith({
      id: 'p1',
      title: 'Sunset',
      geometry: { x: 10, y: 10, w: 20, h: 20 }, // box geometry wins, not the {50,50} preset
    });
  });

  it('no persist when onUpsert is unwired — session label only', () => {
    const { result } = renderCropsTab({ wireUpsert: false });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.renameBox(id, 'Hero'));
    expect(result.current.boxes[0].title).toBe('Hero'); // local rename still applies
    expect(result.current.boxes[0].presetId).toBeNull(); // but nothing persisted/linked
  });
});

describe('useCropsTabState — delete preset (confirm flow)', () => {
  const preset: CropPreset = { id: 'p1', title: 'Sunny', geometry: { x: 10, y: 10, w: 20, h: 20 } };

  it('linked box → opens confirm (no delete yet)', () => {
    const { result, onDelete } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    act(() => result.current.deleteCropPreset(id));
    expect(result.current.confirmDeleteBoxId).toBe(id);
    expect(onDelete).not.toHaveBeenCalled();

    act(() => result.current.confirmDeletePreset());
    expect(onDelete).toHaveBeenCalledWith('p1');
    expect(onDelete).toHaveBeenCalledTimes(1); // side effects must not run inside a state-updater
    expect(result.current.boxes).toHaveLength(0);
    expect(result.current.confirmDeleteBoxId).toBeNull();
  });

  it('cancel keeps the preset + box', () => {
    const { result, onDelete } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.applyPreset(id, 'p1'));
    act(() => result.current.deleteCropPreset(id));
    act(() => result.current.cancelDeletePreset());
    expect(result.current.confirmDeleteBoxId).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    expect(result.current.boxes).toHaveLength(1);
  });

  it('unlinked box → removes box directly (no confirm)', () => {
    const { result, onDelete } = renderCropsTab({ cropPresets: [preset] });
    act(() => result.current.addBox());
    const id = result.current.boxes[0].id;
    act(() => result.current.deleteCropPreset(id));
    expect(result.current.confirmDeleteBoxId).toBeNull();
    expect(result.current.boxes).toHaveLength(0);
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('useCropsTabState — commitExtract', () => {
  it('crops valid boxes → ExtractResult[] with geometry + ratio, NO tag', async () => {
    mockCrop.mockResolvedValue({
      success: true,
      data: {
        croppedObjects: [
          { boxIndex: 0, base64: 'AAAA', mimeType: 'image/png', aspectRatio: '1:1', width: 10, height: 10 },
        ],
      },
      meta: {},
    } as never);
    const { result } = renderCropsTab();
    act(() => result.current.addBox());
    let out: Awaited<ReturnType<typeof result.current.commitExtract>> = [];
    await act(async () => {
      out = await result.current.commitExtract(SOURCE_URL);
    });
    expect(out).toHaveLength(1);
    expect(out[0].sourceTab).toBe('crop');
    expect(out[0].title).toBe('Scene - Custom 1');
    expect(out[0].meta?.geometry).toEqual({ x: 35, y: 35, w: 30, h: 30 });
    expect(out[0].meta?.ratio).toBe('1:1');
    expect(out[0].meta?.tag).toBeUndefined(); // frame-only — no tag
  });

  it('throws when all boxes are below the min size', async () => {
    const { result } = renderCropsTab();
    // No boxes at all → "all too small" guard.
    await expect(result.current.commitExtract(SOURCE_URL)).rejects.toThrow(/too small/i);
    expect(mockCrop).not.toHaveBeenCalled();
  });

  it('classifies a CONNECTION_ERROR batch failure as service unavailable', async () => {
    mockCrop.mockResolvedValue({
      success: false,
      error: 'connection refused',
      httpStatus: 0,
      errorCode: 'CONNECTION_ERROR',
    } as never);
    const { result } = renderCropsTab();
    act(() => result.current.addBox());
    await expect(result.current.commitExtract(SOURCE_URL)).rejects.toThrow(/service unavailable/i);
  });

  it('classifies a non-connection API failure as an image-service error', async () => {
    mockCrop.mockResolvedValue({
      success: false,
      error: 'bad request',
      httpStatus: 422,
      errorCode: 'VALIDATION_ERROR',
    } as never);
    const { result } = renderCropsTab();
    act(() => result.current.addBox());
    await expect(result.current.commitExtract(SOURCE_URL)).rejects.toThrow(/image service returned an error/i);
  });

  it('classifies all-upload-failures as a save error (API succeeded)', async () => {
    mockCrop.mockResolvedValue({
      success: true,
      data: {
        croppedObjects: [
          { boxIndex: 0, base64: 'AAAA', mimeType: 'image/png', aspectRatio: '1:1', width: 10, height: 10 },
        ],
      },
      meta: {},
    } as never);
    mockUpload.mockRejectedValue(new Error('storage 500')); // every upload throws
    const { result } = renderCropsTab();
    act(() => result.current.addBox());
    await expect(result.current.commitExtract(SOURCE_URL)).rejects.toThrow(/could not save the cropped images/i);
  });
});
