// new-spread-button.tsx
'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THUMBNAIL } from './constants';

interface NewSpreadButtonProps {
  size: 'small' | 'medium';
  onClick: () => void;
}

export function NewSpreadButton({ size, onClick }: NewSpreadButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-shrink-0 flex flex-col items-center justify-center',
        'rounded-md border-2 border-dashed border-gray-300',
        'hover:border-blue-400 hover:bg-blue-50 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        'cursor-pointer',
      )}
      style={{
        width: size === 'small' ? THUMBNAIL.SMALL_SIZE.width : 150,
        height: size === 'small' ? THUMBNAIL.SMALL_SIZE.height : 100,
      }}
      aria-label="Add new spread"
    >
      <Plus className="h-6 w-6 text-gray-400" />
      <span className="text-xs text-gray-500 mt-1">Add Spread</span>
    </button>
  );
}

export default NewSpreadButton;
