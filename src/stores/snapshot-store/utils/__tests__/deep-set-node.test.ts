import { describe, it, expect } from 'vitest';
import { isNumericKey, setNodeAtPath, getNodeAtPath } from '../deep-set-node';

// Pure-function coverage for the collab content-sync path-walk helpers.
// These run on PLAIN objects/arrays (no immer) — the store-level immer behaviour
// (no-dirty / sibling-untouched / reconcile) is covered in apply-remote-node-patch.test.ts.

describe('isNumericKey', () => {
  it('true for digit runs, false otherwise', () => {
    expect(isNumericKey('0')).toBe(true);
    expect(isNumericKey('12')).toBe(true);
    expect(isNumericKey('spreads')).toBe(false);
    expect(isNumericKey('')).toBe(false);
    expect(isNumericKey('1a')).toBe(false);
    expect(isNumericKey('-1')).toBe(false);
  });
});

describe('setNodeAtPath — set', () => {
  it('sets an object-key path (sketch.spreads[3].images[2])', () => {
    const root: { spreads: Array<{ images: Array<{ id: string }> }> } = {
      spreads: [
        { images: [] },
        { images: [] },
        { images: [] },
        { images: [{ id: 'a' }, { id: 'b' }, { id: 'c-old' }] },
      ],
    };
    const res = setNodeAtPath(root, ['spreads', '3', 'images', '2'], { id: 'c-new' });
    expect(res).toEqual({ ok: true });
    expect(root.spreads[3].images[2]).toEqual({ id: 'c-new' });
    // Siblings within the same array untouched.
    expect(root.spreads[3].images[0]).toEqual({ id: 'a' });
    expect(root.spreads[3].images[1]).toEqual({ id: 'b' });
  });

  it('sets a bare-array path (characters[1].variants[0])', () => {
    const root = [
      { key: 'c0', variants: [{ key: 'v' }] },
      { key: 'c1', variants: [{ key: 'v-old' }] },
    ];
    const res = setNodeAtPath(root, ['1', 'variants', '0'], { key: 'v-new' });
    expect(res).toEqual({ ok: true });
    expect(root[1].variants[0]).toEqual({ key: 'v-new' });
    // Sibling entity untouched.
    expect(root[0]).toEqual({ key: 'c0', variants: [{ key: 'v' }] });
  });
});

describe('setNodeAtPath — remove', () => {
  it('removes an array index (parent array shrinks)', () => {
    const root = { spreads: [{ id: 's0' }, { id: 's1' }, { id: 's2' }] };
    const res = setNodeAtPath(root, ['spreads', '1'], null);
    expect(res).toEqual({ ok: true, removed: true });
    expect(root.spreads).toEqual([{ id: 's0' }, { id: 's2' }]);
  });

  it('removes an object key (textbox locale) without shrinking siblings', () => {
    const root = { textbox: { en: { text: 'hi' }, vi: { text: 'chao' } } };
    const res = setNodeAtPath(root, ['textbox', 'vi'], undefined);
    expect(res).toEqual({ ok: true, removed: true });
    expect(root.textbox).toEqual({ en: { text: 'hi' } });
    expect('vi' in root.textbox).toBe(false);
  });
});

describe('setNodeAtPath — no-op guards', () => {
  it('missing-intermediate → no-op, no path created', () => {
    const root = { spreads: [{ id: 's0' }] };
    const snapshot = JSON.stringify(root);
    const res = setNodeAtPath(root, ['spreads', '5', 'images', '0'], { id: 'x' });
    expect(res).toEqual({ ok: false, reason: 'missing-intermediate' });
    expect(JSON.stringify(root)).toBe(snapshot); // untouched
  });

  it('empty-path → no-op (guards whole-column clobber)', () => {
    const root = { a: 1 };
    const res = setNodeAtPath(root, [], { b: 2 });
    expect(res).toEqual({ ok: false, reason: 'empty-path' });
    expect(root).toEqual({ a: 1 });
  });

  it('null root + non-empty path → missing-intermediate', () => {
    expect(setNodeAtPath(null, ['a'], 1)).toEqual({ ok: false, reason: 'missing-intermediate' });
  });
});

describe('getNodeAtPath', () => {
  it('returns the node at the path', () => {
    const root = { spreads: [{ id: 's0' }, { id: 's1', images: [{ id: 'img' }] }] };
    expect(getNodeAtPath(root, ['spreads', '1', 'images', '0'])).toEqual({ id: 'img' });
    expect(getNodeAtPath(root, ['spreads'])).toBe(root.spreads);
  });

  it('returns undefined for an absent segment', () => {
    const root = { spreads: [{ id: 's0' }] };
    expect(getNodeAtPath(root, ['spreads', '9'])).toBeUndefined();
    expect(getNodeAtPath(root, ['missing', 'deep'])).toBeUndefined();
  });

  it('returns root for an empty path', () => {
    const root = { a: 1 };
    expect(getNodeAtPath(root, [])).toBe(root);
  });
});
