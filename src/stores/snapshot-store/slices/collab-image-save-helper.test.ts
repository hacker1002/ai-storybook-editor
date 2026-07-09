import { describe, it, expect, beforeEach, vi } from 'vitest';

// Isolate the resource-lock store: this unit test imports the helper DIRECTLY (bypassing
// snapshot-store/index), so the real module would close the slice ↔ store cycle. The fake store
// exposes only the seams the helper touches (acquire/save/release + registry/holderNames for the
// holder-name resolver). `keyOf`/`FALLBACK_HOLDER_NAME` mirror the real impl.
const h = vi.hoisted(() => {
  const acquire = vi.fn();
  const save = vi.fn();
  const release = vi.fn();
  const state = {
    acquire,
    save,
    release,
    bookId: 'book-1',
    registry: new Map<string, { holder_user_id: string }>(),
    holderNames: new Map<string, string>(),
  };
  return { acquire, save, release, state };
});

vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => h.state },
  keyOf: (bookId: string, t: { step: number; resource_type: number; resource_id: string; locale: string | null }) =>
    `${bookId}|${t.step}|${t.resource_type}|${t.resource_id}|${t.locale ?? ''}`,
  FALLBACK_HOLDER_NAME: 'another editor',
}));

import {
  saveImageResourceUnderLock,
  resolveImageLockTarget,
  resolveLockHolderName,
  ENTITY_TYPE_TO_RESOURCE_TYPE,
} from './collab-image-save-helper';

const NODE = { key: 'hero', variants: [] };

describe('collab-image-save-helper', () => {
  beforeEach(() => {
    h.acquire.mockReset();
    h.save.mockReset();
    h.release.mockReset();
    h.release.mockResolvedValue(undefined);
    h.state.registry.clear();
    h.state.holderNames.clear();
  });

  describe('resolveImageLockTarget', () => {
    it('entity kinds (char/prop/stage) lock the entity node → resource_id = entityKey', () => {
      expect(resolveImageLockTarget('character', 'hero', 'base')).toEqual({
        step: 2,
        resource_type: 3,
        resource_id: 'hero',
        locale: null,
      });
      expect(resolveImageLockTarget('prop', 'sword', 'v1').resource_type).toBe(4);
      expect(resolveImageLockTarget('stage', 'forest', 'v1').resource_type).toBe(5);
    });

    it('image kinds (scene/retouch) lock the leaf image → resource_id = childKey, rtype 1', () => {
      expect(resolveImageLockTarget('illustration_image', 'sp1', 'ri1')).toEqual({
        step: 2,
        resource_type: 1,
        resource_id: 'ri1',
        locale: null,
      });
      expect(resolveImageLockTarget('retouch_image', 'sp1', 'img1')).toEqual({
        step: 2,
        resource_type: 1,
        resource_id: 'img1',
        locale: null,
      });
    });

    it('mapping constant covers all 5 entity types', () => {
      expect(ENTITY_TYPE_TO_RESOURCE_TYPE).toEqual({
        character: 3,
        prop: 4,
        stage: 5,
        illustration_image: 1,
        retouch_image: 1,
      });
    });
  });

  describe('saveImageResourceUnderLock', () => {
    const target = resolveImageLockTarget('character', 'hero', 'base');

    it("saved: acquire ok + save ok → 'saved', releases the lock", async () => {
      h.acquire.mockResolvedValue({ ok: true });
      h.save.mockResolvedValue({ ok: true });

      const outcome = await saveImageResourceUnderLock(target, NODE, 5, { kind: 'character', entity: 'hero' });

      expect(outcome).toBe('saved');
      expect(h.acquire).toHaveBeenCalledWith(target);
      expect(h.save).toHaveBeenCalledTimes(1);
      const [, payload] = h.save.mock.calls[0];
      expect(payload).toMatchObject({ action_type: 5, patch: NODE, log: true, target_ref: { kind: 'character', entity: 'hero' } });
      expect(h.release).toHaveBeenCalledWith(target);
    });

    it("skipped: acquire 409 → 'skipped', save + release NOT called", async () => {
      h.acquire.mockResolvedValue({ ok: false, code: 'LOCK_HELD', holder: 'u2' });

      const outcome = await saveImageResourceUnderLock(target, NODE, 5);

      expect(outcome).toBe('skipped');
      expect(h.save).not.toHaveBeenCalled();
      expect(h.release).not.toHaveBeenCalled(); // no lock held → nothing to release
    });

    it("failed: acquire ok + save rejected (lost) → 'failed', still releases", async () => {
      h.acquire.mockResolvedValue({ ok: true });
      h.save.mockResolvedValue({ ok: false, lost: true, forbidden: false });

      const outcome = await saveImageResourceUnderLock(target, NODE, 3);

      expect(outcome).toBe('failed');
      expect(h.release).toHaveBeenCalledWith(target);
    });

    it("forbidden: acquire ok + save 403 (forbidden) → 'forbidden', still releases", async () => {
      h.acquire.mockResolvedValue({ ok: true });
      h.save.mockResolvedValue({ ok: false, lost: false, forbidden: true });

      const outcome = await saveImageResourceUnderLock(target, NODE, 3);

      expect(outcome).toBe('forbidden');
      expect(h.release).toHaveBeenCalledWith(target); // lock was held → always releases
    });

    it("failed: null patch (node deleted mid-flight) → 'failed', acquire NOT called", async () => {
      const outcome = await saveImageResourceUnderLock(target, null, 5);

      expect(outcome).toBe('failed');
      expect(h.acquire).not.toHaveBeenCalled();
    });

    it("failed: acquire throws → caught → 'failed' (never rejects)", async () => {
      h.acquire.mockRejectedValue(new Error('network'));

      await expect(saveImageResourceUnderLock(target, NODE, 5)).resolves.toBe('failed');
    });
  });

  describe('resolveLockHolderName', () => {
    const target = resolveImageLockTarget('character', 'hero', 'base');

    it('returns the resolved holder name from the registry', () => {
      h.state.registry.set('book-1|2|3|hero|', { holder_user_id: 'u2' });
      h.state.holderNames.set('u2', 'Alice');
      expect(resolveLockHolderName(target)).toBe('Alice');
    });

    it('falls back when the holder / name is unknown', () => {
      expect(resolveLockHolderName(target)).toBe('another editor');
    });
  });
});
