// config-layout-settings.tsx - Layout settings panel for selecting default template layouts.
// 3 slots: spread (double page), left_page, right_page. Cover section is a future placeholder.
// Fetches template_layouts from Supabase on mount, filtered by book_type.

import * as React from 'react';
import { useCurrentBook, useBookTemplateLayout, useBookActions } from '@/stores/book-store';
import { LayoutThumbnail } from './layout-thumbnail';
import { LayoutSelectionModal } from './layout-selection-modal';
import { useTemplateLayouts } from '@/hooks/use-template-layouts';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import type { BookTemplateLayout, PageNumberingPosition, PageNumberingSettings, TemplateLayout } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const DEFAULT_PAGE_NUMBERING: PageNumberingSettings = {
  position: 'bottom_center',
  color: '#000000',
};

const PAGE_NUMBERING_POSITION_OPTIONS: { value: PageNumberingPosition; label: string }[] = [
  { value: 'bottom_center', label: 'Bottom Center' },
  { value: 'bottom_corner', label: 'Bottom Corner' },
  { value: 'top_corner', label: 'Top Corner' },
  { value: 'none', label: 'No Numbering' },
];

const log = createLogger('Editor', 'ConfigLayoutSettings');

type LayoutSlot = 'spread' | 'left_page' | 'right_page';

const SLOT_LABELS: Record<LayoutSlot, string> = {
  spread: 'Double Page Layout',
  left_page: 'Left Page Layout',
  right_page: 'Right Page Layout',
};

interface LayoutCardProps {
  layout: TemplateLayout | null;
  slotType: 1 | 2; // 1: spread (3:2), 2: single page (3:4)
  onClick: () => void;
}

function LayoutCard({ layout, slotType, onClick }: LayoutCardProps) {
  const isSpread = slotType === 1;
  const hasLayout = layout !== null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center gap-2 rounded-lg border-2 text-center transition-colors ${isSpread ? 'w-fit px-5 py-3' : 'w-[150px] p-3'} ${hasLayout ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/60'}`}
    >
      <div className={isSpread ? 'w-52' : 'w-28'}>
        {layout ? (
          <LayoutThumbnail
            textboxes={layout.textboxes}
            images={layout.images}
            type={layout.type}
            isSelected
          />
        ) : (
          <div
            className={`flex w-full items-center justify-center rounded bg-muted text-[10px] text-muted-foreground ${isSpread ? 'aspect-[3/2]' : 'aspect-[3/4]'}`}
          >
            —
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="truncate text-sm font-medium" title={layout?.title ?? undefined}>{layout?.title ?? 'No layout selected'}</span>
        <span className="text-xs text-muted-foreground">Click to change</span>
      </div>
    </button>
  );
}

export function ConfigLayoutSettings() {
  const book = useCurrentBook();
  const templateLayout = useBookTemplateLayout();
  const { updateBook } = useBookActions();

  const { spreadLayouts, singlePageLayouts } = useTemplateLayouts(book?.book_type ?? null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalTarget, setModalTarget] = React.useState<LayoutSlot | null>(null);

  if (!book) return null;

  const openModal = (slot: LayoutSlot) => {
    log.debug('openModal', 'opening', { slot });
    setModalTarget(slot);
    setModalOpen(true);
  };

  const handleSelect = (layoutId: string) => {
    if (!modalTarget) return;
    log.info('handleSelect', 'layout chosen', { slot: modalTarget, layoutId });
    void updateBook(book.id, {
      template_layout: {
        ...(templateLayout ?? { spread: '', left_page: '', right_page: '' }),
        [modalTarget]: layoutId,
      } as BookTemplateLayout,
    });
    setModalOpen(false);
    setModalTarget(null);
  };

  const handleClose = () => {
    setModalOpen(false);
    setModalTarget(null);
  };

  const pageNumbering = templateLayout?.page_numbering ?? DEFAULT_PAGE_NUMBERING;

  const handlePageNumberingChange = (updates: Partial<PageNumberingSettings>) => {
    const current = templateLayout?.page_numbering ?? DEFAULT_PAGE_NUMBERING;
    const updated = { ...current, ...updates };
    log.info('handlePageNumberingChange', 'updating', { keys: Object.keys(updates) });
    void updateBook(book.id, {
      template_layout: {
        ...(templateLayout ?? { spread: '', left_page: '', right_page: '' }),
        page_numbering: updated,
      } as BookTemplateLayout,
    });
  };

  const findLayout = (layouts: TemplateLayout[], id: string | null | undefined) =>
    id ? (layouts.find((l) => l.id === id) ?? null) : null;

  const spreadSelected = findLayout(spreadLayouts, templateLayout?.spread);
  const leftSelected = findLayout(singlePageLayouts, templateLayout?.left_page);
  const rightSelected = findLayout(singlePageLayouts, templateLayout?.right_page);

  const modalLayouts = modalTarget === 'spread' ? spreadLayouts : singlePageLayouts;
  const modalSelectedId = modalTarget ? (templateLayout?.[modalTarget] ?? null) : null;
  const modalTitle = modalTarget ? `Select ${SLOT_LABELS[modalTarget]}` : '';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Layout Settings</h3>
      </div>

      <div className="flex flex-col gap-8 overflow-y-auto p-6">
        {/* Double Page (Spread) */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Double Page (Spread)
          </p>
          <LayoutCard
            layout={spreadSelected}
            slotType={1}
            onClick={() => openModal('spread')}
          />
        </div>

        {/* Single Page */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Single Page
          </p>
          <div className="flex flex-row gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Left Page</span>
              <LayoutCard
                layout={leftSelected}
                slotType={2}
                onClick={() => openModal('left_page')}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Right Page</span>
              <LayoutCard
                layout={rightSelected}
                slotType={2}
                onClick={() => openModal('right_page')}
              />
            </div>
          </div>
        </div>

        {/* Page Numbering */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Page Numbering
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Position</span>
              <SearchableDropdown
                options={PAGE_NUMBERING_POSITION_OPTIONS}
                value={pageNumbering.position}
                onChange={(val) => handlePageNumberingChange({ position: val as PageNumberingPosition })}
                placeholder="Position..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={pageNumbering.color}
                  onChange={(e) => handlePageNumberingChange({ color: e.target.value })}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded border p-0.5"
                  title="Page number color"
                />
                <span className="text-sm text-foreground">{pageNumbering.color}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <LayoutSelectionModal
        open={modalOpen}
        title={modalTitle}
        layouts={modalLayouts}
        selectedId={modalSelectedId}
        cols={modalTarget === 'spread' ? 3 : 4}
        onSelect={handleSelect}
        onClose={handleClose}
      />
    </div>
  );
}
