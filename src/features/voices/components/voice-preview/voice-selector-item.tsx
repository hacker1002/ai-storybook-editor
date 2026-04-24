import { Check } from 'lucide-react';

import { getAgeLabel, getGenderLabel } from '@/features/voices/utils/voice-labels';
import type { Voice } from '@/types/voice';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';

const log = createLogger('VoicePreview', 'VoiceSelectorItem');

// ─────────────────────────────────────────────────────────────────────────────
// VoiceSelectorItem — one row inside VoiceSelector popover.
// Pure presentation; parent owns selection + highlight state.
// ─────────────────────────────────────────────────────────────────────────────

export interface VoiceSelectorItemProps {
  voice: Voice;
  isSelected: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}

function buildMetadataLine(voice: Voice): string {
  const parts = [
    getGenderLabel(voice.gender),
    getAgeLabel(voice.age),
    voice.accent,
  ]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0 && p !== 'Unknown');
  return parts.join(' · ');
}

export function VoiceSelectorItem({
  voice,
  isSelected,
  isHighlighted = false,
  onClick,
  onMouseEnter,
}: VoiceSelectorItemProps) {
  const metadata = buildMetadataLine(voice);
  const hasTags = !!voice.tags && voice.tags.trim().length > 0;

  const handleClick = () => {
    log.debug('handleClick', 'item click', { voiceId: voice.id, isSelected });
    onClick();
  };

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full text-left px-3 py-2 rounded-sm outline-none transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:bg-accent focus-visible:text-accent-foreground',
        isHighlighted && 'bg-accent text-accent-foreground',
        isSelected && 'bg-primary/5',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">{voice.name}</span>
          {isSelected ? (
            <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          ) : null}
        </div>
        {metadata.length > 0 ? (
          <span className="text-xs text-muted-foreground">{metadata}</span>
        ) : null}
        {hasTags ? (
          <span className="text-xs text-muted-foreground line-clamp-1">{voice.tags}</span>
        ) : null}
      </div>
    </button>
  );
}
