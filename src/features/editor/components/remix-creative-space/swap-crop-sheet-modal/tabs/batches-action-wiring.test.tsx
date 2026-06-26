// batches-action-wiring.test.tsx — Integration of the ⚡2026-06-26 per-batch
// action: BatchesTab + the REAL BatchesSidebar + the REAL useStageBatchTab hook.
// Asserts the hook's evaluateBatchAction (per-batch gating) and
// handleStartBatchJob (select-then-start) wire correctly to the modal callbacks.
// Only stores / heavy stage are mocked.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchesTab } from './batches-tab';
import type { RemixStageBatch } from '@/types/remix';

vi.mock('../hooks/use-selected-swap-crops', () => ({
  SelectionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSelectedSwapCrops: () => ({ keys: new Set(), toggle: vi.fn(), clear: vi.fn() }),
}));

vi.mock('@/stores/remix-store', () => ({
  useRemixVariants: vi.fn(() => []),
  useRemixById: vi.fn(() => null),
  useStageFinals: vi.fn(() => []),
  useRemixActions: () => ({
    addStageBatch: vi.fn(),
    takeFinalBack: vi.fn(async () => true),
  }),
}));

vi.mock('@/stores/humans-store', () => ({ useHumans: vi.fn(() => []) }));
vi.mock('../swap-config-review-modal', () => ({ SwapConfigReviewModal: () => null }));
vi.mock('../relayout-confirm-dialog', () => ({ RelayoutConfirmDialog: () => null }));
vi.mock('../crop-sheet-stage', () => ({
  CropSheetStage: () => <div data-testid="stage" />,
}));

function makeBatch(id: string, name: string, hasCrops = true): RemixStageBatch {
  return {
    id,
    order: 0,
    name,
    crop_sheets: [
      {
        title: 'Sheet 1',
        sheet_geometry: { width: 100, height: 100 },
        image_url: '',
        swap_results: [],
        original_crops: hasCrops
          ? [
              {
                spread_id: 's1',
                id: 'i1',
                tags: [],
                media_url: 'https://cdn/i1.png',
                geometry: { x: 0, y: 0, w: 100, h: 100 },
              },
            ]
          : [],
      },
    ],
    swapTask: { state: 'idle' as const },
  };
}

function renderTab(
  overrides: Partial<React.ComponentProps<typeof BatchesTab>> = {},
) {
  const onStartJob = vi.fn();
  const onSelectBatchSheet = vi.fn();
  render(
    <BatchesTab
      remixId="remix-1"
      batches={[makeBatch('b1', 'Batch 1'), makeBatch('b2', 'Batch 2')]}
      activeBatchRef={{ batchId: 'b1', sheetIndex: 0 }}
      submittingBatchId={null}
      anyJobRunning={false}
      onSelectBatchSheet={onSelectBatchSheet}
      onActivateBatch={vi.fn()}
      onRemoveBatch={vi.fn()}
      onAddSheet={vi.fn()}
      onRemoveSheet={vi.fn()}
      onStartJob={onStartJob}
      compareMode={false}
      zoomLevel={100}
      dividerPosition={50}
      onToggleCompare={vi.fn()}
      onZoomChange={vi.fn()}
      onDividerChange={vi.fn()}
      {...overrides}
    />,
  );
  return { onStartJob, onSelectBatchSheet };
}

describe('BatchesTab — per-batch action wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicking a batch action selects that batch (sheet 0) then starts its job', () => {
    const { onStartJob, onSelectBatchSheet } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Swap Batch 2' }));
    expect(onSelectBatchSheet).toHaveBeenCalledWith('b2', 0);
    expect(onStartJob).toHaveBeenCalledWith('b2');
  });

  it('preserves the active sheet when re-running the already-selected batch', () => {
    const { onSelectBatchSheet } = renderTab({
      batches: [
        {
          ...makeBatch('b1', 'Batch 1'),
          crop_sheets: [
            makeBatch('b1', 'Batch 1').crop_sheets[0],
            makeBatch('b1', 'Batch 1').crop_sheets[0],
          ],
        },
      ],
      activeBatchRef: { batchId: 'b1', sheetIndex: 1 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Swap Batch 1' }));
    expect(onSelectBatchSheet).toHaveBeenCalledWith('b1', 1);
  });

  it('disables the action for a batch with no crops (gate fail)', () => {
    const { onStartJob } = renderTab({
      batches: [makeBatch('b1', 'Batch 1'), makeBatch('b3', 'Batch 3', false)],
    });
    const btn = screen.getByRole('button', { name: 'Swap Batch 3' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onStartJob).not.toHaveBeenCalled();
  });

  it('disables ALL batch actions while a stage job runs (per-stage mutex)', () => {
    renderTab({ anyJobRunning: true });
    expect(screen.getByRole('button', { name: 'Swap Batch 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Swap Batch 2' })).toBeDisabled();
  });

  it('shows the running batch as busy (aria-busy) and disabled', () => {
    const running = makeBatch('b1', 'Batch 1');
    running.swapTask = { state: 'running' as const, current: 0, total: 1 };
    renderTab({ batches: [running, makeBatch('b2', 'Batch 2')], anyJobRunning: true });
    const btn = screen.getByRole('button', { name: 'Swap Batch 1' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
  });
});
