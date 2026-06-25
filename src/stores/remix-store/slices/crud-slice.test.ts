// crud-slice.test.ts — Unit tests for `updateRemixSpreadImage` (granular image-layer patch
// + optimistic local merge + ONE Supabase UPDATE of the `illustration` column + rollback).
//
// The slice factory is driven with controlled `set`/`get` over an in-memory `{ remixes,
// refetchRemix }` state; `@/apis/supabase` is mocked so the update chain is observable.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StateCreator } from 'zustand';

// ── Supabase mock (hoisted before the slice import) ─────────────────────────────
type UpdatePayload = { illustration: { spreads: { images: { media_url?: string }[] }[] } };

const { eqMock, updateMock, fromMock } = vi.hoisted(() => {
  const eqMock = vi.fn(async () => ({ error: null as { message: string } | null }));
  const updateMock = vi.fn((_payload: UpdatePayload) => ({ eq: eqMock }));
  const fromMock = vi.fn((_table: string) => ({ update: updateMock }));
  return { eqMock, updateMock, fromMock };
});

vi.mock('@/apis/supabase', () => ({ supabase: { from: fromMock } }));

import { createCrudSlice } from './crud-slice';
import type { Remix } from '@/types/remix';
import type { RemixStore } from '../types';

// ── Fixtures ────────────────────────────────────────────────────────────────────

function makeRemix(): Remix {
  return {
    id: 'remix-1',
    illustration: {
      spreads: [
        {
          id: 'spread-1',
          images: [
            { id: 'img-1', media_url: 'a.png', geometry: { x: 0, y: 0, w: 40, h: 40 }, illustrations: [] },
            { id: 'img-2', media_url: 'c.png', geometry: { x: 0, y: 0, w: 40, h: 40 }, illustrations: [] },
          ],
        },
        { id: 'spread-2', images: [] },
      ],
      sections: [],
    },
  } as unknown as Remix;
}

/** Build the slice over a controlled in-memory state. `get()` returns the live state object
 *  (incl. a mock `refetchRemix`); `set()` applies the functional/partial update in place. */
function setup(remixes: Remix[]) {
  const refetchRemix = vi.fn(async () => {});
  let state = { remixes, refetchRemix } as unknown as RemixStore;
  const get = vi.fn(() => state);
  const set = vi.fn((updater: unknown) => {
    const partial = typeof updater === 'function' ? (updater as (s: RemixStore) => Partial<RemixStore>)(state) : updater;
    state = { ...state, ...(partial as Partial<RemixStore>) };
  });
  const slice = (createCrudSlice as unknown as StateCreator<RemixStore, [], [], RemixStore>)(
    set as never,
    get as never,
    {} as never,
  );
  return { slice, get, set, refetchRemix, current: () => state };
}

const firstImage = (s: RemixStore) => s.remixes[0].illustration.spreads[0].images[0];

beforeEach(() => {
  fromMock.mockClear();
  updateMock.mockClear();
  eqMock.mockClear();
  eqMock.mockResolvedValue({ error: null });
});

describe('updateRemixSpreadImage', () => {
  it('merges the patch into the matched layer + persists the full illustration column', async () => {
    const { slice, current } = setup([makeRemix()]);

    await slice.updateRemixSpreadImage('remix-1', 'spread-1', 'img-1', {
      media_url: 'b.png',
      illustrations: [{ media_url: 'b.png', is_selected: true } as never],
    });

    // Optimistic local merge (only the targeted layer changed).
    expect(firstImage(current()).media_url).toBe('b.png');
    expect(firstImage(current()).illustrations).toHaveLength(1);
    // Sibling layer untouched.
    expect(current().remixes[0].illustration.spreads[0].images[1].media_url).toBe('c.png');

    // ONE UPDATE of the illustration column with the merged blob, scoped by remix id.
    expect(fromMock).toHaveBeenCalledWith('remixes');
    const payload = updateMock.mock.calls[0][0];
    expect(payload.illustration.spreads[0].images[0].media_url).toBe('b.png');
    expect(eqMock).toHaveBeenCalledWith('id', 'remix-1');
  });

  it('rolls back via refetchRemix + throws on persist failure', async () => {
    eqMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const { slice, refetchRemix } = setup([makeRemix()]);

    await expect(
      slice.updateRemixSpreadImage('remix-1', 'spread-1', 'img-1', { media_url: 'b.png' }),
    ).rejects.toThrow('boom');
    expect(refetchRemix).toHaveBeenCalledWith('remix-1');
  });

  it('throws REMIX_NOT_FOUND without touching Supabase', async () => {
    const { slice } = setup([makeRemix()]);
    await expect(
      slice.updateRemixSpreadImage('nope', 'spread-1', 'img-1', { media_url: 'b.png' }),
    ).rejects.toThrow('REMIX_NOT_FOUND');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws SPREAD_NOT_FOUND without touching Supabase', async () => {
    const { slice } = setup([makeRemix()]);
    await expect(
      slice.updateRemixSpreadImage('remix-1', 'nope', 'img-1', { media_url: 'b.png' }),
    ).rejects.toThrow('SPREAD_NOT_FOUND');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws IMAGE_NOT_FOUND without touching Supabase', async () => {
    const { slice } = setup([makeRemix()]);
    await expect(
      slice.updateRemixSpreadImage('remix-1', 'spread-1', 'nope', { media_url: 'b.png' }),
    ).rejects.toThrow('IMAGE_NOT_FOUND');
    expect(fromMock).not.toHaveBeenCalled();
  });
});
