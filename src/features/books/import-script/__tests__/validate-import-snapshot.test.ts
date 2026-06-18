import { describe, it, expect } from 'vitest';
import { validateImportSnapshot } from '../validate-import-snapshot';
import {
  buildFixtureParsed,
  buildFixtureSnapshot,
  MODAL_META,
} from './fixtures/visual-manuscript-fixture';

describe('validateImportSnapshot — happy path', () => {
  it('the §8 fixture is fully valid (no errors, no warnings)', () => {
    const res = validateImportSnapshot(buildFixtureSnapshot(), buildFixtureParsed(), MODAL_META);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
  });
});

describe('validateImportSnapshot — error cases (collect-all)', () => {
  it('dangling stage_variant → error', () => {
    const snap = buildFixtureSnapshot();
    snap.illustration.spreads[0].raw_images![0].stage_variant = '@ghost/none';
    const res = validateImportSnapshot(snap, buildFixtureParsed(), MODAL_META);
    expect(res.errors.some((e) => /stage_variant.*@ghost\/none/.test(e))).toBe(true);
  });

  it('choice.to pointing at a missing node → error', () => {
    const parsed = buildFixtureParsed();
    const choice = parsed.edges.find((e) => e.type === 'choice')!;
    choice.to = 'missing_node';
    const res = validateImportSnapshot(buildFixtureSnapshot(), parsed, MODAL_META);
    expect(res.errors.some((e) => /missing_node/.test(e))).toBe(true);
  });

  it('Flow node without a Storyboard cell → error', () => {
    const parsed = buildFixtureParsed();
    parsed.cells = parsed.cells.filter((c) => !(c.lane === 'truc_chinh' && c.spread_number === 5));
    const res = validateImportSnapshot(buildFixtureSnapshot(), parsed, MODAL_META);
    expect(res.errors.some((e) => /thiếu nội dung trong Storyboard/.test(e))).toBe(true);
  });

  it('two base variants on one entity → error', () => {
    const snap = buildFixtureSnapshot();
    const kid = snap.characters[0];
    kid.variants.push({ ...kid.variants[0], key: 'base', type: 0 });
    const res = validateImportSnapshot(snap, buildFixtureParsed(), MODAL_META);
    expect(res.errors.some((e) => /base/.test(e))).toBe(true);
  });

  it('invalid original_language → error', () => {
    const res = validateImportSnapshot(buildFixtureSnapshot(), buildFixtureParsed(), {
      ...MODAL_META,
      original_language: 'xx',
    });
    expect(res.errors.some((e) => /original_language/.test(e))).toBe(true);
  });

  it('collects MULTIPLE errors in one pass (fail-fast collect-all)', () => {
    const snap = buildFixtureSnapshot();
    snap.illustration.spreads[0].raw_images![0].stage_variant = '@ghost/none';
    const parsed = buildFixtureParsed();
    parsed.cells = parsed.cells.filter((c) => !(c.lane === 'nhanh_1' && c.spread_number === 13));
    const res = validateImportSnapshot(snap, parsed, { ...MODAL_META, original_language: 'bad' });
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateImportSnapshot — warnings (non-blocking)', () => {
  it('unresolved @ref in prose → warning, not error', () => {
    const snap = buildFixtureSnapshot();
    snap.illustration.spreads[0].raw_images![0].visual_description = 'Có @unknownkey trong cảnh';
    const res = validateImportSnapshot(snap, buildFixtureParsed(), MODAL_META);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => /@unknownkey/.test(w))).toBe(true);
  });

  it('propagates parse-stage warnings (e.g. DPS right column)', () => {
    const parsed = buildFixtureParsed();
    parsed.warnings.push('SPREAD 99 (truc_chinh): trang đôi nhưng cột PHẢI có nội dung');
    const res = validateImportSnapshot(buildFixtureSnapshot(), parsed, MODAL_META);
    expect(res.warnings.some((w) => /SPREAD 99/.test(w))).toBe(true);
  });

  it('entity with no base variant → warning (advisory), not error', () => {
    const snap = buildFixtureSnapshot();
    // strip the base variant from a prop → 0 base
    snap.props[0].variants = snap.props[0].variants.filter((v) => v.key !== 'base');
    const res = validateImportSnapshot(snap, buildFixtureParsed(), MODAL_META);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => /không có variant "base"/.test(w))).toBe(true);
  });
});
