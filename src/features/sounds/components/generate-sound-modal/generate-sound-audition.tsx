import { cn } from '@/utils/utils';
import { InlineAudioPlayer } from '@/components/audio/inline-audio-player';
import type { SoundGenerationResult } from './generate-sound-modal-types';

interface GenerateSoundAuditionProps {
  result: SoundGenerationResult;
  disabled?: boolean;
}

const noop = () => {};

export function GenerateSoundAudition({ result, disabled }: GenerateSoundAuditionProps) {
  const formatLabel = result.mediaType === 'audio/mpeg' ? 'MP3' : 'WAV';

  return (
    <div
      role="group"
      aria-label="Generated result"
      className={cn(
        'rounded-md p-3 space-y-2 bg-primary/5 border border-primary/20',
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Result</span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatLabel}</span>
      </div>
      <InlineAudioPlayer
        src={result.soundUrl}
        isActive
        onPlayStart={noop}
        className="border-0 bg-transparent px-0 py-0"
      />
    </div>
  );
}
