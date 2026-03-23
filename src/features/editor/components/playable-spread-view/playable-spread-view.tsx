// playable-spread-view.tsx - Root container component for playable spread view
import { useState, useEffect, useCallback } from "react";
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'PlayableSpreadView');
import type {
  OperationMode,
  ActiveCanvas,
  PlayMode,
  PlayableSpread,
  RemixAsset,
  AssetSwapParams,
} from "@/types/playable-types";
import type { ItemType } from "@/types/spread-types";
import { PLAYABLE_ZOOM } from "@/constants/playable-constants";
import { PlayableHeader } from "./playable-header";
import { PlayableThumbnailList } from "./playable-thumbnail-list";
import { AnimationEditorCanvas } from "./animation-editor-canvas";
import { RemixEditorCanvas } from "./remix-editor-canvas";
import { PlayerCanvas } from "./player-canvas";

interface PlayableSpreadViewProps {
  mode: OperationMode;
  spreads: PlayableSpread[];
  assets?: RemixAsset[];
  selectedItemId?: string | null;
  selectedItemType?: ItemType | null;
  onItemSelect?: (itemType: ItemType | null, itemId: string | null) => void;
  onAssetSwap?: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
  onSpreadSelect?: (spreadId: string) => void;
  onPreview?: () => void;
  onStopPreview?: () => void;
}

const KEYBOARD_SHORTCUTS = {
  TOGGLE_PLAY: ' ',
  STOP: 'Escape',
  PREV_SPREAD: 'ArrowLeft',
  NEXT_SPREAD: 'ArrowRight',
  TOGGLE_MUTE: 'm',
  VOLUME_UP: 'ArrowUp',
  VOLUME_DOWN: 'ArrowDown',
  FIRST_SPREAD: 'Home',
  LAST_SPREAD: 'End',
} as const;

export const PlayableSpreadView: React.FC<PlayableSpreadViewProps> = ({
  mode,
  spreads,
  assets,
  selectedItemId: externalSelectedItemId,
  selectedItemType: externalSelectedItemType,
  onItemSelect,
  onAssetSwap,
  onTextChange,
  onSpreadSelect,
  onPreview,
  onStopPreview,
}) => {
  // === Internal State ===
  const [activeCanvas, setActiveCanvas] = useState<ActiveCanvas>(mode);

  // Sync activeCanvas when mode prop changes (unless in player mode from play action)
  useEffect(() => {
    if (activeCanvas !== 'player') setActiveCanvas(mode); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode]); // eslint-disable-line

  const [playMode, setPlayMode] = useState<PlayMode>("semi-auto");
  const [zoomLevel, setZoomLevel] = useState<number>(PLAYABLE_ZOOM.DEFAULT);
  const [selectedSpreadId, setSelectedSpreadId] = useState<string | null>(
    spreads[0]?.id ?? null
  );

  // === Derived State ===
  const selectedSpread = spreads.find((s) => s.id === selectedSpreadId);
  const selectedIndex = spreads.findIndex((s) => s.id === selectedSpreadId);
  const hasPrevious = selectedIndex > 0;
  const hasNext = selectedIndex < spreads.length - 1;

  // === Canvas Switching Handlers ===
  const handlePlay = useCallback(() => {
    if (playMode === "off") return;
    log.info('handlePlay', 'play started', { spreadId: selectedSpreadId, playMode });
    setActiveCanvas("player");
    onPreview?.();
  }, [playMode, onPreview, selectedSpreadId]);

  const handleStop = useCallback(() => {
    log.info('handleStop', 'playback stopped', { mode });
    setActiveCanvas(mode); // Return to mode-determined canvas
    onStopPreview?.();
  }, [mode, onStopPreview]);

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

  const handleSkipSpread = useCallback((direction: 'next' | 'prev') => {
    if (direction === 'next') handleSkipNext();
    else handleSkipPrevious();
  }, [handleSkipNext, handleSkipPrevious]);

  // === Spread Selection Handler ===
  const handleSpreadClick = useCallback(
    (spreadId: string) => {
      setSelectedSpreadId(spreadId);
      onSpreadSelect?.(spreadId);
    },
    [onSpreadSelect]
  );

  // === Spread Complete Handler ===
  const handleSpreadComplete = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_spreadId: string) => {
      if (playMode === 'auto' && hasNext) {
        const nextSpread = spreads[selectedIndex + 1];
        if (nextSpread) {
          setTimeout(() => {
            setSelectedSpreadId(nextSpread.id);
            onSpreadSelect?.(nextSpread.id);
          }, 1000);
        }
      }
    },
    [playMode, hasNext, spreads, selectedIndex, onSpreadSelect]
  );

  // === Keyboard Shortcuts ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      if (spreads.length === 0) return;

      switch (e.key) {
        case KEYBOARD_SHORTCUTS.TOGGLE_PLAY:
          e.preventDefault();
          if (activeCanvas === 'player') {
            handleStop();
          } else {
            handlePlay();
          }
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
    spreads,
    activeCanvas,
    handlePlay,
    handleStop,
    handleSkipPrevious,
    handleSkipNext,
    onSpreadSelect,
  ]);

  // === Render ===
  return (
    <div className="relative flex flex-col h-full">
      {/* PlayableHeader - with play/stop button and zoom slider */}
      <PlayableHeader
        activeCanvas={activeCanvas}
        playMode={playMode}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        onPlay={handlePlay}
        onStop={handleStop}
      />

      {/* Canvas Area - full height (no header row) */}
      <div className="flex-1 overflow-hidden flex">
        {activeCanvas === "animation-editor" && selectedSpread ? (
          <AnimationEditorCanvas
            spread={selectedSpread}
            zoomLevel={zoomLevel}
            selectedItemId={externalSelectedItemId}
            selectedItemType={externalSelectedItemType}
            onItemSelect={onItemSelect ?? (() => {})}
          />
        ) : activeCanvas === "remix-editor" &&
          selectedSpread &&
          assets &&
          onAssetSwap ? (
          <RemixEditorCanvas
            spread={selectedSpread}
            zoomLevel={zoomLevel}
            assets={assets}
            onAssetSwap={onAssetSwap}
            onTextChange={onTextChange}
          />
        ) : activeCanvas === "player" && selectedSpread ? (
          <PlayerCanvas
            spread={selectedSpread}
            zoomLevel={zoomLevel}
            playMode={playMode}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            onSpreadComplete={handleSpreadComplete}
            onSkipSpread={handleSkipSpread}
            onPlayModeChange={setPlayMode}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No spread selected
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
