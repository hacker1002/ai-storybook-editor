import { describe, expect, it } from 'vitest';
import { parseStoragePathFromUrl } from '../audio-storage-path-parser';

describe('parseStoragePathFromUrl', () => {
  it('returns path for sounds-uploaded prefix', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/storybook-assets/sounds-uploaded/u/1.mp3';
    expect(parseStoragePathFromUrl(url, ['sounds-uploaded', 'sound-effects'])).toBe(
      'sounds-uploaded/u/1.mp3',
    );
  });

  it('returns path for musics prefix', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/storybook-assets/musics/abc.mp3';
    expect(parseStoragePathFromUrl(url, ['musics-uploaded', 'musics'])).toBe(
      'musics/abc.mp3',
    );
  });

  it('returns null when bucket pattern mismatches', () => {
    const url = 'https://cdn.example.com/foo.mp3';
    expect(parseStoragePathFromUrl(url, ['sounds-uploaded'])).toBeNull();
  });

  it('returns null when prefix mismatches (sounds path queried with musics prefix)', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/storybook-assets/sounds-uploaded/u/1.mp3';
    expect(parseStoragePathFromUrl(url, ['musics-uploaded', 'musics'])).toBeNull();
  });

  it('returns null on empty url', () => {
    expect(parseStoragePathFromUrl(null, ['sounds-uploaded'])).toBeNull();
    expect(parseStoragePathFromUrl(undefined, ['sounds-uploaded'])).toBeNull();
    expect(parseStoragePathFromUrl('', ['sounds-uploaded'])).toBeNull();
  });

  it('returns null on invalid URL', () => {
    expect(parseStoragePathFromUrl('not-a-url', ['sounds-uploaded'])).toBeNull();
  });

  it('decodes URL-encoded characters', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/storybook-assets/sounds-uploaded/u/forest%20wind.mp3';
    expect(parseStoragePathFromUrl(url, ['sounds-uploaded'])).toBe(
      'sounds-uploaded/u/forest wind.mp3',
    );
  });

  it('empty prefixes array allows any path under bucket', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/storybook-assets/anything/x.mp3';
    expect(parseStoragePathFromUrl(url, [])).toBe('anything/x.mp3');
  });
});
