import { Check } from 'lucide-react';
import { cn } from '@/utils/utils';
import { InlineAudioPlayer } from '@/components/audio/inline-audio-player';
import type { MusicGenerationResult } from './generate-music-modal-types';

export interface GenerateMusicAuditionProps {
  result: MusicGenerationResult;
  disabled?: boolean;
}

const noop = () => {};

export function GenerateMusicAudition({ result, disabled }: GenerateMusicAuditionProps) {
  const formatLabel = result.mediaType === 'audio/mpeg' ? 'MP3' : 'WAV';

  return (
    <div
      role="group"
      aria-label="Generated music result"
      className={cn(
        'rounded-md p-3 space-y-2 bg-primary/5 border border-primary/20',
        disabled && 'opacity-60 pointer-events-none',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded border border-primary bg-primary/20 text-primary"
          >
            <Check className="h-3 w-3" />
          </span>
          <span className="text-sm font-medium">Result 1</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{formatLabel}</span>
      </div>
      <InlineAudioPlayer
        src={result.musicUrl}
        isActive
        onPlayStart={noop}
        className="border-0 bg-transparent px-0 py-0"
      />
    </div>
  );
}
