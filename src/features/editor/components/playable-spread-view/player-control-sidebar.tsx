'use client';

// player-control-sidebar.tsx - Player controls: auto mode toggle, nav buttons, settings gear.
// Supports vertical sidebar (landscape) and horizontal bottom bar (portrait).

import { useState } from 'react';
import { SkipBack, SkipForward, Play, Pause, Settings, Volume2, VolumeX } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { PlayMode, PlayEdition } from '@/types/playable-types';
import type { PlayerOrientation } from './hooks/use-player-orientation';
import { AVAILABLE_LANGUAGES } from '@/constants/editor-constants';
import {
  usePlayMode,
  useIsPlaying,
  useVolume,
  useIsMuted,
  usePlaybackActions,
  useNarrationLanguage,
  useQuizLanguage,
} from '@/stores/animation-playback-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'PlayerControlSidebar');

// === Constants ===

const EDITION_OPTIONS: { value: PlayEdition; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'interactive', label: 'Interactive' },
];

// === Props ===

interface PlayerControlSidebarProps {
  onPlayModeChange: (mode: PlayMode) => void;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  canBack: boolean;
  orientation?: PlayerOrientation;
  playEdition: PlayEdition;
  onEditionChange: (edition: PlayEdition) => void;
  availableEditions?: { classic?: boolean; dynamic?: boolean; interactive?: boolean };
  availableLanguages?: { name: string; code: string }[];
}

// === PlayerControlSidebar — main export ===

export function PlayerControlSidebar({
  onPlayModeChange,
  onNext,
  onBack,
  canNext,
  canBack,
  orientation = 'landscape',
  playEdition,
  onEditionChange,
  availableEditions,
  availableLanguages,
}: PlayerControlSidebarProps) {
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const playbackActions = usePlaybackActions();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Toggle auto mode: off <-> auto
  const isAutoMode = playMode === 'auto';

  function handleAutoToggle() {
    const nextMode: PlayMode = isAutoMode ? 'off' : 'auto';
    onPlayModeChange(nextMode);
  }

  // Back/Next visible only in manual (off) mode
  const showManualNav = playMode === 'off';

  // Settings modal content (shared between portrait & landscape)
  const settingsModal = (
    <SettingsModalContent
      playEdition={playEdition}
      onEditionChange={onEditionChange}
      availableEditions={availableEditions}
      availableLanguages={availableLanguages}
    />
  );

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

        {/* Right: Settings Button */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Player settings"
              className="flex items-center justify-center w-8 h-8 rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Settings size={18} />
            </button>
          </DialogTrigger>
          {settingsModal}
        </Dialog>
      </div>
    );
  }

  // Landscape: vertical sidebar on right
  return (
    <div
      role="toolbar"
      aria-label="Player controls"
      aria-orientation="vertical"
      className="absolute right-0 top-0 bottom-0 w-14 flex flex-col items-center justify-between py-4 bg-white border-l border-border z-10"
    >
      {/* Top section — Settings Button */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Player settings"
            className="flex items-center justify-center w-8 h-8 rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings size={18} />
          </button>
        </DialogTrigger>
        {settingsModal}
      </Dialog>

      {/* Middle section — Player Controls (Back, Play/Pause, Forward) */}
      <div className="flex flex-col items-center gap-1">
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

      {/* Bottom section — Auto Mode Toggle */}
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
    </div>
  );
}

// === Settings Modal Content (extracted for reuse between layouts) ===

interface SettingsModalContentProps {
  playEdition: PlayEdition;
  onEditionChange: (edition: PlayEdition) => void;
  availableEditions?: { classic?: boolean; dynamic?: boolean; interactive?: boolean };
  availableLanguages?: { name: string; code: string }[];
}

function SettingsModalContent({
  playEdition,
  onEditionChange,
  availableEditions,
  availableLanguages,
}: SettingsModalContentProps) {
  const narrationLanguage = useNarrationLanguage();
  const quizLanguage = useQuizLanguage();
  const volume = useVolume();
  const isMuted = useIsMuted();
  const playbackActions = usePlaybackActions();

  const filteredEditions = availableEditions
    ? EDITION_OPTIONS.filter((opt) => availableEditions[opt.value] === true)
    : EDITION_OPTIONS;

  const editionDisabled = filteredEditions.length <= 1;
  const languageOptions = availableLanguages ?? AVAILABLE_LANGUAGES;

  const handleNarrationLanguageChange = (code: string) => {
    log.info('handleNarrationLanguageChange', 'narration language changed', { code });
    playbackActions.setNarrationLanguage(code);
  };

  const handleQuizLanguageChange = (code: string) => {
    log.info('handleQuizLanguageChange', 'quiz language changed', { code });
    playbackActions.setQuizLanguage(code);
  };

  return (
    <DialogContent className="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Player Settings</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4 pt-2">
        {/* Edition */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-edition" className="text-sm font-medium">Edition</label>
          <Select
            value={playEdition}
            onValueChange={(v) => onEditionChange(v as PlayEdition)}
            disabled={editionDisabled}
          >
            <SelectTrigger aria-label="Select play edition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filteredEditions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Narration Language */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-narration-language" className="text-sm font-medium">Narration Language</label>
          <Select value={narrationLanguage} onValueChange={handleNarrationLanguageChange}>
            <SelectTrigger aria-label="Select narration language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quiz Language */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-quiz-language" className="text-sm font-medium">Quiz Language</label>
          <Select value={quizLanguage} onValueChange={handleQuizLanguageChange}>
            <SelectTrigger aria-label="Select quiz language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Volume */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-volume" className="text-sm font-medium">Volume</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => playbackActions.toggleMute()}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <Slider
              orientation="horizontal"
              min={0}
              max={100}
              step={1}
              value={[isMuted ? 0 : volume]}
              onValueChange={([v]) => playbackActions.setVolume(v)}
              aria-label="Volume"
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
              {isMuted ? 0 : volume}%
            </span>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
