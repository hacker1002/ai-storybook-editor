// batches-sidebar.test.tsx — Presentational tests for the ⚡2026-06-26 per-batch
// primary action button + crop-count relocation (below title) + per-sheet crop
// pill. The sidebar is dumb: it renders `batchAction.getState(batch)` and fires
// `batchAction.onRun(batch.id)`. Gating/select-then-run lives in the hook
// (covered by batches-action-wiring.test.tsx).

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Repeat } from 'lucide-react';
import type { RemixStageBatch } from '@/types/remix';
import { BatchesSidebar } from './batches-sidebar';
import type { BatchActionState } from './use-stage-batch-tab';

function makeBatch(
  id: string,
  name: string,
  cropsPerSheet = 6,
  sheetCount = 1,
): RemixStageBatch {
  return {
    id,
    order: 0,
    name,
    crop_sheets: Array.from({ length: sheetCount }, () => ({
      title: 'Sheet 1',
      sheet_geometry: { width: 100, height: 100 },
      image_url: '',
      swap_results: [],
      original_crops: Array.from({ length: cropsPerSheet }, (_, i) => ({
        spread_id: `s${i}`,
        id: `i${i}`,
        tags: [],
        media_url: `https://cdn/i${i}.png`,
        geometry: { x: 0, y: 0, w: 10, h: 10 },
      })),
    })),
    swapTask: { state: 'idle' as const },
  };
}

const idleState: BatchActionState = {
  disabled: false,
  tooltip: undefined,
  busy: false,
  isError: false,
};

function renderSidebar(
  overrides: Partial<React.ComponentProps<typeof BatchesSidebar>> = {},
  getState: (b: RemixStageBatch) => BatchActionState = () => idleState,
) {
  const onRun = vi.fn();
  const props: React.ComponentProps<typeof BatchesSidebar> = {
    batches: [makeBatch('b1', 'Batch 1')],
    activeBatchRef: { batchId: 'b1', sheetIndex: 0 },
    isCollapsed: () => false,
    onToggleCollapse: vi.fn(),
    anyJobRunning: false,
    canAddBatch: false,
    addBatchTooltip: '',
    selectionSize: 0,
    batchAction: {
      icon: Repeat,
      label: 'Swap',
      retryLabel: 'Retry swap',
      getState,
      onRun,
    },
    onSelectBatchSheet: vi.fn(),
    onAddBatch: vi.fn(),
    onRemoveBatch: vi.fn(),
    onAddSheet: vi.fn(),
    onRemoveSheet: vi.fn(),
    ...overrides,
  };
  return { onRun, ...render(<BatchesSidebar {...props} />) };
}

describe('BatchesSidebar — per-batch action + counts', () => {
  it('renders one action button per batch, labelled by stage verb + batch name', () => {
    renderSidebar({
      batches: [makeBatch('b1', 'Batch 1'), makeBatch('b2', 'Batch 2')],
    });
    expect(screen.getByRole('button', { name: 'Swap Batch 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Swap Batch 2' })).toBeInTheDocument();
  });

  it('clicking an enabled action button calls onRun(batch.id)', () => {
    const { onRun } = renderSidebar({
      batches: [makeBatch('b1', 'Batch 1'), makeBatch('b2', 'Batch 2')],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Swap Batch 2' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith('b2');
  });

  it('disables the action button when getState reports disabled', () => {
    const { onRun } = renderSidebar({}, () => ({
      ...idleState,
      disabled: true,
      tooltip: 'This batch has no crops to process',
    }));
    const btn = screen.getByRole('button', { name: 'Swap Batch 1' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows busy state (spinner + aria-busy + disabled) while a job runs', () => {
    renderSidebar({}, () => ({ ...idleState, busy: true }));
    const btn = screen.getByRole('button', { name: 'Swap Batch 1' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('.animate-spin')).toBeTruthy();
  });

  it('flips to the retry label when the batch last errored', () => {
    renderSidebar({}, () => ({ ...idleState, isError: true }));
    expect(
      screen.getByRole('button', { name: 'Retry swap Batch 1' }),
    ).toBeInTheDocument();
  });

  it('renders the batch crop count (relocated below the title)', () => {
    // 2 sheets × 3 crops → batch total "6 crops" (unique), sheet pills "3 crops".
    renderSidebar({ batches: [makeBatch('b1', 'Batch 1', 3, 2)] });
    expect(screen.getByText('6 crops')).toBeInTheDocument();
  });

  it('renders a per-sheet crop count pill on each sheet row', () => {
    renderSidebar({ batches: [makeBatch('b1', 'Batch 1', 6, 2)] });
    // Sheet rows live in the batch's role="group"; the level-1 batch treeitem
    // aggregates child text, so scope to the group to isolate sheet rows.
    const group = screen.getByRole('group');
    const sheets = within(group).getAllByRole('treeitem');
    expect(sheets).toHaveLength(2);
    sheets.forEach((s) => {
      expect(within(s).getByText('6 crops')).toBeInTheDocument();
    });
  });
});
