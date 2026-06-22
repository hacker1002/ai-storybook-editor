// edit-image-modal-utils.test.ts — Unit tests for the EditImageModal pure helpers
// (prependVersion / mapEditError / versionFromMediaUrl). Canvas + pointer logic is
// manual-smoke only (jsdom has no real 2d context).

import { describe, it, expect } from 'vitest';
import type { Illustration } from '@/types/prop-types';
import {
  EditApiError,
  prependVersion,
  versionFromMediaUrl,
  mapEditError,
} from './edit-image-modal-utils';

const baseVersions: Illustration[] = [
  { media_url: 'https://cdn/a.png', created_time: '2026-01-01T00:00:00.000Z', is_selected: true, type: 'created' },
  { media_url: 'https://cdn/b.png', created_time: '2026-01-02T00:00:00.000Z', is_selected: false, type: 'created' },
];

describe('prependVersion', () => {
  it('prepends a selected type=edited entry carrying original_url', () => {
    const next = prependVersion(baseVersions, 'https://cdn/new.png', 'https://cdn/a.png');
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({
      type: 'edited',
      media_url: 'https://cdn/new.png',
      original_url: 'https://cdn/a.png',
      is_selected: true,
    });
    expect(typeof next[0].created_time).toBe('string');
  });

  it('deselects every prior version', () => {
    const next = prependVersion(baseVersions, 'https://cdn/new.png', 'https://cdn/a.png');
    expect(next.slice(1).every((v) => v.is_selected === false)).toBe(true);
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.parse(JSON.stringify(baseVersions));
    prependVersion(baseVersions, 'https://cdn/new.png', 'https://cdn/a.png');
    expect(baseVersions).toEqual(snapshot);
  });

  it('produces the first real version from an empty array (base kept as original_url)', () => {
    const next = prependVersion([], 'https://cdn/new.png', 'https://cdn/sketch.png');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      type: 'edited',
      original_url: 'https://cdn/sketch.png',
      is_selected: true,
    });
  });
});

describe('versionFromMediaUrl', () => {
  it('builds a selected type=created display fallback', () => {
    const v = versionFromMediaUrl('https://cdn/sketch.png');
    expect(v).toMatchObject({ media_url: 'https://cdn/sketch.png', is_selected: true, type: 'created' });
    expect(v.original_url).toBeUndefined();
  });
});

describe('mapEditError', () => {
  const cases: Array<[string, string]> = [
    ['UNSUPPORTED_MODEL', 'Model không hỗ trợ.'],
    ['IMAGE_FETCH_ERROR', 'Không tải được ảnh nguồn.'],
    ['REPLICATE_RATE_LIMIT', 'Đang quá tải, thử lại sau ít giây.'],
    ['REPLICATE_ERROR', 'Remove background thất bại, vui lòng thử lại.'],
    ['TIMEOUT', 'Remove background thất bại, vui lòng thử lại.'],
    ['SSRF_BLOCKED', 'URL ảnh không hợp lệ.'],
    ['CONNECTION_ERROR', 'Mất kết nối tới máy chủ — vui lòng thử lại.'],
  ];
  it.each(cases)('maps EditApiError code %s', (code, message) => {
    expect(mapEditError(new EditApiError('raw', { errorCode: code }))).toBe(message);
  });

  it('maps a CORS-tainted Error to the CORS message', () => {
    expect(mapEditError(new Error('Canvas export failed — canvas may be tainted by CORS'))).toMatch(/CORS/);
  });

  it('falls back to a plain Error message', () => {
    expect(mapEditError(new Error('boom'))).toBe('boom');
  });

  it('falls back to a generic message for unknown values', () => {
    expect(mapEditError(undefined)).toBe('Đã có lỗi xảy ra, vui lòng thử lại.');
    expect(mapEditError(new EditApiError('x', { errorCode: 'WAT' }))).toBe('x');
  });
});
