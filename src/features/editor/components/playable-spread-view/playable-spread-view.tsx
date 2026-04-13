// playable-spread-view.tsx - Root container component for playable spread view
import { useState, useEffect, useCallback, useMemo } from "react";
import type { PageNumberingSettings } from "@/types/editor";
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'PlayableSpreadView');
import type {
  OperationMode,
  ActiveCanvas,
  PlayMode,
  PlayEdition,
  PlayableSpread,
  RemixAsset,
  AssetSwapParams,
} from "@/types/playable-types";
import type { Section } from "@/types/illustration-types";
import type { ItemType } from "@/types/spread-types";
import { PLAYABLE_ZOOM } from "@/constants/playable-constants";
import { useSetZoomLevel } from '@/stores/editor-settings-store';
import {
  useSpreadHistories,
  useCurrentSection,
  usePlaybackActions,
} from '@/stores/animation-playback-store';
import { PlayableEditorHeader } from "./playable-editor-header";
import { PlayableThumbnailList } from "./playable-thumbnail-list";
import { AnimationEditorCanvas } from "./animation-editor-canvas";
import { RemixEditorCanvas } from "./remix-editor-canvas";
import { PlayerCanvas } from "./player-canvas";
import { BranchPathModal } from "./branch-path-modal";

// === Types ===

type NextSpreadResult =
  | { type: 'branch' }             // spread has branch_setting → show modal
  | { type: 'spread'; id: string } // navigate directly
  | null;                           // end of story

// === Pure helpers (outside component) ===

function resolveNextSpreadId(
  spread: PlayableSpread | undefined,
  spreads: PlayableSpread[],
  currentSection: Section | null,
): NextSpreadResult {
  if (!spread) return null;
  if (spread.branch_setting) return { type: 'branch' };
  if (currentSection && spread.id === currentSection.end_spread_id && currentSection.next_spread_id) {
    return { type: 'spread', id: currentSection.next_spread_id };
  }
  const linearNext = spreads[spreads.findIndex((s) => s.id === spread.id) + 1]?.id;
  if (linearNext) return { type: 'spread', id: linearNext };
  return null;
}

function autoResolveNextSpread(
  spread: PlayableSpread | undefined,
  spreads: PlayableSpread[],
  sections: Section[] | undefined,
  currentSection: Section | null,
): string | null {
  if (!spread) return null;
  if (spread.branch_setting) {
    const defaultBranch =
      spread.branch_setting.branches.find((b) => b.is_default) ??
      spread.branch_setting.branches[0];
    const section = sections?.find((s) => s.id === defaultBranch?.section_id);
    return section?.start_spread_id ?? null;
  }
  const result = resolveNextSpreadId(spread, spreads, currentSection);
  if (result?.type === 'spread') return result.id;
  return null;
}

// === Props ===

interface PlayableSpreadViewProps {
  mode: OperationMode;
  spreads: PlayableSpread[];
  sections?: Section[];
  assets?: RemixAsset[];
  selectedItemId?: string | null;
  selectedItemType?: ItemType | null;
  onItemSelect?: (itemType: ItemType | null, itemId: string | null) => void;
  onAssetSwap?: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
  onSpreadSelect?: (spreadId: string) => void;
  onPreview?: () => void;
  onStopPreview?: () => void;
  // Share preview context — optional, undefined = default editor behavior
  bookTitle?: string;
  availableEditions?: { classic?: boolean; dynamic?: boolean; interactive?: boolean };
  availableLanguages?: { name: string; code: string }[];
  // Page numbering overlay settings (null/undefined = hidden)
  pageNumbering?: PageNumberingSettings | null;
  // Whether to show the thumbnail strip (default: true; share preview hides it)
  showThumbnails?: boolean;
  // Controlled-or-uncontrolled props (ADR-021)
  selectedSpreadId?: string | null;      // controlled from parent
  zoomLevel?: number;                     // controlled from parent
  onZoomChange?: (level: number) => void; // notify parent of zoom change
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
  sections,
  assets,
  selectedItemId: externalSelectedItemId,
  selectedItemType: externalSelectedItemType,
  onItemSelect,
  onAssetSwap,
  onTextChange,
  onSpreadSelect,
  onPreview,
  onStopPreview,
  bookTitle,
  availableEditions,
  availableLanguages,
  pageNumbering,
  showThumbnails = true,
  selectedSpreadId: propSelectedSpreadId,
  zoomLevel: propZoomLevel,
  onZoomChange: propOnZoomChange,
}) => {
  // Share preview: player mode without thumbnails (public /share/:slug page)
  const isSharePreview = mode === 'player' && !showThumbnails;

  // === Internal State ===
  const [activeCanvas, setActiveCanvas] = useState<ActiveCanvas>(mode);

  // Sync activeCanvas when mode prop changes (unless in player mode from play action)
  useEffect(() => {
    if (activeCanvas !== 'player') setActiveCanvas(mode); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode]); // eslint-disable-line

  const [playMode, setPlayMode] = useState<PlayMode>("off");
  const defaultEdition = useMemo<PlayEdition>(() => {
    // undefined = no constraint (internal editor) → all editions available → pick highest
    if (!availableEditions || availableEditions.interactive) return 'interactive';
    if (availableEditions.dynamic) return 'dynamic';
    return 'classic';
  }, [availableEditions]);
  const [playEdition, setPlayEdition] = useState<PlayEdition>(defaultEdition);
  const [localZoomLevel, setLocalZoomLevel] = useState<number>(PLAYABLE_ZOOM.DEFAULT);
  const [localSelectedSpreadId, setLocalSelectedSpreadId] = useState<string | null>(
    spreads[0]?.id ?? null
  );
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [pendingBranchSpreadId, setPendingBranchSpreadId] = useState<string | null>(null);

  // Controlled-or-uncontrolled: use prop if provided, else local state.
  // IMPORTANT: propZoomLevel must remain stable (parent should not flip between
  // defined and undefined across renders — ADR-021 convention).
  const effectiveZoomLevel =
    propZoomLevel !== undefined ? propZoomLevel : localZoomLevel;
  const effectiveSelectedSpreadId =
    propSelectedSpreadId !== undefined ? propSelectedSpreadId : localSelectedSpreadId;

  const applyZoomChange = useCallback((n: number) => {
    if (propZoomLevel !== undefined) {
      propOnZoomChange?.(n);
    } else {
      setLocalZoomLevel(n);
    }
  }, [propZoomLevel, propOnZoomChange]);

  const applySelectedSpreadChange = useCallback((spreadId: string) => {
    if (propSelectedSpreadId !== undefined) {
      onSpreadSelect?.(spreadId);
    } else {
      setLocalSelectedSpreadId(spreadId);
      onSpreadSelect?.(spreadId);
    }
  }, [propSelectedSpreadId, onSpreadSelect]);

  // Sync zoom level to global store for shared components
  // (Skip in player mode — PlayerCanvas manages its own fitZoom → store sync)
  const setStoreZoomLevel = useSetZoomLevel();
  useEffect(() => {
    if (activeCanvas !== 'player') setStoreZoomLevel(effectiveZoomLevel);
  }, [effectiveZoomLevel, activeCanvas, setStoreZoomLevel]);

  // === Store ===
  const spreadHistories = useSpreadHistories();
  const currentSection = useCurrentSection();
  const playbackActions = usePlaybackActions();
  const { pushSpreadHistory, popSpreadHistory, setCurrentSection } = playbackActions;

  // === Derived State ===
  const selectedSpread = spreads.find((s) => s.id === effectiveSelectedSpreadId);
  const hasPrevious = spreadHistories.length > 1;
  const nextResult = resolveNextSpreadId(selectedSpread, spreads, currentSection);
  const hasNext = nextResult !== null;

  // === Canvas Switching Handlers ===
  const handlePlay = useCallback(() => {
    log.info('handlePlay', 'play started', { spreadId: effectiveSelectedSpreadId, playMode });
    setActiveCanvas("player");
    onPreview?.();
  }, [onPreview, effectiveSelectedSpreadId, playMode]);

  const handleStop = useCallback(() => {
    log.info('handleStop', 'playback stopped', { mode });
    setActiveCanvas(mode); // Return to mode-determined canvas
    onStopPreview?.();
  }, [mode, onStopPreview]);

  // Stop playback when switching editions to force step rebuild
  // In share preview (mode=player), skip canvas remount — PlayerCanvas handles step reset internally
  const handleEditionChange = useCallback((edition: PlayEdition) => {
    log.info('handleEditionChange', 'edition switching', { edition, activeCanvas });
    if (activeCanvas === 'player' && mode !== 'player') {
      setActiveCanvas(mode);
      onStopPreview?.();
    }
    setPlayEdition(edition);
  }, [activeCanvas, mode, onStopPreview]);

  // === Navigation Handlers ===

  const handleSkipSpread = useCallback((direction: 'next' | 'prev') => {
    if (direction === 'prev') {
      if (spreadHistories.length <= 1) return;
      const entry = popSpreadHistory();
      if (entry) {
        log.debug('handleSkipSpread', 'back to prev', { spreadId: entry.spreadId });
        applySelectedSpreadChange(entry.spreadId);
      }
      return;
    }

    // direction === 'next'
    const result = resolveNextSpreadId(selectedSpread, spreads, currentSection);
    if (!result) return;

    if (result.type === 'branch') {
      if (playEdition === 'interactive') {
        log.info('handleSkipSpread', 'branch detected, showing modal', { spreadId: effectiveSelectedSpreadId });
        setPendingBranchSpreadId(effectiveSelectedSpreadId);
        setShowBranchModal(true);
      } else {
        // Classic/Dynamic: auto-resolve via default branch, no modal
        const targetId = autoResolveNextSpread(selectedSpread, spreads, sections, currentSection);
        if (targetId) {
          log.debug('handleSkipSpread', 'branch auto-resolved', { targetId, playEdition });
          pushSpreadHistory(targetId, currentSection);
          applySelectedSpreadChange(targetId);
        }
      }
      return;
    }
    if (result.type === 'spread') {
      log.debug('handleSkipSpread', 'next spread', { targetId: result.id });
      pushSpreadHistory(result.id, currentSection);
      applySelectedSpreadChange(result.id);
    }
  }, [spreadHistories, selectedSpread, spreads, currentSection, playEdition, effectiveSelectedSpreadId, popSpreadHistory, pushSpreadHistory, applySelectedSpreadChange]);

  // === Branch Modal Handlers ===

  const handleBranchSelect = useCallback((targetSpreadId: string, section: Section) => {
    log.info('handleBranchSelect', 'branch chosen', { targetSpreadId, sectionId: section.id });
    setShowBranchModal(false);
    setPendingBranchSpreadId(null);
    setCurrentSection(section);
    pushSpreadHistory(targetSpreadId, section);
    applySelectedSpreadChange(targetSpreadId);
  }, [setCurrentSection, pushSpreadHistory, applySelectedSpreadChange]);

  const handleBranchDismiss = useCallback(() => {
    setShowBranchModal(false);
    setPendingBranchSpreadId(null);
    const branchSetting = selectedSpread?.branch_setting;
    if (!branchSetting) return;
    const defaultBranch =
      branchSetting.branches.find((b) => b.is_default) ?? branchSetting.branches[0];
    const section = sections?.find((s) => s.id === defaultBranch?.section_id);
    if (section) {
      log.info('handleBranchDismiss', 'dismissed, following default branch', { targetId: section.start_spread_id, sectionId: section.id });
      setCurrentSection(section);
      pushSpreadHistory(section.start_spread_id, section);
      applySelectedSpreadChange(section.start_spread_id);
    } else {
      log.debug('handleBranchDismiss', 'dismissed, no default branch section found');
    }
  }, [selectedSpread, sections, setCurrentSection, pushSpreadHistory, applySelectedSpreadChange]);

  // === Spread Selection Handler (thumbnail) ===
  const handleSpreadClick = useCallback(
    (spreadId: string) => {
      log.debug('handleSpreadClick', 'thumbnail clicked', { spreadId });
      pushSpreadHistory(spreadId, currentSection);
      applySelectedSpreadChange(spreadId);
    },
    [currentSection, pushSpreadHistory, applySelectedSpreadChange]
  );

  // === Spread Complete Handler ===
  const handleSpreadComplete = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_spreadId: string) => {
      if (playMode !== 'auto') return;
      const targetId = autoResolveNextSpread(selectedSpread, spreads, sections, currentSection);
      if (!targetId) {
        playbackActions.pause();
        return;
      }
      setTimeout(() => {
        pushSpreadHistory(targetId, currentSection);
        applySelectedSpreadChange(targetId);
      }, 1000);
    },
    [playMode, selectedSpread, spreads, sections, currentSection, playbackActions, pushSpreadHistory, applySelectedSpreadChange]
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
          handleSkipSpread('prev');
          break;
        case KEYBOARD_SHORTCUTS.NEXT_SPREAD:
          handleSkipSpread('next');
          break;
        case KEYBOARD_SHORTCUTS.FIRST_SPREAD: {
          e.preventDefault();
          const firstSpread = spreads[0];
          if (firstSpread) {
            applySelectedSpreadChange(firstSpread.id);
          }
          break;
        }
        case KEYBOARD_SHORTCUTS.LAST_SPREAD: {
          e.preventDefault();
          const lastSpread = spreads[spreads.length - 1];
          if (lastSpread) {
            applySelectedSpreadChange(lastSpread.id);
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
    handleSkipSpread,
    applySelectedSpreadChange,
  ]);

  // === Render ===
  return (
    <div className="relative flex flex-col h-full">
      {/* Header: editor modes only (player mode has no header — controls in sidebar) */}
      {mode !== "player" && (
        <PlayableEditorHeader
          zoomLevel={effectiveZoomLevel}
          onZoomChange={applyZoomChange}
        />
      )}

      {/* Canvas Area - full height (no header row) */}
      <div className="flex-1 overflow-hidden flex relative">
        {/* Book title overlay — share preview only */}
        {isSharePreview && bookTitle && (
          <div className="absolute top-3 left-3 bg-black/40 text-white text-sm font-medium px-3 py-1.5 rounded-md max-w-[60%] truncate opacity-80 hover:opacity-100 z-10 transition-opacity pointer-events-none">
            {bookTitle}
          </div>
        )}

        {activeCanvas === "animation-editor" && selectedSpread ? (
          <AnimationEditorCanvas
            spread={selectedSpread}
            zoomLevel={effectiveZoomLevel}
            selectedItemId={externalSelectedItemId}
            selectedItemType={externalSelectedItemType}
            onItemSelect={onItemSelect ?? (() => {})}
            pageNumbering={pageNumbering}
          />
        ) : activeCanvas === "remix-editor" &&
          selectedSpread &&
          assets &&
          onAssetSwap ? (
          <RemixEditorCanvas
            spread={selectedSpread}
            zoomLevel={effectiveZoomLevel}
            assets={assets}
            onAssetSwap={onAssetSwap}
            onTextChange={onTextChange}
            pageNumbering={pageNumbering}
          />
        ) : activeCanvas === "player" && selectedSpread ? (
          <PlayerCanvas
            spread={selectedSpread}
            zoomLevel={effectiveZoomLevel}
            playMode={playMode}
            playEdition={playEdition}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            onSpreadComplete={handleSpreadComplete}
            onSkipSpread={handleSkipSpread}
            onPlayModeChange={setPlayMode}
            onEditionChange={handleEditionChange}
            availableEditions={availableEditions}
            availableLanguages={availableLanguages}
            pageNumbering={pageNumbering}
            isSharePreview={isSharePreview}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No spread selected
          </div>
        )}
      </div>

      {/* Thumbnail List */}
      {showThumbnails && (
        <div className="h-[120px] flex-shrink-0">
          <PlayableThumbnailList
            spreads={spreads}
            selectedId={effectiveSelectedSpreadId}
            onSpreadClick={handleSpreadClick}
          />
        </div>
      )}

      {/* Branch Path Modal */}
      {showBranchModal && pendingBranchSpreadId && (() => {
        const branchSpread = spreads.find((s) => s.id === pendingBranchSpreadId);
        if (!branchSpread?.branch_setting) return null;
        return (
          <BranchPathModal
            branchSetting={branchSpread.branch_setting}
            sections={sections ?? []}
            onSelect={handleBranchSelect}
            onDismiss={handleBranchDismiss}
          />
        );
      })()}
    </div>
  );
};
