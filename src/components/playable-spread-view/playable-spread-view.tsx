// playable-spread-view.tsx - Root container component for playable spread view
import { useState, useEffect, useCallback } from "react";
import type { PlayableSpreadViewProps, ActiveCanvas, PlayMode } from "./types";
import { VOLUME, KEYBOARD_SHORTCUTS } from "./constants";
import { PlayableHeader } from "./playable-header";
import { PlayableThumbnailList } from "./playable-thumbnail-list";
import { AnimationEditorCanvas } from "./animation-editor-canvas";
import { RemixEditorCanvas } from "./remix-editor-canvas";

// Spread data textbox NEED pre-filtered with language by consumer
export const PlayableSpreadView: React.FC<PlayableSpreadViewProps> = ({
  mode,
  spreads,
  assets,
  onAddAnimation,
  onAssetSwap,
  onTextChange,
  onSpreadSelect,
}) => {
  // === Internal State ===
  const [activeCanvas, setActiveCanvas] = useState<ActiveCanvas>(mode);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync activeCanvas when mode prop changes (unless in player mode from play action)
  useEffect(() => {
    if (!isPlaying) {
      setActiveCanvas(mode);
    }
  }, [mode, isPlaying]);
  const [playMode, setPlayMode] = useState<PlayMode>("off");
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    spreads[0]?.id ?? null
  );
  const [volume, setVolume] = useState<number>(VOLUME.DEFAULT);
  const [isMuted, setIsMuted] = useState(false);

  // === Derived State ===
  const selectedSpread = spreads.find((s) => s.id === selectedSpreadId);
  const selectedIndex = spreads.findIndex((s) => s.id === selectedSpreadId);
  const hasPrevious = selectedIndex > 0;
  const hasNext = selectedIndex < spreads.length - 1;

  // Check if spread has playable content (simplified for demo)
  const playDisabled = !selectedSpread;

  // === Canvas Switching Handlers ===
  const handlePlayToggle = useCallback(() => {
    if (activeCanvas !== "player") {
      // Switch to player and start playing
      setActiveCanvas("player");
      setIsPlaying(true);
    } else {
      // Toggle playback on player
      setIsPlaying((prev) => !prev);
    }
  }, [activeCanvas]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setActiveCanvas(mode); // Return to mode-determined canvas
  }, [mode]);

  const handleSkipPrevious = useCallback(() => {
    if (!hasPrevious) return;
    const prevSpread = spreads[selectedIndex - 1];
    setSelectedSpreadId(prevSpread.id);
    onSpreadSelect?.(prevSpread.id);
  }, [hasPrevious, spreads, selectedIndex, onSpreadSelect]);

  const handleSkipNext = useCallback(() => {
    if (!hasNext) return;
    const nextSpread = spreads[selectedIndex + 1];
    setSelectedSpreadId(nextSpread.id);
    onSpreadSelect?.(nextSpread.id);
  }, [hasNext, spreads, selectedIndex, onSpreadSelect]);

  // === Volume Handlers ===
  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      if (newVolume > 0 && isMuted) {
        setIsMuted(false); // Auto unmute when increasing from muted
      }
      if (newVolume === 0) {
        setIsMuted(true); // Auto mute at 0
      }
    },
    [isMuted]
  );

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // === PlayMode Handler ===
  const handlePlayModeChange = useCallback((newMode: PlayMode) => {
    setPlayMode(newMode);
  }, []);

  // === Spread Selection Handler ===
  const handleSpreadClick = useCallback(
    (spreadId: string) => {
      setSelectedSpreadId(spreadId);
      onSpreadSelect?.(spreadId); // Notify parent of selection change
    },
    [onSpreadSelect]
  );

  // === Keyboard Shortcuts ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input or contentEditable
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      // Guard against empty spreads
      if (spreads.length === 0) return;

      switch (e.key) {
        case KEYBOARD_SHORTCUTS.TOGGLE_PLAY:
          e.preventDefault();
          handlePlayToggle();
          break;
        case KEYBOARD_SHORTCUTS.STOP:
          handleStop();
          break;
        case KEYBOARD_SHORTCUTS.PREV_SPREAD:
          handleSkipPrevious();
          break;
        case KEYBOARD_SHORTCUTS.NEXT_SPREAD:
          handleSkipNext();
          break;
        case KEYBOARD_SHORTCUTS.TOGGLE_MUTE:
        case KEYBOARD_SHORTCUTS.TOGGLE_MUTE.toUpperCase():
          handleMuteToggle();
          break;
        case KEYBOARD_SHORTCUTS.VOLUME_UP:
          handleVolumeChange(Math.min(volume + VOLUME.STEP, VOLUME.MAX));
          break;
        case KEYBOARD_SHORTCUTS.VOLUME_DOWN:
          handleVolumeChange(Math.max(volume - VOLUME.STEP, VOLUME.MIN));
          break;
        case KEYBOARD_SHORTCUTS.FIRST_SPREAD: {
          e.preventDefault();
          const firstSpread = spreads[0];
          if (firstSpread) {
            setSelectedSpreadId(firstSpread.id);
            onSpreadSelect?.(firstSpread.id);
          }
          break;
        }
        case KEYBOARD_SHORTCUTS.LAST_SPREAD: {
          e.preventDefault();
          const lastSpread = spreads[spreads.length - 1];
          if (lastSpread) {
            setSelectedSpreadId(lastSpread.id);
            onSpreadSelect?.(lastSpread.id);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    volume,
    spreads,
    handlePlayToggle,
    handleStop,
    handleSkipPrevious,
    handleSkipNext,
    handleMuteToggle,
    handleVolumeChange,
    onSpreadSelect,
  ]);

  // === Render ===
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex-shrink-0">
        <PlayableHeader
          playMode={playMode}
          isPlaying={isPlaying}
          volume={volume}
          isMuted={isMuted}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          playDisabled={playDisabled}
          onPlayModeChange={handlePlayModeChange}
          onPlayToggle={handlePlayToggle}
          onSkipPrevious={handleSkipPrevious}
          onSkipNext={handleSkipNext}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
        />
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-hidden flex">
        {activeCanvas === "animation-editor" &&
        selectedSpread &&
        onAddAnimation ? (
          <AnimationEditorCanvas
            spread={selectedSpread}
            onAddAnimation={onAddAnimation}
          />
        ) : activeCanvas === "remix-editor" &&
          selectedSpread &&
          assets &&
          onAssetSwap ? (
          <RemixEditorCanvas
            spread={selectedSpread}
            assets={assets}
            onAssetSwap={onAssetSwap}
            onTextChange={onTextChange}
          />
        ) : (
          /* Mock for player (future implementation) */
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
            <div className="text-center space-y-2 p-8 rounded-lg bg-background border shadow-sm">
              <div className="text-2xl font-semibold">
                Canvas: {activeCanvas}
              </div>
              <div className="text-muted-foreground">Mode: {mode}</div>
              <div className="text-muted-foreground">
                Spread: {selectedSpreadId || "None"}
              </div>
              <div className="text-sm">
                {isPlaying ? "▶️ Playing" : "⏸️ Paused"}
              </div>
              <div className="text-xs text-muted-foreground">
                Volume: {isMuted ? "Muted" : `${volume}%`}
              </div>
              <div className="text-xs text-muted-foreground mt-4">
                PlayMode: {playMode}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail List */}
      <div className="h-[120px] flex-shrink-0">
        <PlayableThumbnailList
          spreads={spreads}
          selectedId={selectedSpreadId}
          onSpreadClick={handleSpreadClick}
        />
      </div>
    </div>
  );
};
