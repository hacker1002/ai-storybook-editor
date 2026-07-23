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
  it('returns the existing list unchanged when no entries are given', () => {
    const existing = [ill('a', true)];
    expect(appendMediaVersions(existing, [])).toBe(existing);
  });

  it('prepends one entry as the selected head and deselects prior versions', () => {
    const existing = [ill('a', true), ill('b', false)];
    const out = appendMediaVersions(existing, [{ media_url: 'new' }]);
    expect(out.map((i) => i.media_url)).toEqual(['new', 'a', 'b']);
    expect(out.map((i) => i.is_selected)).toEqual([true, false, false]);
  });

  it('with multiple entries, only entries[0] is the selected head', () => {
    const out = appendMediaVersions([ill('a', true)], [{ media_url: 'x' }, { media_url: 'y' }]);
    expect(out.map((i) => i.media_url)).toEqual(['x', 'y', 'a']);
    expect(out.map((i) => i.is_selected)).toEqual([true, false, false]);
  });

  it('appends onto an empty list', () => {
    const out = appendMediaVersions([], [{ media_url: 'only' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ media_url: 'only', is_selected: true });
  });

  it('carries ai_request_id onto the added entry when present (omitted otherwise)', () => {
    const out = appendMediaVersions([], [{ media_url: 'ai', ai_request_id: 'req-1' }, { media_url: 'plain' }]);
    expect(out[0]).toMatchObject({ media_url: 'ai', ai_request_id: 'req-1' });
    expect(out[1].ai_request_id).toBeUndefined();
  });
});
