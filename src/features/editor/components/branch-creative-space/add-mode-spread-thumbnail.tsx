// add-mode-spread-thumbnail.tsx - SpreadThumbnail with checkbox overlay for add-section mode
"use client";

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import { SpreadThumbnail } from '../canvas-spread-view/spread-thumbnail';
import type { BaseSpread } from './branch-types';
import type { ImageItemContext, TextItemContext, ShapeItemContext } from '@/types/canvas-types';

const log = createLogger('Editor', 'AddModeSpreadThumbnail');
const RENDER_ITEMS: ('raw_image' | 'raw_textbox' | 'shape')[] = ['raw_image', 'raw_textbox', 'shape'];

interface AddModeSpreadThumbnailProps {
  spread: BaseSpread;
  spreadIndex: number;
  isSelectable: boolean;
  isSelected: boolean;
  onToggle: () => void;
  renderImageItem?: (ctx: ImageItemContext<BaseSpread>) => ReactNode;
  renderTextItem?: (ctx: TextItemContext<BaseSpread>) => ReactNode;
  renderShapeItem?: (ctx: ShapeItemContext<BaseSpread>) => ReactNode;
}

export function AddModeSpreadThumbnail({
  spread,
  spreadIndex,
  isSelectable,
  isSelected,
  onToggle,
  renderImageItem,
  renderTextItem,
  renderShapeItem,
}: AddModeSpreadThumbnailProps) {
  const handleToggle = () => {
    if (!isSelectable) return;
    log.debug('AddModeSpreadThumbnail', 'toggled', { spreadId: spread.id, isSelected });
    onToggle();
  };

  return (
    <div
      className={cn(
        'relative pt-10',
        !isSelectable && 'opacity-50',
        isSelected && 'ring-2 ring-blue-500 rounded-md',
      )}
    >
      <SpreadThumbnail
        spread={spread}
        spreadIndex={spreadIndex}
        isSelected={false}
        size="medium"
        renderItems={RENDER_ITEMS}
        renderImageItem={renderImageItem}
        renderTextItem={renderTextItem}
        renderShapeItem={renderShapeItem}
        onClick={handleToggle}
      />

      {/* Checkbox overlay at top-left */}
      <div
        className={cn(
          'absolute top-11 left-1 z-20',
          !isSelectable && 'pointer-events-none',
        )}
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
      >
        <div
          className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors',
            isSelected
              ? 'bg-blue-500 border-blue-500 text-white'
              : 'bg-white border-gray-300 hover:border-blue-400',
            !isSelectable && 'pointer-events-none',
          )}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}

export default AddModeSpreadThumbnail;
