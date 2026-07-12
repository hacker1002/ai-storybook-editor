// build-raw-textboxes.test.ts — pure-logic tests for the Texts-tab spawn builder:
// approximate text-based sizing (width ∝ char count, height ∝ line count) + anchor from the
// source footprint, book-default typography (Validation S1 — no font heuristic), title collapse,
// langCode key, editor-only visibility. No React / no store.

import { describe, it, expect, vi } from 'vitest';
import { buildRawTextboxes, estimateTextboxGeometry, type CanvasPx } from './build-raw-textboxes';
import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import type { SpreadImage, SpreadTextbox, SpreadTextboxContent } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';
import type { ExtractedTextbox } from '@/features/editor/components/shared-components';

const CANVAS: CanvasPx = { width: 1000, height: 700 };
const srcImage = (geometry: SpreadImage['geometry']): SpreadImage => ({ geometry }) as SpreadImage;
const content = (tb: SpreadTextbox, lang: string) => tb[lang] as SpreadTextboxContent;

describe('estimateTextboxGeometry', () => {
  it('sizes width from the longest-line char count (wider text → wider box)', () => {
    const short = estimateTextboxGeometry('Hi', 18, 1.5, CANVAS, 0, 0);
    const long = estimateTextboxGeometry('Hello there friend', 18, 1.5, CANVAS, 0, 0);
    expect(long.w).toBeGreaterThan(short.w);
    // "Hello there friend" = 18 chars → 18*18*0.6 + 18 = ~212px → ~21.2%.
    expect(long.w).toBeCloseTo(21.24, 1);
  });

  it('sizes height from the line count (more lines → taller box)', () => {
    const one = estimateTextboxGeometry('a', 18, 1.5, CANVAS, 0, 0);
    const three = estimateTextboxGeometry('a\nb\nc', 18, 1.5, CANVAS, 0, 0);
    expect(three.h).toBeGreaterThan(one.h);
    // 3 lines: 3*18*1.5 + 9 = 90px → 90/700 ≈ 12.86%.
    expect(three.h).toBeCloseTo(12.857, 1);
  });

  it('gives a one-line detection a usable (non-tiny) height', () => {
    // Regression: the old box-height mapping produced ~1%; one line must be clearly bigger.
    const g = estimateTextboxGeometry('A short caption', 18, 1.5, CANVAS, 0, 0);
    expect(g.h).toBeGreaterThan(4); // 36px/700 ≈ 5.1%
  });

  it('scales with font size (bigger font → bigger box)', () => {
    const small = estimateTextboxGeometry('Hello', 12, 1.5, CANVAS, 0, 0);
    const big = estimateTextboxGeometry('Hello', 36, 1.5, CANVAS, 0, 0);
    expect(big.w).toBeGreaterThan(small.w);
    expect(big.h).toBeGreaterThan(small.h);
  });

  it('caps width to the spread and clamps the anchor so the box stays on-page', () => {
    const g = estimateTextboxGeometry('X'.repeat(500), 18, 1.5, CANVAS, 95, 90);
    expect(g.w).toBeLessThanOrEqual(98); // maxWidthPct
    expect(g.x + g.w).toBeLessThanOrEqual(100 + 1e-6);
    expect(g.y + g.h).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('enforces minimum width/height floors and rotation 0', () => {
    const g = estimateTextboxGeometry('.', 18, 1.5, { width: 4000, height: 8000 }, 0, 0);
    expect(g.w).toBeGreaterThanOrEqual(3);
    expect(g.h).toBeGreaterThanOrEqual(2.5);
    expect(g.rotation).toBe(0);
  });

  it('falls back to sane defaults when the canvas is not hydrated (no Infinity)', () => {
    const g = estimateTextboxGeometry('Hello', 18, 1.5, { width: 0, height: 0 }, 0, 0);
    expect(Number.isFinite(g.w)).toBe(true);
    expect(Number.isFinite(g.h)).toBe(true);
    expect(g.w).toBeGreaterThan(0);
    expect(g.h).toBeGreaterThan(0);
  });
});

describe('buildRawTextboxes', () => {
  it('anchors the box at the OCR position mapped into the source footprint', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'Hi', geometry: { x: 0, y: 0, w: 100, h: 100 } }];
    // source occupies x:10 y:20 w:50 h:40 of the spread → anchor at (10,20).
    buildRawTextboxes(specs, srcImage({ x: 10, y: 20, w: 50, h: 40 }), 'sp1', 'en', CANVAS, add);

    expect(add).toHaveBeenCalledTimes(1);
    const [spreadId, tb] = add.mock.calls[0];
    expect(spreadId).toBe('sp1');
    const g = content(tb, 'en').geometry;
    expect(g.x).toBeCloseTo(10, 5);
    expect(g.y).toBeCloseTo(20, 5);
    expect(g.rotation).toBe(0);
    // size is text-derived (NOT the raw OCR box) — one short line stays small but usable.
    expect(g.h).toBeGreaterThan(4);
  });

  it('uses the book typography default (incl. size) when no book typography given', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'Hello', geometry: { x: 0, y: 0, w: 10, h: 10 } }];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', CANVAS, add);

    const typo = content(add.mock.calls[0][1], 'en').typography;
    expect(typo.size).toBe(DEFAULT_TYPOGRAPHY.size); // 18 — NOT inferred from box height
    expect(typo.family).toBe(DEFAULT_TYPOGRAPHY.family);
  });

  it('prefers the per-language book typography when provided (affects size)', () => {
    const add = vi.fn();
    const bookTypo: Record<string, TypographySettings> = {
      en: { ...DEFAULT_TYPOGRAPHY, size: 36, family: 'Merriweather' },
    };
    const specs: ExtractedTextbox[] = [{ content: 'Hello', geometry: { x: 0, y: 0, w: 10, h: 10 } }];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', CANVAS, add, bookTypo);

    const c = content(add.mock.calls[0][1], 'en');
    expect(c.typography.size).toBe(36);
    expect(c.typography.family).toBe('Merriweather');
    // larger font → larger box than the size-18 default for the same text.
    const addDefault = vi.fn();
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', CANVAS, addDefault);
    expect(c.geometry.h).toBeGreaterThan(content(addDefault.mock.calls[0][1], 'en').geometry.h);
  });

  it('truncates the title to 24 chars, falls back to "Text" when blank', () => {
    const add = vi.fn();
    const long = 'A'.repeat(40);
    const specs: ExtractedTextbox[] = [
      { content: long, geometry: { x: 0, y: 0, w: 10, h: 10 } },
      { content: '   ', geometry: { x: 0, y: 0, w: 10, h: 10 } },
    ];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', CANVAS, add);

    expect(add.mock.calls[0][1].title).toBe('A'.repeat(24));
    expect(add.mock.calls[1][1].title).toBe('Text');
    // full content is preserved on the language block (only the title is truncated).
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
      CANVAS,
      add,
    );
    expect(add.mock.calls[0][1].title).toBe('Once upon a time'); // no newline
    expect(content(add.mock.calls[0][1], 'en').text).toBe(multi); // block keeps the \n
  });

  it('keys content under the current language and marks it editor-only', () => {
    const add = vi.fn();
    const specs: ExtractedTextbox[] = [{ content: 'Xin chào', geometry: { x: 0, y: 0, w: 10, h: 10 } }];
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'vi', CANVAS, add);

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
    buildRawTextboxes(specs, srcImage({ x: 0, y: 0, w: 100, h: 100 }), 'sp1', 'en', CANVAS, add);
    expect(add).toHaveBeenCalledTimes(3);
  });
});
