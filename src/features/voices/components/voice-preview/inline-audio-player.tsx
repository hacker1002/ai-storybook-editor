import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/features/voices/utils/format-duration';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// InlineAudioPlayer — custom-UI audio player for voice previews.
// Single-active-player rule enforced by parent via `isActive` prop.
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('VoicePreview', 'InlineAudioPlayer');

export interface InlineAudioPlayerProps {
  src: string;
  isActive: boolean;
  onPlayStart: () => void;
  /**
   * Increment to request playback (one-shot). Each new value triggers play().
   * Use 0/undefined to mean "no auto-play". Resilient to identical src reuse.
   */
  autoPlayKey?: number;
  /** Extra classes merged onto the outer container (e.g. `border-0`, `px-0`). */
  className?: string;
}

function getUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '<invalid-url>';
  }
}

export function InlineAudioPlayer({ src, isActive, onPlayStart, autoPlayKey, className }: InlineAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    log.info('mount', 'init audio', { host: getUrlHost(src) });
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!isActive && isPlaying) {
      log.debug('isActive:false', 'auto-pause');
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isActive, isPlaying]);

  useEffect(() => {
    if (!autoPlayKey) {
      log.debug('autoPlay', 'no token, skip', { autoPlayKey });
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      log.warn('autoPlay', 'audioRef missing at trigger', { autoPlayKey });
      return;
    }
    log.info('autoPlay', 'parent triggered playback', { autoPlayKey, host: getUrlHost(src) });
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        log.warn('autoPlay', 'play() rejected', { err: String(err) });
        setIsPlaying(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayKey]);

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
    <div className={cn('flex items-center gap-3 rounded-md border px-3 py-2 bg-background', className)}>
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
