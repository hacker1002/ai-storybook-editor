import { describe, it, expect } from 'vitest';
import { formatMergedEntityText, parseMergedEntityText } from './base-entity-text-merge';

describe('base-entity-text-merge', () => {
  it('round-trips fields through format → parse', () => {
    const fields = {
      description: 'Bé khoảng 5 tuổi, người Việt.',
      height: '1.05 m',
      visual_design: 'bé trai 5 tuổi\nđồ ngủ vàng kem',
    };
    const parsed = parseMergedEntityText(formatMergedEntityText(fields));
    expect(parsed).toEqual({ ok: true, fields });
  });

  it('format emits all three labeled sections', () => {
    const text = formatMergedEntityText({ description: 'd', height: 'h', visual_design: 'v' });
    expect(text).toContain('[Description]');
    expect(text).toContain('[Height]');
    expect(text).toContain('[Visual design]');
  });

  it('preserves multi-line bodies and trims edges', () => {
    const raw = '[Description]\n  line1\nline2  \n\n[Height]\n\n[Visual design]\nvd';
    const res = parseMergedEntityText(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.fields.description).toBe('line1\nline2');
      expect(res.fields.height).toBe('');
      expect(res.fields.visual_design).toBe('vd');
    }
  });

  it('matches headers case-insensitively', () => {
    const raw = '[description]\nd\n[HEIGHT]\nh\n[Visual Design]\nv';
    const res = parseMergedEntityText(raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.fields).toEqual({ description: 'd', height: 'h', visual_design: 'v' });
  });

  it('rejects a deleted header (cannot route the text)', () => {
    const raw = 'orphan text\n[Height]\nh\n[Visual design]\nv';
    const res = parseMergedEntityText(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('[Description]'))).toBe(true);
  });

  it('rejects a duplicated header', () => {
    const raw = '[Description]\na\n[Description]\nb\n[Height]\nh\n[Visual design]\nv';
    const res = parseMergedEntityText(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('rejects empty visual_design even when headers are intact', () => {
    const raw = '[Description]\nd\n[Height]\nh\n[Visual design]\n   ';
    const res = parseMergedEntityText(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("Visual design can't be empty"))).toBe(true);
  });
});
