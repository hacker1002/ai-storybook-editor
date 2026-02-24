// new-spread-button.tsx
'use client';

import { useState } from 'react';
import { Plus, BookOpen, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CANVAS, THUMBNAIL } from './constants';

export type SpreadType = 'double' | 'single';

interface NewSpreadButtonProps {
  size: 'small' | 'medium';
  onAdd: (type: SpreadType) => void;
}

export function NewSpreadButton({ size, onAdd }: NewSpreadButtonProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (type: SpreadType) => {
    onAdd(type);
    setOpen(false);
  };

  return (
    <div className={cn('flex-shrink-0', size === 'medium' && 'w-full')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex flex-col items-center justify-center w-full',
              'rounded-md border-2 border-dashed border-gray-300',
              'hover:border-blue-400 hover:bg-blue-50 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              'cursor-pointer',
            )}
            style={{
              ...(size === 'small' && {
                width: THUMBNAIL.SMALL_SIZE.width,
                height: THUMBNAIL.SMALL_SIZE.height,
              }),
              ...(size === 'medium' && {
                aspectRatio: `${CANVAS.ASPECT_RATIO}`,
              }),
            }}
            aria-label="Add new spread"
          >
            <Plus className="h-6 w-6 text-gray-400" />
            <span className="text-xs text-gray-500 mt-1">Add Spread</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start">
          <button
            type="button"
            onClick={() => handleSelect('double')}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded',
              'hover:bg-accent hover:text-accent-foreground transition-colors',
            )}
          >
            <BookOpen className="h-4 w-4" />
            Double Spread
          </button>
          <button
            type="button"
            onClick={() => handleSelect('single')}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded',
              'hover:bg-accent hover:text-accent-foreground transition-colors',
            )}
          >
            <FileText className="h-4 w-4" />
            Single Spread
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default NewSpreadButton;
