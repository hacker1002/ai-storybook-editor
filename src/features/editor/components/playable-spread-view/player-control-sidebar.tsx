'use client';

// player-control-sidebar.tsx - Vertical sidebar with auto mode toggle, player controls, and volume controls

import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { PlayMode } from '@/types/playable-types';
import {
  usePlayMode,
  useIsPlaying,
  usePlaybackActions,
} from '@/stores/animation-playback-store';

interface PlayerControlSidebarProps {
  onPlayModeChange: (mode: PlayMode) => void;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  canBack: boolean;
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

  // Toggle auto mode: off ↔ auto
  const isAutoMode = playMode === 'auto';

  function handleAutoToggle() {
    const nextMode: PlayMode = isAutoMode ? 'off' : 'auto';
    onPlayModeChange(nextMode);
  }

  // Back/Next visible only in manual (off) mode
  const showManualNav = playMode === 'off';

  return (
    <div
      role="toolbar"
      aria-label="Player controls"
      aria-orientation="vertical"
      className="absolute right-0 top-0 bottom-0 w-14 flex flex-col items-center justify-between py-4 bg-white border-l border-border z-10"
    >
      {/* Top section — Auto Mode Toggle */}
      <div className="flex flex-col items-center gap-1">
        <span className={`text-xs font-medium ${isAutoMode ? 'text-foreground' : 'text-muted-foreground'}`}>
          Auto
        </span>
        <Switch
          checked={isAutoMode}
          onCheckedChange={handleAutoToggle}
          aria-label={`Auto play: ${isAutoMode ? 'on' : 'off'}`}
        />
      </div>

      {/* Middle section — Player Controls (Back, Play/Pause, Forward) */}
      <div className="flex flex-col items-center gap-1">
        {/* Back button — only visible in manual (off) mode */}
        {showManualNav && (
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

        {/* Play / Pause button — always enabled */}
        <button
          type="button"
          onClick={() => (isPlaying ? playbackActions.pause() : playbackActions.play())}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* Forward button — only visible in manual (off) mode */}
        {showManualNav && (
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
