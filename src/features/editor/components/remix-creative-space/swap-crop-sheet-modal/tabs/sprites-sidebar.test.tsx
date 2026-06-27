// sprites-sidebar.test.tsx — Presentational tests for the ⚡2026-06-26 per-sprite
// Swap action button + variant-count relocation (below title) + per-sheet variant
// pill. Parity with batches-sidebar.test.tsx on the sprites[] plane.

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Repeat } from 'lucide-react';
import type { RemixSprite } from '@/types/remix';
import { SpritesSidebar } from './sprites-sidebar';
import type { BatchActionState } from './use-stage-batch-tab';

vi.mock('@/stores/remix-store', () => ({ spriteLineupObjects: () => [] }));

function makeSprite(
  id: string,
  order: number,
  cropsPerSheet = 6,
  sheetCount = 1,
): RemixSprite {
  return {
    id,
    order,
    crop_sheets: Array.from({ length: sheetCount }, () => ({
      title: 'Sheet 1',
      sheet_geometry: { width: 100, height: 100 },
      image_url: '',
      swap_results: [],
      original_crops: Array.from({ length: cropsPerSheet }, (_, i) => ({
        type: 'character',
        object_key: `c${i}`,
        variant_key: `v${i}`,
        media_url: `https://cdn/c${i}.png`,
        geometry: { x: 0, y: 0, w: 10, h: 10 },
      })),
    })),
    swapTask: { state: 'idle' as const },
  } as unknown as RemixSprite;
}

const idleState: BatchActionState = {
  disabled: false,
  tooltip: undefined,
  busy: false,
  isError: false,
};

function renderSidebar(
  overrides: Partial<React.ComponentProps<typeof SpritesSidebar>> = {},
  getState: (s: RemixSprite) => BatchActionState = () => idleState,
) {
  const onRun = vi.fn();
  const props: React.ComponentProps<typeof SpritesSidebar> = {
    sprites: [makeSprite('s1', 0)],
    activeSpriteRef: { spriteId: 's1', sheetIndex: 0 },
    isCollapsed: () => false,
    onToggleCollapse: vi.fn(),
    anySpriteSwapRunning: false,
    canAddSprite: false,
    addSpriteTooltip: '',
    selectionSize: 0,
    layoutPending: false,
    spriteAction: {
      icon: Repeat,
      label: 'Swap',
      retryLabel: 'Retry swap',
      getState,
      onRun,
    },
    spriteDetectAction: {
      getState: () => ({
        disabled: false,
        busy: false,
        tooltip: 'Kiểm tra lỗi swap (mọi sheet)',
        label: 'Check',
        badge: null,
      }),
      onRun: vi.fn(),
    },
    onSelectSpriteSheet: vi.fn(),
    onAddSprite: vi.fn(),
    onRemoveSprite: vi.fn(),
    onAddSheet: vi.fn(),
    onRemoveSheet: vi.fn(),
    ...overrides,
  };
  return { onRun, ...render(<SpritesSidebar {...props} />) };
}

describe('SpritesSidebar — per-sprite Swap action + counts', () => {
  it('renders one Swap button per sprite, labelled by verb + batch name', () => {
    renderSidebar({ sprites: [makeSprite('s1', 0), makeSprite('s2', 1)] });
    expect(screen.getByRole('button', { name: 'Swap Batch 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Swap Batch 2' })).toBeInTheDocument();
  });

  it('clicking an enabled Swap button calls onRun(sprite.id)', () => {
    const { onRun } = renderSidebar({
      sprites: [makeSprite('s1', 0), makeSprite('s2', 1)],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Swap Batch 2' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith('s2');
  });

  it('disables Swap when getState reports disabled (e.g. config incomplete)', () => {
    const { onRun } = renderSidebar({}, () => ({
      ...idleState,
      disabled: true,
      tooltip: 'Finish the swap config for every character first',
    }));
    const btn = screen.getByRole('button', { name: 'Swap Batch 1' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows busy (spinner + aria-busy + disabled) while a swap runs', () => {
    renderSidebar({}, () => ({ ...idleState, busy: true }));
    const btn = screen.getByRole('button', { name: 'Swap Batch 1' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('.animate-spin')).toBeTruthy();
  });

  it('flips to the retry label when the sprite last errored', () => {
    renderSidebar({}, () => ({ ...idleState, isError: true }));
    expect(
      screen.getByRole('button', { name: 'Retry swap Batch 1' }),
    ).toBeInTheDocument();
  });

  it('renders the variant count (relocated below the title)', () => {
    renderSidebar({ sprites: [makeSprite('s1', 0, 3, 2)] });
    expect(screen.getByText('6 variants')).toBeInTheDocument();
  });

  it('renders a per-sheet variant count pill on each sheet row', () => {
    renderSidebar({ sprites: [makeSprite('s1', 0, 6, 2)] });
    const group = screen.getByRole('group');
    const sheets = within(group).getAllByRole('treeitem');
    expect(sheets).toHaveLength(2);
    sheets.forEach((s) => {
      expect(within(s).getByText('6 variants')).toBeInTheDocument();
    });
  });
});
