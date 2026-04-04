// layout-selection-modal.tsx - Radix Dialog modal for selecting a template layout.
// Renders a 3 or 4-column grid of layout options with SVG thumbnails.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LayoutThumbnail } from './layout-thumbnail';
import type { TemplateLayout } from '@/types/editor';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'LayoutSelectionModal');

interface LayoutSelectionModalProps {
  open: boolean;
  title: string;
  layouts: TemplateLayout[];
  selectedId: string | null;
  cols?: 3 | 4;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function LayoutSelectionModal({
  open,
  title,
  layouts,
  selectedId,
  cols = 3,
  onSelect,
  onClose,
}: LayoutSelectionModalProps) {
  const handleSelect = (id: string) => {
    log.info('handleSelect', 'layout selected', { id });
    onSelect(id);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="flex max-h-[70vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {layouts.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No layouts available
          </div>
        ) : (
          <div className={cn('grid gap-3 overflow-y-auto py-2', cols === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
            {layouts.map((layout) => {
              const isSelected = layout.id === selectedId;
              return (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => handleSelect(layout.id)}
                  className={cn(
                    'group flex flex-col gap-2 rounded-lg border-2 p-2 text-left transition-colors',
                    isSelected
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border hover:border-primary/60'
                  )}
                >
                  <LayoutThumbnail
                    textboxes={layout.textboxes}
                    images={layout.images}
                    type={layout.type}
                    isSelected={isSelected}
                  />
                  <span className="truncate text-center text-xs font-medium">{layout.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
