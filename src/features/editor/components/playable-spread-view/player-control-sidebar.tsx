'use client';

// player-control-sidebar.tsx - Player controls: auto mode toggle, nav buttons, volume.
// Supports vertical sidebar (landscape) and horizontal bottom bar (portrait).

import { SkipBack, SkipForward, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { PlayMode } from '@/types/playable-types';
import type { PlayerOrientation } from './hooks/use-player-orientation';
import {
  usePlayMode,
  useIsPlaying,
  useVolume,
  useIsMuted,
  usePlaybackActions,
} from '@/stores/animation-playback-store';

interface PlayerControlSidebarProps {
  onPlayModeChange: (mode: PlayMode) => void;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  canBack: boolean;
  orientation?: PlayerOrientation;
}

// === PlayerControlSidebar — main export ===

export function PlayerControlSidebar({
  onPlayModeChange,
  onNext,
  onBack,
  canNext,
  canBack,
  orientation = 'landscape',
}: PlayerControlSidebarProps) {
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const volume = useVolume();
  const isMuted = useIsMuted();
  const playbackActions = usePlaybackActions();

  // Toggle auto mode: off <-> auto
  const isAutoMode = playMode === 'auto';

  function handleAutoToggle() {
    const nextMode: PlayMode = isAutoMode ? 'off' : 'auto';
    onPlayModeChange(nextMode);
  }

  // Back/Next visible only in manual (off) mode
  const showManualNav = playMode === 'off';

  if (orientation === 'portrait') {
    return (
      <div
        role="toolbar"
        aria-label="Player controls"
        aria-orientation="horizontal"
        className="absolute bottom-0 left-0 right-0 min-h-14 flex items-center justify-between px-4 pb-[env(safe-area-inset-bottom,0px)] bg-white border-t border-border z-10"
      >
        {/* Left: Auto Mode Toggle */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isAutoMode ? 'text-foreground' : 'text-muted-foreground'}`}>
            Auto
          </span>
          <Switch
            checked={isAutoMode}
            onCheckedChange={handleAutoToggle}
            aria-label={`Auto play: ${isAutoMode ? 'on' : 'off'}`}
          />
        </div>

        {/* Center: Nav Controls */}
        <div className="flex items-center gap-1">
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

          {isAutoMode && (
            <button
              type="button"
              onClick={() => (isPlaying ? playbackActions.pause() : playbackActions.play())}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
          )}

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

        {/* Right: Volume Controls (horizontal) */}
        <div className="flex items-center gap-2">
          <Slider
            orientation="horizontal"
            min={0}
            max={100}
            step={1}
            value={[isMuted ? 0 : volume]}
            onValueChange={([v]) => playbackActions.setVolume(v)}
            aria-label="Volume"
            className="w-20"
          />
          <button
            type="button"
            onClick={() => playbackActions.toggleMute()}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>
    );
  }

  // Landscape: vertical sidebar on right (original layout)
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

        {/* Play / Pause button — only visible in auto mode */}
        {isAutoMode && (
          <button
            type="button"
            onClick={() => (isPlaying ? playbackActions.pause() : playbackActions.play())}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
        )}

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

      {/* Bottom section — Volume Controls */}
      <div className="flex flex-col items-center gap-2">
        <div className="h-20">
          <Slider
            orientation="vertical"
            min={0}
            max={100}
            step={1}
            value={[isMuted ? 0 : volume]}
            onValueChange={([v]) => playbackActions.setVolume(v)}
            aria-label="Volume"
            className="h-full"
          />
        </div>
        <button
          type="button"
          onClick={() => playbackActions.toggleMute()}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  );
}
