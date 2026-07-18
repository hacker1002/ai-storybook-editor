// parse-stages.test.ts — pure parse + validation of the stage Excel import (design 05).
// Tests the row-level seam directly (parseStages/validateStageImport) — no File I/O, no xlsx
// runtime, NO node builtins (editor tests type-check with vite/client types only).

import { describe, it, expect } from 'vitest';
import {
  parseStages,
  validateStageImport,
  type StageImportIssues,
  type StageSheetRow,
} from './parse-stages';

const row = (over: Partial<StageSheetRow>): StageSheetRow => ({
  ref: '',
  stage: '',
  variant: '',
  description: '',
  visual_design: '',
  art_language: '',
  ...over,
});

const emptyIssues = (): StageImportIssues => ({ errors: [], warnings: [] });

describe('parseStages — byKey grouping', () => {
  it('groups rows by the stage column: one row = one variant, stage order = first-seen', () => {
    const rows = [
      row({ stage: 'house_night', variant: 'base', description: 'd0', visual_design: 'v0', art_language: 'a0' }),
      row({ stage: 'house_night', variant: 'storm', visual_design: 'v1' }),
      row({ stage: 'forest', variant: 'base' }),
      row({ stage: 'house_night', variant: 'dawn' }),
    ];
    const stages = parseStages(rows);
    expect(stages.map((s) => s.key)).toEqual(['house_night', 'forest']);
    expect(stages[0].variants.map((v) => v.key)).toEqual(['base', 'storm', 'dawn']);
    expect(stages[0].variants[0]).toEqual({
      key: 'base',
      description: 'd0',
      visual_design: 'v0',
      art_language: 'a0',
      illustrations: [],
      crops: [],
    });
  });

  it('imagery is ALWAYS empty (base.styles=[], variant illustrations/crops=[])', () => {
    const stages = parseStages([row({ stage: 's', variant: 'base' })]);
    expect(stages[0].base).toEqual({ styles: [] });
    expect(stages[0].variants[0].illustrations).toEqual([]);
    expect(stages[0].variants[0].crops).toEqual([]);
  });

  it('skips rows with an empty stage key; empty text cells → "" (variant kept)', () => {
    const stages = parseStages([row({ stage: '', variant: 'x' }), row({ stage: 's', variant: 'base' })]);
    expect(stages).toHaveLength(1);
    expect(stages[0].variants[0].description).toBe('');
  });

  it('NEVER stamps a height field (stage model has none)', () => {
    const stages = parseStages([row({ stage: 's', variant: 'base', height: '110cm' })]);
    expect('height' in stages[0].variants[0]).toBe(false);
  });
});

describe('validateStageImport', () => {
  it('error: duplicate (stage, variant) pair', () => {
    const rows = [row({ stage: 's', variant: 'base' }), row({ stage: 's', variant: 'base' })];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    expect(issues.errors).toHaveLength(1);
    expect(issues.errors[0]).toContain('variant key trùng');
  });

  it('warn: not exactly one base variant per stage', () => {
    const rows = [row({ stage: 's', variant: 'storm' })];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    expect(issues.warnings.some((w) => w.includes('variant "base"'))).toBe(true);
  });

  it('warn (once): a present height column is skipped — stage has no height', () => {
    const rows = [
      row({ stage: 's', variant: 'base', height: '1m' }),
      row({ stage: 's', variant: 'storm', height: '2m' }),
    ];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    const heightWarnings = issues.warnings.filter((w) => w.includes('height'));
    expect(heightWarnings).toHaveLength(1); // once, not per-row
  });

  it('no height warning when the column is absent/empty', () => {
    const rows = [row({ stage: 's', variant: 'base' })];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    expect(issues.warnings.some((w) => w.includes('height'))).toBe(false);
  });

  it('warn: ref column not matching @stage/variant', () => {
    const rows = [row({ stage: 's', variant: 'base', ref: '@other/base' })];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    expect(issues.warnings.some((w) => w.includes('không khớp @s/base'))).toBe(true);
  });

  it('ok: matching ref column raises nothing', () => {
    const rows = [row({ stage: 's', variant: 'base', ref: '@s/base' })];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    expect(issues.warnings.filter((w) => w.includes('ref'))).toEqual([]);
  });

  it('warn: inline @ref to a KNOWN stage with an unknown variant; cross-entity refs kept silent', () => {
    const rows = [
      row({ stage: 's', variant: 'base', visual_design: 'như @s/ghost lúc @wand/base' }),
      row({ stage: 's', variant: 'storm' }),
    ];
    const issues = emptyIssues();
    validateStageImport(parseStages(rows), rows, issues);
    // @s/ghost — s exists but has no 'ghost' variant → warn; @wand/base — not a stage → verbatim, silent.
    expect(issues.warnings.some((w) => w.includes('@s/ghost'))).toBe(true);
    expect(issues.warnings.some((w) => w.includes('@wand'))).toBe(false);
  });
});
