// image-tools-space-matrix.test.ts — Unit tests for the 3-state gate resolution helpers. Focus is
// resolveToolGate's 2-reason classification (unavailable vs coming-soon) + resolveInitialKey's
// fallback chain (the raw-Extract "all coming-soon" case is the one that would crash a modal if
// it returned an unavailable/null tab) + backward-compat when no space gate.

import { describe, it, expect } from 'vitest';
import {
  SPACE_TOOL_MATRIX,
  resolveToolGate,
  resolveInitialKey,
  gateTooltip,
} from './image-tools-space-matrix';
import { EDIT_TOOLS, DEFAULT_EDIT_TOOL } from './edit-image-modal/edit-image-modal-constants';
import { EXTRACT_TABS, DEFAULT_EXTRACT_TAB } from './extract-image-modal/extract-image-modal-constants';

describe('resolveToolGate', () => {
  it('marks a key absent from the space list unavailable (matrix gate)', () => {
    expect(resolveToolGate('remove_text', ['inpaint', 'upscale'], true)).toBe('unavailable');
  });

  it('marks an available-but-unbuilt key coming-soon', () => {
    expect(resolveToolGate('crop', ['crop', 'get_text'], false)).toBe('coming-soon');
  });

  it('marks an available + built key active', () => {
    expect(resolveToolGate('inpaint', ['inpaint'], true)).toBe('active');
  });

  it('treats undefined space list as "all available" (legacy) — never unavailable', () => {
    expect(resolveToolGate('anything', undefined, true)).toBe('active');
    expect(resolveToolGate('anything', undefined, false)).toBe('coming-soon');
  });
});

describe('gateTooltip — 2 distinct disabled reasons', () => {
  it('unavailable → "Not available in this space"', () => {
    expect(gateTooltip('unavailable')).toBe('Not available in this space');
  });
  it('coming-soon → "Coming soon"', () => {
    expect(gateTooltip('coming-soon')).toBe('Coming soon');
  });
  it('active → no tooltip', () => {
    expect(gateTooltip('active')).toBeUndefined();
  });
});

describe('SPACE_TOOL_MATRIX.remix.edit — 3-state (Phase 1 wiring)', () => {
  const remixEdit = SPACE_TOOL_MATRIX.remix.edit;

  it('includes remove_background (added Phase 1)', () => {
    expect(remixEdit).toContain('remove_background');
  });

  it('built remix tools resolve active', () => {
    for (const key of ['inpaint', 'upscale', 'erasor', 'remove_background']) {
      const enabled = EDIT_TOOLS.find((t) => t.key === key)?.enabled ?? false;
      expect(resolveToolGate(key, remixEdit, enabled)).toBe('active');
    }
  });

  it('tools outside remix.edit resolve unavailable (Not available in this space)', () => {
    for (const key of ['outpaint', 'remove_object', 'remove_text']) {
      const enabled = EDIT_TOOLS.find((t) => t.key === key)?.enabled ?? false;
      expect(resolveToolGate(key, remixEdit, enabled)).toBe('unavailable');
    }
  });

  it('remix.edit lands on inpaint (never an unavailable tool)', () => {
    expect(resolveInitialKey(EDIT_TOOLS, remixEdit, undefined, DEFAULT_EDIT_TOOL)).toBe('inpaint');
  });
});

describe('resolveInitialKey — Edit tools', () => {
  it('legacy (no gate, no request) → DEFAULT_EDIT_TOOL', () => {
    expect(resolveInitialKey(EDIT_TOOLS, undefined, undefined, DEFAULT_EDIT_TOOL)).toBe('inpaint');
  });

  it('honors a requested tool that is available + built', () => {
    expect(
      resolveInitialKey(EDIT_TOOLS, SPACE_TOOL_MATRIX.object.edit, 'upscale', DEFAULT_EDIT_TOOL),
    ).toBe('upscale');
  });

  it('falls back to leftmost built+available when requested is unbuilt', () => {
    // remove_object is available in object.edit but enabled:false → skip to leftmost built (inpaint).
    expect(
      resolveInitialKey(EDIT_TOOLS, SPACE_TOOL_MATRIX.object.edit, 'remove_object', DEFAULT_EDIT_TOOL),
    ).toBe('inpaint');
  });

  it('skips a requested tool unavailable in the space gate', () => {
    // remove_text is NOT in object.edit (unavailable) → fall back to leftmost built+available.
    expect(
      resolveInitialKey(EDIT_TOOLS, SPACE_TOOL_MATRIX.object.edit, 'remove_text', DEFAULT_EDIT_TOOL),
    ).toBe('inpaint');
  });
});

describe('resolveInitialKey — Extract tabs', () => {
  it('legacy (no gate, no request) → DEFAULT_EXTRACT_TAB', () => {
    expect(resolveInitialKey(EXTRACT_TABS, undefined, undefined, DEFAULT_EXTRACT_TAB)).toBe('get_object');
  });

  it('object space lands on the built get_object tab', () => {
    expect(
      resolveInitialKey(EXTRACT_TABS, SPACE_TOOL_MATRIX.object.extract, undefined, DEFAULT_EXTRACT_TAB),
    ).toBe('get_object');
  });

  it('raw space lands on the built get_text tab (leftmost built+available)', () => {
    // raw.extract = ['crop','get_text']. Both are now enabled (Crops + Texts shipped), so the
    // landing tab is the leftmost built+available in registry order — get_text precedes crop.
    const tab = resolveInitialKey(EXTRACT_TABS, SPACE_TOOL_MATRIX.raw.extract, undefined, DEFAULT_EXTRACT_TAB);
    expect(SPACE_TOOL_MATRIX.raw.extract).toContain(tab);
    expect(tab).toBe('get_text');
  });
});
