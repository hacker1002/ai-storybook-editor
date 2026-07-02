import { describe, it, expect } from 'vitest';
import { validateSketchImport } from '../validate-import-snapshot';
import { buildFixtureWorkbook, buildFixtureSketchSnapshot, MODAL_META } from './fixtures/sketch-manuscript-fixture';

/** Fresh snapshot + parsed + seed issues for each case (cases mutate the snapshot). */
function setup() {
  const { snapshot, issues } = buildFixtureSketchSnapshot();
  return { snapshot, parsed: buildFixtureWorkbook(), issues };
}

describe('validateSketchImport — happy path', () => {
  it('the fixture is fully valid (no errors, no warnings)', () => {
    const { snapshot, parsed, issues } = setup();
    const res = validateSketchImport(snapshot, parsed, MODAL_META, issues);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
  });
});

describe('validateSketchImport — errors (collect-all)', () => {
  it('dangling art_direction.stage → error', () => {
    const { snapshot, parsed, issues } = setup();
    snapshot.sketch.spreads[0].pages[0].art_direction.stage = '@ghost/none';
    const res = validateSketchImport(snapshot, parsed, MODAL_META, issues);
    expect(res.errors.some((e) => /@ghost\/none/.test(e))).toBe(true);
  });

  it('two base variants on one entity → error', () => {
    const { snapshot, parsed, issues } = setup();
    const kid = snapshot.characters[0];
    kid.variants.push({ ...kid.variants[0], key: 'base', type: 0 });
    const res = validateSketchImport(snapshot, parsed, MODAL_META, issues);
    expect(res.errors.some((e) => /base/.test(e))).toBe(true);
  });

  it('invalid original_language → error', () => {
    const { snapshot, parsed, issues } = setup();
    const res = validateSketchImport(snapshot, parsed, { ...MODAL_META, original_language: 'xx' }, issues);
    expect(res.errors.some((e) => /original_language/.test(e))).toBe(true);
  });

  it('collects MULTIPLE errors in one pass', () => {
    const { snapshot, parsed, issues } = setup();
    snapshot.sketch.spreads[0].pages[0].art_direction.stage = '@ghost/none';
    snapshot.characters[0].variants.push({ ...snapshot.characters[0].variants[0], key: 'base', type: 0 });
    const res = validateSketchImport(snapshot, parsed, { ...MODAL_META, original_language: 'bad' }, issues);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateSketchImport — warnings (non-blocking)', () => {
  it('unresolved @ref in an art_direction field → warning, not error', () => {
    const { snapshot, parsed, issues } = setup();
    snapshot.sketch.spreads[0].pages[0].art_direction.setting = 'Có @unknownkey trong cảnh';
    const res = validateSketchImport(snapshot, parsed, MODAL_META, issues);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => /@unknownkey/.test(w))).toBe(true);
  });

  it('entity with no base variant → warning (advisory), not error', () => {
    const { snapshot, parsed, issues } = setup();
    snapshot.props[0].variants = snapshot.props[0].variants.filter((v) => v.key !== 'base');
    const res = validateSketchImport(snapshot, parsed, MODAL_META, issues);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => /không có variant "base"/.test(w))).toBe(true);
  });

  it('propagates seeded spread-parse warnings', () => {
    const { snapshot, parsed, issues } = setup();
    issues.warnings.push('SPREAD 99: nhãn dòng lạ "Xyz" — bỏ qua');
    const res = validateSketchImport(snapshot, parsed, MODAL_META, issues);
    expect(res.warnings.some((w) => /SPREAD 99/.test(w))).toBe(true);
  });
});
