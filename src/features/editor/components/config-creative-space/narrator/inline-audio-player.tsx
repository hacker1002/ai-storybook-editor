import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/features/voices/utils/format-duration';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// InlineAudioPlayer — custom-UI audio player for narrator previews.
//
// Design decisions (Phase 04 / Validation S1):
// - NOT using native <audio controls>. Uses `new Audio(src)` pattern (parity
//   with `useVoiceAudioPlayer`). Circular Play/Pause + linear scrubber + M:SS
//   + volume popover with HORIZONTAL slider (trade-off approved S1).
// - Volume is session-only (no persistence). Default 1.0.
// - `isActive=false` while playing → auto-pause (parent enforces single-active
//   player rule across the panel).
// - On `ended`: scrubber resets to 0:00 and icon returns to Play. Player stays
//   mounted (not removed from DOM).
// - On `src` change: full reset (new Audio, listeners re-bound). Old audio
//   cleaned up by effect's teardown.
// - Audio URL PII: never log full URL at INFO. Log `host` only for debug.
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('ConfigNarrator', 'InlineAudioPlayer');

export interface InlineAudioPlayerProps {
  src: string;
  isActive: boolean;
  onPlayStart: () => void;
}

function getUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '<invalid-url>';
  }
}

export function InlineAudioPlayer({ src, isActive, onPlayStart }: InlineAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // ── Bind audio lifecycle to `src` ─────────────────────────────────────────
  useEffect(() => {
    log.info('mount', 'init audio', { host: getUrlHost(src) });
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;

    // Reset UI state for new source.
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handleEnded = () => {
      log.debug('ended', 'playback finished');
      audio.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    };
    const handleError = () => {
      log.warn('error', 'audio error event', { host: getUrlHost(src) });
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Apply current volume.
    audio.volume = volume;

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      audioRef.current = null;
    };
    // `volume` intentionally excluded — volume changes are applied via the
    // volume-sync effect below; including here would re-create the audio
    // element on every volume tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ── Sync volume without re-initializing audio ─────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // ── External pause: when parent deactivates this player ──────────────────
  useEffect(() => {
    if (!isActive && isPlaying) {
      log.debug('isActive:false', 'auto-pause');
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isActive, isPlaying]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      log.debug('togglePlay', 'pause');
      audio.pause();
      setIsPlaying(false);
      return;
    }
    log.debug('togglePlay', 'play');
    // Notify parent BEFORE play so it can stop other active players first.
    onPlayStart();
    audio
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((err) => {
        log.warn('play', 'play() rejected', { err: String(err) });
        setIsPlaying(false);
      });
  }, [isPlaying, onPlayStart]);

  const handleSeek = useCallback((values: number[]) => {
    const audio = audioRef.current;
    const next = values[0] ?? 0;
    log.debug('seek', 'user scrubbed', { to: next });
    if (audio) {
      audio.currentTime = next;
    }
    setCurrentTime(next);
  }, []);

  const handleVolumeChange = useCallback((values: number[]) => {
    const next = values[0] ?? 1;
    setVolume(next);
  }, []);

  const sliderMax = duration > 0 ? duration : 1;

  return (
    <div className={cn('flex items-center gap-3 rounded-md border px-3 py-2 bg-background')}>
      <Button
        type="button"
        variant="default"
        size="icon"
        onClick={handleTogglePlay}
        className="h-8 w-8 shrink-0 rounded-full"
        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 pl-0.5" />}
      </Button>

      <Slider
        value={[currentTime]}
        min={0}
        max={sliderMax}
        step={0.05}
        onValueChange={handleSeek}
        className="flex-1"
        aria-label="Audio progress"
        disabled={duration <= 0}
      />

      <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {formatDuration(currentTime)} / {formatDuration(duration)}
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Volume"
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-48 p-3">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              value={[volume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={handleVolumeChange}
              aria-label="Volume level"
              className="flex-1"
            />
            <span className="text-xs tabular-nums w-8 text-right text-muted-foreground">
              {Math.round(volume * 100)}
            </span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
