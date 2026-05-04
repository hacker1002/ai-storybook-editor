import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/utils';
import type { PreviewCandidate } from '@/apis/voice-api';
import { createLogger } from '@/utils/logger';
import { formatDuration } from '@/utils/format-duration';

const log = createLogger('Voices', 'PromptVoiceAudition');

interface PromptVoiceAuditionProps {
  previewText: string;
  previews: PreviewCandidate[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  disabled?: boolean;
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-4 w-4 items-center justify-center rounded-full border',
        selected ? 'border-primary' : 'border-muted-foreground/50'
      )}
    >
      {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

export function PromptVoiceAudition({
  previewText,
  previews,
  selectedIndex,
  onSelect,
  disabled,
}: PromptVoiceAuditionProps) {
  const audioRefsMap = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    log.info('mount', 'rendered audition', { previewCount: previews.length });
    const refs = audioRefsMap.current;
    return () => {
      for (const el of refs.values()) {
        try {
          el.pause();
        } catch {
          // noop
        }
      }
    };
  }, [previews.length]);

  const handlePlay = (id: string) => {
    log.debug('handlePlay', 'play', { id });
    for (const [otherId, el] of audioRefsMap.current.entries()) {
      if (otherId !== id && !el.paused) {
        try {
          el.pause();
        } catch {
          // noop
        }
      }
    }
    setPlayingVoiceId(id);
  };

  const handlePause = (id: string) => {
    log.debug('handlePause', 'pause', { id });
    setPlayingVoiceId((prev) => (prev === id ? null : prev));
  };

  const handleSelect = (index: number) => {
    if (disabled) return;
    log.info('onSelect', 'user selected preview', { index });
    onSelect(index);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Preview text</p>
        <p className="text-sm italic line-clamp-3">&ldquo;{previewText}&rdquo;</p>
      </div>

      <div
        role="radiogroup"
        aria-label="Voice previews"
        className="space-y-2"
      >
        {previews.map((preview, i) => {
          const isSelected = selectedIndex === i;
          return (
            <div
              key={preview.generatedVoiceId}
              role="radio"
              aria-checked={isSelected}
              aria-label={`Result ${i + 1}, ${Math.round(preview.durationSecs)} seconds`}
              tabIndex={disabled ? -1 : 0}
              onClick={() => handleSelect(i)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleSelect(i);
                }
              }}
              className={cn(
                'rounded-md border p-3 cursor-pointer transition outline-none',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-foreground/30',
                'focus-visible:ring-2 focus-visible:ring-ring',
                disabled && 'opacity-60 pointer-events-none'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <RadioDot selected={isSelected} />
                  <span className="text-sm font-medium">Result {i + 1}</span>
                  {playingVoiceId === preview.generatedVoiceId ? (
                    <span className="text-xs text-primary">Playing</span>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDuration(preview.durationSecs)}
                </span>
              </div>
              <audio
                ref={(el) => {
                  if (el) {
                    audioRefsMap.current.set(preview.generatedVoiceId, el);
                  } else {
                    audioRefsMap.current.delete(preview.generatedVoiceId);
                  }
                }}
                src={`data:${preview.mediaType};base64,${preview.audioBase64}`}
                controls
                preload="metadata"
                className="w-full"
                onPlay={() => handlePlay(preview.generatedVoiceId)}
                onPause={() => handlePause(preview.generatedVoiceId)}
                onEnded={() => handlePause(preview.generatedVoiceId)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Result ${i + 1} audio preview`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
