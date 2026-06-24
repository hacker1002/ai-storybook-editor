// image-tools-space-matrix.test.ts — Unit tests for the 2-gate resolution helpers. Focus is
// resolveInitialKey's fallback chain (the raw-Extract "all coming-soon" case is the one that
// would crash a modal if it returned a hidden/null tab) + backward-compat when no space gate.

import { describe, it, expect } from 'vitest';
import {
  SPACE_TOOL_MATRIX,
  resolveToolGate,
  resolveInitialKey,
} from './image-tools-space-matrix';
import { EDIT_TOOLS, DEFAULT_EDIT_TOOL } from './edit-image-modal/edit-image-modal-constants';
import { EXTRACT_TABS, DEFAULT_EXTRACT_TAB } from './extract-image-modal/extract-image-modal-constants';

describe('resolveToolGate', () => {
  it('hides a key absent from the space list', () => {
    expect(resolveToolGate('remove_text', ['inpaint', 'upscale'], true)).toBe('hidden');
  });

  it('marks an available-but-unbuilt key coming-soon', () => {
    expect(resolveToolGate('crop', ['crop', 'get_text'], false)).toBe('coming-soon');
  });

  it('marks an available + built key active', () => {
    expect(resolveToolGate('inpaint', ['inpaint'], true)).toBe('active');
  });

  it('treats undefined space list as "all available" (legacy)', () => {
    expect(resolveToolGate('anything', undefined, true)).toBe('active');
    expect(resolveToolGate('anything', undefined, false)).toBe('coming-soon');
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

  it('skips a requested tool hidden by the space gate', () => {
    // remove_text is NOT in object.edit (hidden) → fall back to leftmost built+available.
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

  it('raw space (all tabs coming-soon) → leftmost available, never hidden/null', () => {
    // raw.extract = ['crop','get_text'], both enabled:false. Registry order puts get_text (idx 1)
    // before crop (idx 2), so the leftmost-available fallback is get_text.
    const tab = resolveInitialKey(EXTRACT_TABS, SPACE_TOOL_MATRIX.raw.extract, undefined, DEFAULT_EXTRACT_TAB);
    expect(SPACE_TOOL_MATRIX.raw.extract).toContain(tab);
    expect(tab).toBe('get_text');
  });
});
