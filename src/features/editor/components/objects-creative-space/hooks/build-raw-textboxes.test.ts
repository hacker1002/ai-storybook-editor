// build-raw-textboxes.test.ts — pure-logic tests for the Texts-tab spawn builder:
// geometry compose + clamp (99/100), book-default typography (Validation S1 — no font heuristic),
// title truncate, langCode key, editor-only visibility. No React / no store.

import { describe, it, expect, vi } from 'vitest';
import { buildRawTextboxes } from './build-raw-textboxes';
import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import type { SpreadImage, SpreadTextbox, SpreadTextboxContent } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';
import type { ExtractedTextbox } from '@/features/editor/components/shared-components';

const srcImage = (geometry: SpreadImage['geometry']): SpreadImage => ({ geometry }) as SpreadImage;

const content = (tb: SpreadTextbox, lang: string) => tb[lang] as SpreadTextboxContent;

describe('buildRawTextboxes', () => {
  it('composes box % into the source footprint (spread-relative)', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'Hi', geometry: { x: 0, y: 0, w: 100, h: 100 } }];
    // source occupies x:10 y:20 w:50 h:40 of the spread.
    buildRawTextboxes(specs, srcImage({ x: 10, y: 20, w: 50, h: 40 }), 'sp1', 'en', add);

    expect(add).toHaveBeenCalledTimes(1);
    const [spreadId, tb] = add.mock.calls[0];
    expect(spreadId).toBe('sp1');
    expect(content(tb, 'en').geometry).toEqual({ x: 10, y: 20, w: 50, h: 40, rotation: 0 });
  });

  it('clamps composed geometry to 99 (x/y) and 100 (w/h)', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'X', geometry: { x: 50, y: 50, w: 100, h: 100 } }];
    // orig near the bottom-right corner → x/y would exceed the page, must clamp.
    buildRawTextboxes(specs, srcImage({ x: 90, y: 90, w: 100, h: 100 }), 'sp1', 'en', add);

    const g = content(add.mock.calls[0][1], 'en').geometry;
    expect(g.x).toBe(99);
    expect(g.y).toBe(99);
    expect(g.w).toBe(100);
    expect(g.h).toBe(100);
  });

  it('uses the book typography default (incl. size) when no book typography given', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'Hello', geometry: { x: 0, y: 0, w: 10, h: 10 } }];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', add);

    const typo = content(add.mock.calls[0][1], 'en').typography;
    expect(typo.size).toBe(DEFAULT_TYPOGRAPHY.size); // 18 — NOT inferred from box height
    expect(typo.family).toBe(DEFAULT_TYPOGRAPHY.family);
  });

  it('prefers the per-language book typography when provided', () => {
    const add = vi.fn();
    const bookTypo: Record<string, TypographySettings> = {
      en: { ...DEFAULT_TYPOGRAPHY, size: 32, family: 'Merriweather' },
    };
    const specs: ExtractedTextbox[] = [{ content: 'Hello', geometry: { x: 0, y: 0, w: 10, h: 10 } }];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', add, bookTypo);

    const typo = content(add.mock.calls[0][1], 'en').typography;
    expect(typo.size).toBe(32);
    expect(typo.family).toBe('Merriweather');
  });

  it('truncates the title to 24 chars, falls back to "Text" when blank', () => {
    const add = vi.fn();
    const long = 'A'.repeat(40);
    const specs: ExtractedTextbox[] = [
      { content: long, geometry: { x: 0, y: 0, w: 10, h: 10 } },
      { content: '   ', geometry: { x: 0, y: 0, w: 10, h: 10 } },
    ];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', add);

    expect(add.mock.calls[0][1].title).toBe('A'.repeat(24));
    expect(add.mock.calls[0][1].title.length).toBe(24);
    expect(add.mock.calls[1][1].title).toBe('Text');
    // full content is still preserved on the language block (only the title is truncated).
    expect(content(add.mock.calls[0][1], 'en').text).toBe(long);
  });

  it('collapses multi-line OCR content into a single-line title (content preserved)', () => {
    const add = vi.fn();
    const multi = 'Once upon\na time';
    buildRawTextboxes(
      [{ content: multi, geometry: { x: 0, y: 0, w: 10, h: 10 } }],
      srcImage({ x: 0, y: 0, w: 100, h: 100 }),
      'sp1',
      'en',
      add,
    );
    expect(add.mock.calls[0][1].title).toBe('Once upon a time'); // no newline
    expect(content(add.mock.calls[0][1], 'en').text).toBe(multi); // block keeps the \n
  });

  it('keys content under the current language and marks it editor-only', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'Xin chào', geometry: { x: 0, y: 0, w: 10, h: 10 } }];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'vi', add);

    const tb = add.mock.calls[0][1] as SpreadTextbox;
    expect(content(tb, 'vi').text).toBe('Xin chào');
    expect(tb.player_visible).toBe(false);
    expect(tb.editor_visible).toBe(true);
    expect(typeof tb.id).toBe('string');
  });

  it('spawns one textbox per spec', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [
      { content: 'a', geometry: { x: 0, y: 0, w: 5, h: 5 } },
      { content: 'b', geometry: { x: 10, y: 10, w: 5, h: 5 } },
      { content: 'c', geometry: { x: 20, y: 20, w: 5, h: 5 } },
    ];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', add);
    expect(add).toHaveBeenCalledTimes(3);
  });
});
