import { describe, expect, it } from 'vitest';
import { parseHeightCm } from './parse-height-cm';

describe('parseHeightCm', () => {
  it.each([
    // [input, expected, why]
    ['110', 110, 'plain number → cm'],
    ['110cm', 110, 'cm unit → as-is'],
    ['110 cm', 110, 'cm unit with space'],
    ['1.1m', 110, 'metre → ×100'],
    ['1,1m', 110, 'vi-VN comma decimal → ×100'],
    ['1.1 m', 110, 'metre with space'],
    ['cao 1.5m', 150, 'decimal counts as ONE number (not a range)'],
    ['20-30cm', 30, 'range → max'],
    ['20 - 30 cm', 30, 'spaced range → max'],
    ['0.55 m (bộ giáp, bé 1.05 m)', 55, 'parenthesised context stripped before extraction'],
    ['dài khoảng 40cm', 40, 'surrounding prose ignored'],
  ])('%s → %s (%s)', (input, expected) => {
    expect(parseHeightCm(input)).toBe(expected);
  });

  it.each([
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['abc', 'no number'],
    ['(1.05 m)', 'ONLY parenthesised context → nothing measurable left'],
  ])('%s → null (%s)', (input) => {
    expect(parseHeightCm(input)).toBeNull();
  });

  describe('already-number input (read-time migrate idempotency)', () => {
    it('keeps a valid number unchanged', () => {
      expect(parseHeightCm(110)).toBe(110);
    });

    it('is idempotent — re-parsing a stored number does not drift', () => {
      const once = parseHeightCm('1.1m');
      expect(parseHeightCm(once)).toBe(once);
    });

    it('rounds a fractional number', () => {
      expect(parseHeightCm(110.4)).toBe(110);
      expect(parseHeightCm(110.6)).toBe(111);
    });

    it('0 → null', () => {
      expect(parseHeightCm(0)).toBeNull();
    });

    it('negative → null', () => {
      expect(parseHeightCm(-5)).toBeNull();
    });

    it('NaN / Infinity → null', () => {
      expect(parseHeightCm(NaN)).toBeNull();
      expect(parseHeightCm(Infinity)).toBeNull();
    });
  });

  describe('clamp [1, 5000]', () => {
    it('clamps above the max', () => {
      expect(parseHeightCm('99999cm')).toBe(5000);
      expect(parseHeightCm('60m')).toBe(5000);
    });

    it('clamps a sub-1 measurement up to the min (never to 0)', () => {
      expect(parseHeightCm('0.4cm')).toBe(1);
    });
  });

  // The unit must bind to its OWN number, not to any `m` anywhere in the string. A whole-string
  // /(?<!c)m/ test read the `m` of ordinary vi-VN prose as metres → ×100 → clamped to a silent
  // 5000. No backfill exists, so coerceVariant re-inflicts this on every read of a legacy row.
  describe('stray `m` in surrounding prose is NOT the metre unit', () => {
    const cases: Array<[string, number]> = [
      ['cao 120cm khi mở rộng', 120],
      ['110cm mỗi bên', 110],
      ['20-30cm tùy mẫu', 30],
      ['110 mỗi bên', 110], // no unit at all: the `m` of "mỗi" must not bind
      ['cao 1.5m khi mở rộng', 150], // a REAL metre unit still works amid the same prose
      ['1.5 mét', 150],
    ];
    it.each(cases)('%s → %i', (input, expected) => {
      expect(parseHeightCm(input)).toBe(expected);
    });
  });

  describe('non-string, non-number input', () => {
    // Explicit tuple type: a heterogeneous inline table makes it.each infer a per-row union
    // and reject the single-arg callback.
    const cases: Array<[unknown, string]> = [
      [null, 'null'],
      [undefined, 'undefined'],
      [{}, 'object'],
      [[], 'array'],
      [true, 'boolean'],
    ];
    it.each(cases)('%s → null (%s)', (input) => {
      expect(parseHeightCm(input)).toBeNull();
    });
  });
});
