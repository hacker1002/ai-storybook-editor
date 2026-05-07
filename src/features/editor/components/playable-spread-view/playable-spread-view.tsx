// playable-spread-view.tsx - Root container component for playable spread view
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  useVolume,
  useIsMuted,
} from '@/stores/animation-playback-store';
import {
  useBookMusic,
  useBookSound,
  useBookNarratorVolume,
  useBookEffects,
} from '@/stores/book-store';
import { usePlayerAudioStore } from '@/stores/player-audio-store';
import { PlayableEditorHeader } from "./playable-editor-header";
import { PlayableThumbnailList } from "./playable-thumbnail-list";
import { AnimationEditorCanvas } from "./animation-editor-canvas";
import { RemixEditorCanvas } from "./remix-editor-canvas";
import { PlayerCanvas, type PlayerCanvasHandle } from "./player-canvas";
import { BranchPathModal } from "./branch-path-modal";
import { FirstGestureGate } from "./first-gesture-gate";
import { PlayerAudioMixerHost } from "./audio/player-audio-mixer-host";
import { PlayerSpreadPreloadHost } from "./preload/player-spread-preload-host";
import { BookBackgroundMusicPlayer } from "./audio/book-background-music-player";
import { useMusicMediaUrl } from "./audio/use-music-media-url";
import { useSoundMediaUrl } from "./audio/use-sound-media-url";
import { createMixedAudio } from "./audio/create-mixed-audio";
import type { BookAudioSettings } from "./audio/audio-mixer-types";
import { useSpreadTurnTransition } from "./hooks/use-spread-turn-transition";
import { resolveTransitionStrategy } from "./transition/spread-turn-strategy";
import { SpreadTurnOverlay } from "./transition/spread-turn-overlay";
import type { TurnDirection } from "./transition/spread-turn-types";

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
  // First-gesture gate: required to unlock browser autoplay before PlayerCanvas mounts.
  // Reset whenever activeCanvas leaves 'player' so re-entry re-prompts (consistent UX).
  const [playerGestureCaptured, setPlayerGestureCaptured] = useState(false);

  // Outer wrapper ref — passed to PlayerAudioMixerHost so the MutationObserver
  // installed by useAudioMixerLifecycle can scan the entire player subtree
  // (BookBackgroundMusicPlayer + PlayerCanvas) for declarative <audio> nodes.
  const rootRef = useRef<HTMLDivElement>(null);

  // Imperative handle to PlayerCanvas — exposes `getSpreadContainer()` for the
  // spread-turn transition snapshot. Wired into `useSpreadTurnTransition` below.
  const playerCanvasHandleRef = useRef<PlayerCanvasHandle>(null);

  // === Audio mixer inputs ===
  const masterVolume = useVolume();
  const isMuted = useIsMuted();
  const music = useBookMusic();
  const sound = useBookSound();
  const narratorVolumeScale = useBookNarratorVolume();

  const bookAudio: BookAudioSettings = useMemo(() => ({
    music: music ?? { background_id: null, volume_scale: 1.0 },
    sound: sound ?? {
      transition_id: null,
      true_id: null,
      wrong_id: null,
      volume_scale: 1.0,
    },
    narratorVolumeScale,
  }), [music, sound, narratorVolumeScale]);

  const bgmMediaUrl = useMusicMediaUrl(music?.background_id ?? null);
  // Resolved SFX URL for spread transition. Played fire-and-forget at the start
  // of every `swapWithTurn` (both turn-animation and instant-bypass paths) so
  // navigation feedback stays consistent regardless of effects strategy.
  const transitionSfxUrl = useSoundMediaUrl(sound?.transition_id ?? null);
  const transitionSfxUrlRef = useRef<string | null>(null);
  useEffect(() => {
    transitionSfxUrlRef.current = transitionSfxUrl;
  }, [transitionSfxUrl]);
  const playTransitionSfx = useCallback(() => {
    const url = transitionSfxUrlRef.current;
    if (!url) return;
    try {
      const sfx = createMixedAudio(url, 'sfx');
      sfx.play().catch((err) => {
        log.debug('playTransitionSfx', 'play_rejected', { error: String(err) });
        sfx.remove();
      });
    } catch (err) {
      log.warn('playTransitionSfx', 'create_failed', { error: String(err) });
    }
  }, []);

  // Centralized first-gesture handler: resume the AudioContext (flushing the
  // autoStartQueue inside playerAudioStore) BEFORE flipping the gate state.
  // This ensures any pre-mounted <audio data-audio-channel> nodes that were
  // queued for autoplay start the moment the gate dismisses.
  const handleGestureCapture = useCallback(async () => {
    try {
      await usePlayerAudioStore.getState().resumeContext();
    } catch (e) {
      log.warn('handleGestureCapture', 'resume_failed', { error: String(e) });
    }
    setPlayerGestureCaptured(true);
  }, []);

  // Sync activeCanvas when mode prop changes (unless in player mode from play action)
  useEffect(() => {
    if (activeCanvas !== 'player') setActiveCanvas(mode); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode]); // eslint-disable-line

  // Reset first-gesture capture whenever leaving player canvas → re-entry re-prompts.
  useEffect(() => {
    if (activeCanvas !== 'player' && playerGestureCaptured) {
      log.debug('gestureReset', 'activeCanvas left player, resetting capture');
      setPlayerGestureCaptured(false); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [activeCanvas, playerGestureCaptured]);

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

  // === Spread turn transition ===
  // `transition_type` lives in book.effects (JSONB). Default to 'turn' for
  // legacy books with null effects so they pick up the new behavior.
  const bookEffects = useBookEffects();
  const transitionStrategy = useMemo(
    () => resolveTransitionStrategy(bookEffects?.transition_type ?? null),
    [bookEffects?.transition_type],
  );
  // Hook is only "enabled" while the player canvas is visible — editor canvases
  // don't navigate via spread-turn (instant swap is correct for design / remix).
  const turnEnabled =
    activeCanvas === 'player' && transitionStrategy === 'turn';

  const turn = useSpreadTurnTransition({
    enabled: turnEnabled,
    spreadContainerGetter: () =>
      playerCanvasHandleRef.current?.getSpreadContainer() ?? null,
    onSwap: (toId) => applySelectedSpreadChange(toId),
  });

  /** Centralized swap helper: dispatch through turn transition when enabled,
   *  otherwise fall through to instant `applySelectedSpreadChange`. The hook's
   *  bypass paths (reduced-motion, debug-disable, no container, snapshot fail)
   *  also call `applySelectedSpreadChange` via `onSwap`, so callers are guaranteed
   *  exactly-once swap semantics regardless of strategy. */
  const swapWithTurn = useCallback(
    (targetId: string, direction: TurnDirection, fromId: string | null) => {
      // No-op when source === target (re-click on same spread); skip SFX too.
      if (fromId && fromId === targetId) return;
      playTransitionSfx();
      if (turnEnabled) {
        turn.startTurn({
          fromSpreadId: fromId ?? '',
          toSpreadId: targetId,
          direction,
        });
        // Dev-only invariant: hook must commit `onSwap` synchronously inside
        // `startTurn`, so by the time we return here the caller's pending
        // selectedSpreadId state should match `targetId`. We can't read state
        // mid-render, so we re-call applySelectedSpreadChange's logic? No — we
        // simply assert that `targetId` is non-empty (cheap sanity guard); the
        // real synchronous-swap proof lives in the hook's startTurn body.
        if (import.meta.env.DEV) {
          console.assert(
            typeof targetId === 'string' && targetId.length > 0,
            'swapWithTurn invariant: targetId must be a non-empty string',
          );
        }
      } else {
        applySelectedSpreadChange(targetId);
      }
    },
    [turnEnabled, turn, applySelectedSpreadChange, playTransitionSfx],
  );

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
        swapWithTurn(entry.spreadId, 'prev', effectiveSelectedSpreadId);
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
          swapWithTurn(targetId, 'next', effectiveSelectedSpreadId);
        }
      }
      return;
    }
    if (result.type === 'spread') {
      log.debug('handleSkipSpread', 'next spread', { targetId: result.id });
      pushSpreadHistory(result.id, currentSection);
      swapWithTurn(result.id, 'next', effectiveSelectedSpreadId);
    }
  }, [spreadHistories, selectedSpread, spreads, sections, currentSection, playEdition, effectiveSelectedSpreadId, popSpreadHistory, pushSpreadHistory, swapWithTurn]);

  // === Branch Modal Handlers ===

  const handleBranchSelect = useCallback((targetSpreadId: string, section: Section) => {
    log.info('handleBranchSelect', 'branch chosen', { targetSpreadId, sectionId: section.id });
    setShowBranchModal(false);
    setPendingBranchSpreadId(null);
    setCurrentSection(section);
    pushSpreadHistory(targetSpreadId, section);
    swapWithTurn(targetSpreadId, 'next', effectiveSelectedSpreadId);
  }, [setCurrentSection, pushSpreadHistory, swapWithTurn, effectiveSelectedSpreadId]);

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
      swapWithTurn(section.start_spread_id, 'next', effectiveSelectedSpreadId);
    } else {
      log.debug('handleBranchDismiss', 'dismissed, no default branch section found');
    }
  }, [selectedSpread, sections, setCurrentSection, pushSpreadHistory, swapWithTurn, effectiveSelectedSpreadId]);

  // === Spread Selection Handler (thumbnail) ===
  const handleSpreadClick = useCallback(
    (spreadId: string) => {
      log.debug('handleSpreadClick', 'thumbnail clicked', { spreadId });
      // Compute direction from index delta — forward jump → 'next', back jump → 'prev'.
      // Same-spread click is a no-op for swapWithTurn (caller upstream).
      const curIdx = spreads.findIndex((s) => s.id === effectiveSelectedSpreadId);
      const newIdx = spreads.findIndex((s) => s.id === spreadId);
      const direction: TurnDirection = newIdx >= curIdx ? 'next' : 'prev';
      pushSpreadHistory(spreadId, currentSection);
      swapWithTurn(spreadId, direction, effectiveSelectedSpreadId);
    },
    [currentSection, pushSpreadHistory, swapWithTurn, spreads, effectiveSelectedSpreadId]
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
      const fromId = effectiveSelectedSpreadId;
      setTimeout(() => {
        pushSpreadHistory(targetId, currentSection);
        swapWithTurn(targetId, 'next', fromId);
      }, 1000);
    },
    [playMode, selectedSpread, spreads, sections, currentSection, playbackActions, pushSpreadHistory, swapWithTurn, effectiveSelectedSpreadId]
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
    <div ref={rootRef} className="relative flex flex-col h-full">
      {/* Player audio mixer host — mounts only while player canvas is active.
          React mount/unmount drives initContext/teardown via useAudioMixerLifecycle,
          keeping AudioContext scoped to player mode without violating rules of hooks. */}
      {activeCanvas === 'player' && (
        <PlayerAudioMixerHost
          rootRef={rootRef}
          masterVolume={masterVolume}
          isMuted={isMuted}
          bookAudio={bookAudio}
        />
      )}

      {/* Spread media preload host — mounts only while player canvas is active.
          Sliding window N+1/N+2 across image/audio/video/auto_pic/quiz/read-along.
          Spec: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-11-spread-media-preload.md §8 */}
      {activeCanvas === 'player' && effectiveSelectedSpreadId && (
        <PlayerSpreadPreloadHost
          spreads={spreads}
          activeSpreadId={effectiveSelectedSpreadId}
        />
      )}

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
          <>
            {/* PRE-MOUNT: BookBGM + PlayerCanvas mount immediately when entering
                player mode (no longer gated by playerGestureCaptured). This wires
                per-spread auto_audios into the suspended AudioContext + binary
                preload BEFORE the user clicks the gesture gate. */}
            <BookBackgroundMusicPlayer mediaUrl={bgmMediaUrl} />
            <PlayerCanvas
              ref={playerCanvasHandleRef}
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
            {/* Spread-turn overlay — portal'd under document.body, sits above the
                canvas (z=50) but below FirstGestureGate (z=100). Mounts only
                while a turn is in flight; the hook returns null overlayProps
                otherwise. */}
            {turn.overlayProps && (
              <SpreadTurnOverlay {...turn.overlayProps} />
            )}
            {/* Gate overlay (z-100) covers the canvas until the user gesture is
                captured. handleGestureCapture awaits resumeContext() to flush
                queued autoplays, then flips the flag to unmount the gate. */}
            {!playerGestureCaptured && (
              <FirstGestureGate onCapture={handleGestureCapture} />
            )}
          </>
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
