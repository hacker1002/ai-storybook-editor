// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { appendMediaVersions } from './append-media-versions';
import type { Illustration } from '@/types/prop-types';

const ill = (media_url: string, is_selected: boolean): Illustration => ({
  media_url,
  created_time: '2026-01-01T00:00:00.000Z',
  is_selected,
});

describe('appendMediaVersions', () => {
  it('returns the existing list unchanged when no urls are given', () => {
    const existing = [ill('a', true)];
    expect(appendMediaVersions(existing, [])).toBe(existing);
  });

  it('prepends one url as the selected head and deselects prior versions', () => {
    const existing = [ill('a', true), ill('b', false)];
    const out = appendMediaVersions(existing, ['new']);
    expect(out.map((i) => i.media_url)).toEqual(['new', 'a', 'b']);
    expect(out.map((i) => i.is_selected)).toEqual([true, false, false]);
  });

  it('with multiple urls, only urls[0] is the selected head', () => {
    const out = appendMediaVersions([ill('a', true)], ['x', 'y']);
    expect(out.map((i) => i.media_url)).toEqual(['x', 'y', 'a']);
    expect(out.map((i) => i.is_selected)).toEqual([true, false, false]);
  });

  it('appends onto an empty list', () => {
    const out = appendMediaVersions([], ['only']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ media_url: 'only', is_selected: true });
  });
});
