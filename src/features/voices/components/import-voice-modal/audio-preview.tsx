import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'AudioPreview');

type AudioState = 'loading' | 'ready' | 'playing' | 'paused' | 'error';

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '--:--';
  const total = Math.floor(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPreviewProps {
  url: string;
}

// Outer wrapper keys by `url` so state resets naturally on URL change without
// setState calls inside effects (avoids react-hooks/set-state-in-effect).
export function AudioPreview({ url }: AudioPreviewProps) {
  return <AudioPreviewInner key={url} url={url} />;
}

function AudioPreviewInner({ url }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>('loading');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onLoaded = () => {
      log.debug('audio:state-change', 'state', { next: 'ready' });
      setDuration(audio.duration);
      setState('ready');
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      log.debug('audio:state-change', 'state', { next: 'paused-end' });
      setCurrentTime(0);
      setState('paused');
    };
    const onError = () => {
      log.warn('audio:state-change', 'state', { next: 'error', hasUrl: Boolean(url) });
      setState('error');
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.src = '';
      audioRef.current = null;
    };
  }, [url]);

  const handleToggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state === 'ready' || state === 'paused') {
      log.debug('audio:state-change', 'state', { next: 'playing' });
      audio.play().catch((err) => {
        log.warn('play rejected', 'err', {
          name: (err as { name?: string } | null)?.name,
        });
        setState('error');
      });
      setState('playing');
    } else if (state === 'playing') {
      log.debug('audio:state-change', 'state', { next: 'paused' });
      audio.pause();
      setState('paused');
    }
  };

  if (state === 'error') {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        ⚠ Preview unavailable
      </p>
    );
  }

  if (state === 'loading') {
    return (
      <Button disabled variant="outline" size="sm" className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </Button>
    );
  }

  const isPlaying = state === 'playing';
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleToggle}
        aria-label={isPlaying ? 'Stop preview' : 'Preview voice sample'}
        className="gap-2"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isPlaying ? 'Stop' : 'Preview audio'}
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {isPlaying
          ? `${formatTime(currentTime)} / ${formatTime(duration)}`
          : formatTime(duration)}
      </span>
    </div>
  );
}
