// crop-sheet-tabs.tsx — Tab strip for SwapCropSheetModal. One tab per
// crop_sheets[] entry, 1-based label. Read-only count (crop_sheets is
// auto-populated); supports left/right arrow-key roving navigation.

import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixCropSheet } from '@/types/remix';

const log = createLogger('Editor', 'CropSheetTabs');

interface CropSheetTabsProps {
  sheets: RemixCropSheet[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function CropSheetTabs({
  sheets,
  activeIndex,
  onSelect,
}: CropSheetTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Crop sheets"
      className="flex shrink-0 gap-1 overflow-x-auto pb-1"
    >
      {sheets.map((sheet, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={`crop-sheet-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={sheet.title}
            aria-label={`Crop sheet: ${sheet.title}`}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              let next = i;
              if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
              else if (e.key === 'ArrowRight')
                next = Math.min(sheets.length - 1, i + 1);
              else return;
              e.preventDefault();
              if (next === i) return;
              log.debug('onKeyDown', 'arrow navigate', { from: i, to: next });
              onSelect(next);
              const sibling = e.currentTarget.parentElement?.children[next];
              if (sibling instanceof HTMLElement) sibling.focus();
            }}
            className={cn(
              'min-w-8 shrink-0 rounded-md px-2.5 py-1 text-sm transition-colors',
              isActive
                ? 'border border-border bg-accent font-semibold text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
