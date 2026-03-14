'use client';

// player-control-sidebar.tsx - Vertical sidebar with play mode toggle, player controls, and volume controls

import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import type { PlayerControlSidebarProps, PlayMode } from './types';
import { PLAY_MODE_CYCLE } from './constants';
import {
  usePlayMode,
  useIsPlaying,
  usePlaybackActions,
} from '@/stores/animation-playback-store';

// === PlayModeIcon — pill SVG with 2 circles indicating current play mode ===

function PlayModeIcon({ mode }: { mode: PlayMode }) {
  if (mode === 'auto') {
    return (
      <svg width="24" height="14" viewBox="0 0 24 14" className="flex-shrink-0">
        <rect x="1" y="1" width="22" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
        <rect x="2" y="2" width="10" height="10" rx="5" fill="currentColor" className="text-primary" />
        <rect x="12" y="2" width="10" height="10" rx="5" fill="currentColor" className="text-primary" />
        <line x1="12" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1" className="text-primary-foreground" />
      </svg>
    );
  }
  if (mode === 'semi-auto') {
    return (
      <svg width="24" height="14" viewBox="0 0 24 14" className="flex-shrink-0">
        <rect x="1" y="1" width="22" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
        <rect x="2" y="2" width="10" height="10" rx="5" fill="currentColor" className="text-primary" />
        <line x1="12" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1" className="text-primary-foreground" />
      </svg>
    );
  }
  // off
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" className="flex-shrink-0">
      <rect x="1" y="1" width="22" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
      <line x1="12" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1" className="text-muted-foreground" />
    </svg>
  );
}

// === PlayerControlSidebar — main export ===

export function PlayerControlSidebar({
  onPlayModeChange,
  onNext,
  onBack,
  canNext,
  canBack,
}: PlayerControlSidebarProps) {
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const playbackActions = usePlaybackActions();

  // Cycle play mode: off → semi-auto → auto → off
  function handlePlayModeClick() {
    const currentIndex = PLAY_MODE_CYCLE.indexOf(playMode);
    const nextMode = PLAY_MODE_CYCLE[(currentIndex + 1) % PLAY_MODE_CYCLE.length];
    onPlayModeChange(nextMode);
  }

  return (
    <div
      role="toolbar"
      aria-label="Player controls"
      aria-orientation="vertical"
      className="absolute right-0 top-0 bottom-0 w-14 flex flex-col items-center justify-between py-4 bg-white border-l border-border z-10"
    >
      {/* Top section — Play Mode Toggle */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={handlePlayModeClick}
          aria-label={`Play mode: ${playMode}`}
          title={`Play mode: ${playMode === 'off' ? 'Off' : playMode === 'semi-auto' ? 'Semi-auto' : 'Auto'}`}
          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
        >
          <PlayModeIcon mode={playMode} />
        </button>
      </div>

      {/* Middle section — Player Controls (Back, Play/Pause, Forward) */}
      <div className="flex flex-col items-center gap-1">
        {/* Back button — only visible in semi-auto mode */}
        {playMode === 'semi-auto' && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            disabled={!canBack}
            className={`
              flex items-center justify-center w-8 h-8 rounded-md transition-colors
              text-foreground hover:bg-accent
              ${!canBack ? 'opacity-30 pointer-events-none' : ''}
            `}
          >
            <SkipBack size={18} />
          </button>
        )}

        {/* Play / Pause button — primary blue style */}
        <button
          type="button"
          onClick={() => (isPlaying ? playbackActions.pause() : playbackActions.play())}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={playMode === 'off'}
          className={`
            flex items-center justify-center w-10 h-10 rounded-lg transition-colors
            bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm
            ${playMode === 'off' ? 'opacity-30 pointer-events-none' : ''}
          `}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* Forward button — only visible in semi-auto mode */}
        {playMode === 'semi-auto' && (
          <button
            type="button"
            onClick={onNext}
            aria-label="Forward"
            disabled={!canNext}
            className={`
              flex items-center justify-center w-8 h-8 rounded-md transition-colors
              text-foreground hover:bg-accent
              ${!canNext ? 'opacity-30 pointer-events-none' : ''}
            `}
          >
            <SkipForward size={18} />
          </button>
        )}
      </div>

      {/* Bottom spacer */}
      <div />
    </div>
  );
}
