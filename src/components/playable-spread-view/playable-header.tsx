// playable-header.tsx - Floating play/stop button for PlayableSpreadView
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';
import type { PlayableHeaderProps } from './types';

export function PlayableHeader({ activeCanvas, playMode, onPlay, onStop }: PlayableHeaderProps) {
  const isPlayerActive = activeCanvas === 'player';

  return (
    <div className="absolute top-2 right-2 z-10">
      {isPlayerActive ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-secondary"
          onClick={onStop}
          aria-label="Stop playback"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-secondary"
          onClick={onPlay}
          disabled={playMode === 'off'}
          aria-label="Play"
        >
          <Play className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
