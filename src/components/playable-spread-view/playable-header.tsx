// playable-header.tsx - Header toolbar for PlayableSpreadView
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { PlayableHeaderProps } from './types';
import { PLAY_MODE_CYCLE } from './constants';

/**
 * PlayableHeader Component
 *
 * Header toolbar with three sections:
 * - Left: PlayMode toggle (custom SVG switch)
 * - Center: Player controls (skip prev, play/pause, skip next)
 * - Right: Volume controls (slider + mute button)
 */
export function PlayableHeader({
  playMode,
  isPlaying,
  volume,
  isMuted,
  hasPrevious,
  hasNext,
  playDisabled,
  onPlayModeChange,
  onPlayToggle,
  onSkipPrevious,
  onSkipNext,
  onVolumeChange,
  onMuteToggle,
}: PlayableHeaderProps) {
  const handleModeClick = () => {
    const currentIndex = PLAY_MODE_CYCLE.indexOf(playMode);
    const nextIndex = (currentIndex + 1) % PLAY_MODE_CYCLE.length;
    onPlayModeChange(PLAY_MODE_CYCLE[nextIndex]);
  };

  const handleVolumeChange = (values: number[]) => {
    const newVolume = values[0];
    if (newVolume > 0 && isMuted) {
      onMuteToggle();
    }
    onVolumeChange(newVolume);
  };

  // Circle fill states: off=both empty, semi-auto=left filled, auto=both filled
  const leftFilled = playMode !== 'off';
  const rightFilled = playMode === 'auto';
  const modeLabel = playMode === 'semi-auto' ? 'Semi-auto' : playMode === 'auto' ? 'Auto' : 'Off';

  return (
    <div
      className="h-14 px-4 flex items-center justify-between border-b bg-background"
      role="toolbar"
      aria-label="Playback controls"
    >
      {/* Left: PlayMode Toggle */}
      <div className="flex items-center w-32">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleModeClick}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-secondary"
              aria-label={`Play mode: ${modeLabel}. Click to cycle.`}
            >
              <svg width="24" height="14" viewBox="0 0 24 14" className="flex-shrink-0">
                {/* Pill outline */}
                <rect
                  x="1"
                  y="1"
                  width="22"
                  height="12"
                  rx="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-muted-foreground"
                />
                {/* Left circle */}
                <circle
                  cx="7"
                  cy="7"
                  r="3"
                  fill={leftFilled ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1"
                  className={leftFilled ? 'text-primary' : 'text-muted-foreground/30'}
                />
                {/* Divider */}
                <line
                  x1="12"
                  y1="3"
                  x2="12"
                  y2="11"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-muted-foreground/30"
                />
                {/* Right circle */}
                <circle
                  cx="17"
                  cy="7"
                  r="3"
                  fill={rightFilled ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1"
                  className={rightFilled ? 'text-primary' : 'text-muted-foreground/30'}
                />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Play mode: {modeLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Center: Player Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onSkipPrevious}
          disabled={!hasPrevious}
          aria-label="Previous spread"
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          className="h-10 w-10 rounded-lg"
          onClick={onPlayToggle}
          disabled={playDisabled && !isPlaying}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onSkipNext}
          disabled={!hasNext}
          aria-label="Next spread"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Volume Controls */}
      <div className="flex items-center gap-2 w-32 justify-end">
        <Slider
          value={[isMuted ? 0 : volume]}
          min={0}
          max={100}
          step={1}
          onValueChange={handleVolumeChange}
          className="w-24"
          aria-label="Volume"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onMuteToggle}
          aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
