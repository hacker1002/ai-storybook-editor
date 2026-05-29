// take-back-overlay.tsx — R5 affordance for an owned-foreign crop in the
// Batches AFTER pane. Top-right hover/focus icon button that triggers
// `takeFinalBack(remixId, spreadId, layerId, currentBatchId)` via a caller-
// supplied handler. Mutex with the rev6 selection checkbox (only one renders
// top-right based on ownership state — wired in `composed-crop-sheet.tsx`).
//
// a11y: focus-visible ring, aria-label describing the destination batch.
// Idle state hides the chip via opacity AND pointer-events-none so the crop
// remains zoom-/pan-clickable through the wrapper. group-hover /
// focus-within (on the parent wrapper) makes it interactive again.

import { ArrowDownLeft } from 'lucide-react';
import { cn } from '@/utils/utils';

interface TakeBackOverlayProps {
  cropKey: string;
  ownerBatchName: string;
  disabled?: boolean;
  onTakeBack: (cropKey: string) => void;
}

export function TakeBackOverlay({
  cropKey,
  ownerBatchName,
  disabled = false,
  onTakeBack,
}: TakeBackOverlayProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onTakeBack(cropKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onTakeBack(cropKey);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      title={`Final is in ${ownerBatchName} — bring it back to this batch`}
      aria-label={`Take this crop back from ${ownerBatchName} to the current batch`}
      style={{ padding: 2 }}
      className={cn(
        'absolute right-1 top-1 z-30 flex h-[28px] w-[28px]',
        'items-center justify-center rounded-md shadow-sm',
        'border-2 border-white/80 bg-black/70 text-white backdrop-blur-sm',
        'opacity-0 transition-opacity duration-150',
        'group-hover:opacity-100 group-focus-within:opacity-100',
        'pointer-events-none',
        'group-hover:pointer-events-auto group-focus-within:pointer-events-auto',
        'focus-visible:opacity-100 focus-visible:pointer-events-auto',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6cf6]',
        'hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
