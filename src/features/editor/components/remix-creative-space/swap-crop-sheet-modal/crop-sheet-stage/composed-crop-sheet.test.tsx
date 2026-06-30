// composed-crop-sheet.test.tsx — Tests for ComposedCropSheet component,
// including cropsSource='before'/'after', legacy fallback, SelectionCheckbox
// a11y + keyboard interaction, and selected-state styling.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ComposedCropSheet } from './composed-crop-sheet';
import type { RemixCropSheet, CropEntry, SwapResult, SwapResultCrop } from '@/types/remix';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCropEntry(spreadId: string, layerId: string): CropEntry {
  // LEAN CropEntry (⚡2026-06-12) — 5 fields only.
  return {
    spread_id: spreadId,
    id: layerId,
    tags: [],
    media_url: `https://cdn/${layerId}.png`,
    geometry: { x: 10, y: 10, w: 80, h: 80 },
  };
}

function makeSheet(originalCrops: CropEntry[]): RemixCropSheet {
  return {
    title: 'Sheet 1',
    sheet_geometry: { width: 100, height: 100 },
    image_url: '',
    swap_results: [],
    original_crops: originalCrops,
  };
}

function makeSwapResult(
  mediaUrl: string,
  crops: Array<{ spread_id: string; id: string }> = [],
): SwapResult {
  return {
    media_url: mediaUrl,
    created_time: 'now',
    is_selected: true,
    // LEAN swap crops (⚡2026-06-12) — geometry joins from original_crops[].
    crops: crops.map((c) => ({
      spread_id: c.spread_id,
      id: c.id,
      media_url: `https://cdn/${c.id}.png`,
    } as SwapResultCrop)),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComposedCropSheet', () => {
  // ── BEFORE mode tests ──────────────────────────────────────────────────────

  it('renders BEFORE crops from sheet.original_crops[]', () => {
    const crops = [makeCropEntry('s1', 'i1'), makeCropEntry('s2', 'i2')];
    const sheet = makeSheet(crops);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="before"
      />,
    );

    const images = screen.getAllByRole('img');
    // Each crop is an img + ordinal badge area. Filter for actual crop images.
    const cropImages = images.filter((img) => {
      const srcAttr = (img as HTMLImageElement).src;
      return (
        srcAttr &&
        (srcAttr.includes('i1.png') || srcAttr.includes('i2.png'))
      );
    });
    expect(cropImages).toHaveLength(2);
    expect(cropImages[0]).toHaveAttribute('src', expect.stringContaining('i1.png'));
    expect(cropImages[1]).toHaveAttribute('src', expect.stringContaining('i2.png'));
  });

  it('BEFORE ordinal badges sit in the TOP gutter (-translate-y-full)', () => {
    const crops = [makeCropEntry('s1', 'i1'), makeCropEntry('s2', 'i2')];
    const sheet = makeSheet(crops);

    const { container } = render(
      <ComposedCropSheet sheet={sheet} zoomLevel={100} cropsSource="before" />,
    );

    // OrdinalBadge translates fully OUT of the cell into the top separating
    // strip (`-translate-y-full`), never the old left strip (`-translate-x-full`).
    const badges = [...container.querySelectorAll('span')].filter((s) =>
      s.className.includes('-translate-y-full'),
    );
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.textContent)).toEqual(['1', '2']);
    expect(
      [...container.querySelectorAll('span')].filter((s) =>
        s.className.includes('-translate-x-full'),
      ),
    ).toHaveLength(0);
  });

  // ── AFTER mode tests ──────────────────────────────────────────────────────

  it('renders AFTER crops from selectedSwap.crops[] ⋈ original_crops[] (lean join)', () => {
    const sheet = makeSheet([
      makeCropEntry('s1', 'swap1'),
      makeCropEntry('s2', 'swap2'),
    ]);
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'swap1' },
      { spread_id: 's2', id: 'swap2' },
    ]);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
      />,
    );

    const cropImages = screen.getAllByRole('img').filter((img) => {
      const srcAttr = (img as HTMLImageElement).src;
      return (
        srcAttr &&
        (srcAttr.includes('swap1.png') || srcAttr.includes('swap2.png'))
      );
    });
    expect(cropImages).toHaveLength(2);
  });

  // ── Legacy fallback (AFTER with empty crops + media_url) ──────────────────

  it('legacy fallback: empty crops + media_url → single img + banner', () => {
    const sheet = makeSheet([]);
    const selectedSwap = makeSwapResult('https://cdn/legacy-swap.png', []);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
      />,
    );

    // Should render the legacy single image.
    const legacyImg = screen.getByAltText(/legacy swap result/i);
    expect(legacyImg).toBeInTheDocument();
    expect(legacyImg).toHaveAttribute(
      'src',
      'https://cdn/legacy-swap.png',
    );

    // Banner with the locked English copy.
    expect(
      screen.getByText(/Legacy swap — per-crop selection unavailable/),
    ).toBeInTheDocument();
  });

  // ── SelectionCheckbox visibility ────────────────────────────────────────

  it('SelectionCheckbox renders ONLY when cropsSource=after && selectableSwapCrops && onToggle', () => {
    const crops = [makeCropEntry('s1', 'i1')];
    const sheet = makeSheet(crops);
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
    ]);
    const onToggle = vi.fn();

    // BEFORE mode — no checkboxes even with selectableSwapCrops.
    const { rerender } = render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="before"
        selectableSwapCrops={true}
        onToggleSwapCropSelection={onToggle}
      />,
    );

    // Should have no checkboxes.
    const checkboxes = screen.queryAllByRole('checkbox');
    expect(checkboxes).toHaveLength(0);

    // AFTER mode with selectableSwapCrops — checkboxes should appear.
    rerender(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        onToggleSwapCropSelection={onToggle}
      />,
    );

    const checkboxesAfter = screen.getAllByRole('checkbox');
    expect(checkboxesAfter.length).toBeGreaterThan(0);
  });

  // ── Checkbox click fires onToggle with correct cropKey ────────────────────

  it('checkbox click fires onToggle(cropKey)', async () => {
    const onToggle = vi.fn();
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
    ]);
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        selectedSwapCropKeys={new Set()}
        onToggleSwapCropSelection={onToggle}
      />,
    );

    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', {
      name: /mark this crop/i,
    });

    await user.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('s1/i1');
  });

  // ── Checkbox keyboard interaction (Space + Enter) ────────────────────────

  it('checkbox keyboard Space triggers toggle', async () => {
    const onToggle = vi.fn();
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
    ]);
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        selectedSwapCropKeys={new Set()}
        onToggleSwapCropSelection={onToggle}
      />,
    );

    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', {
      name: /mark this crop/i,
    });

    checkbox.focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('s1/i1');
  });

  it('checkbox keyboard Enter triggers toggle', async () => {
    const onToggle = vi.fn();
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
    ]);
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        selectedSwapCropKeys={new Set()}
        onToggleSwapCropSelection={onToggle}
      />,
    );

    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', {
      name: /mark this crop/i,
    });

    checkbox.focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('s1/i1');
  });

  // ── Selected wrapper has outline/halo ───────────────────────────────────

  it('selected crop wrapper has outline halo (#3b6cf6)', () => {
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
    ]);
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]);
    const selectedKeys = new Set(['s1/i1']);

    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        selectedSwapCropKeys={selectedKeys}
        onToggleSwapCropSelection={vi.fn()}
      />,
    );

    // Find the crop image and check its wrapper for outline style.
    const cropImage = screen.getAllByRole('img')[0];
    const wrapper = cropImage?.parentElement;

    // Check that the selected wrapper has the outline style.
    if (wrapper) {
      const style = wrapper.getAttribute('style');
      // When selected, the style should include the blue outline.
      if (selectedKeys.has('s1/i1')) {
        expect(style).toContain('#3b6cf6');
      }
    }
  });

  // ── ⚡2026-06-12 stage modes ───────────────────────────────────────────────

  it('orphan swap crop (no matching original) is skipped — siblings still render', () => {
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]); // i2 missing → orphan
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
      { spread_id: 's2', id: 'i2' },
    ]);
    render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
      />,
    );
    const cropImages = screen
      .getAllByRole('img')
      .filter((img) => (img as HTMLImageElement).src.includes('i1.png'));
    expect(cropImages).toHaveLength(1);
    expect(
      screen.queryAllByRole('img').filter((img) => (img as HTMLImageElement).src.includes('i2.png')),
    ).toHaveLength(0);
  });

  it("'crops-only' (upscales): media_url null → composes crops; empty crops → placeholder", () => {
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]);
    const withCrops: SwapResult = {
      ...makeSwapResult('ignored', [{ spread_id: 's1', id: 'i1' }]),
      media_url: null,
    };
    const { rerender } = render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        afterComposeMode="crops-only"
        selectedSwap={withCrops}
      />,
    );
    expect(
      screen.getAllByRole('img').filter((img) => (img as HTMLImageElement).src.includes('i1.png')),
    ).toHaveLength(1);

    const empty: SwapResult = { ...makeSwapResult('ignored', []), media_url: null };
    rerender(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        afterComposeMode="crops-only"
        selectedSwap={empty}
      />,
    );
    expect(screen.getByText(/No upscale result yet/)).toBeInTheDocument();
  });

  it("'sheet-or-crops' (rmbgs): persisted sheet media_url wins as the 1-img fast path", () => {
    const sheet = makeSheet([makeCropEntry('s1', 'i1')]);
    const selectedSwap = makeSwapResult('https://cdn/rgba-sheet.png', [
      { spread_id: 's1', id: 'i1' },
    ]);
    const { container } = render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        afterComposeMode="sheet-or-crops"
        selectedSwap={selectedSwap}
      />,
    );
    // The sheet img has alt="" (PII) → role=presentation; query the tag.
    const imgs = [...container.querySelectorAll('img')];
    expect(imgs.filter((img) => img.src.includes('rgba-sheet.png'))).toHaveLength(1);
    // No per-crop <img> on the fast path (overlays are transparent boxes).
    expect(imgs.filter((img) => img.src.includes('i1.png'))).toHaveLength(0);
  });

  // ── a11y: aria-checked reflects selection state ──────────────────────────

  it('checkbox aria-checked reflects selection state', () => {
    const selectedSwap = makeSwapResult('https://cdn/swap.png', [
      { spread_id: 's1', id: 'i1' },
      { spread_id: 's2', id: 'i2' },
    ]);
    const sheet = makeSheet([makeCropEntry('s1', 'i1'), makeCropEntry('s2', 'i2')]);

    const { rerender } = render(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        selectedSwapCropKeys={new Set()}
        onToggleSwapCropSelection={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => {
      expect(cb).toHaveAttribute('aria-checked', 'false');
    });

    // Rerender with selected state.
    rerender(
      <ComposedCropSheet
        sheet={sheet}
        zoomLevel={100}
        cropsSource="after"
        selectedSwap={selectedSwap}
        selectableSwapCrops={true}
        selectedSwapCropKeys={new Set(['s1/i1'])}
        onToggleSwapCropSelection={vi.fn()}
      />,
    );

    const firstCheckbox = screen.getAllByRole('checkbox')[0];
    expect(firstCheckbox).toHaveAttribute('aria-checked', 'true');
  });
});
