// player-canvas.tsx - Animation playback canvas wired to Zustand store + GSAP engine hook
"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  EditableTextbox,
  EditableImage,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableQuiz,
} from "../shared-components";
import { getScaledDimensions } from "../../utils/coordinate-utils";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { PageItem } from "../canvas-spread-view/page-item";
import { TEXTBOX_Z_INDEX_BASE, EFFECT_TYPE } from "@/constants/playable-constants";
import type {
  PlayableSpread,
  PlayMode,
  PlayVersion,
  AnimationStep,
} from "@/types/playable-types";
import {
  isReplayableClick,
  buildAnimationSteps,
  findPrevOnNextStep,
} from "./player-utils";
import { usePlayerGsapEngine } from "./hooks/use-player-gsap-engine";

// === Constants ===
const RAPID_NEXT_THRESHOLD = 150; // ms

// === Props Interface ===
export interface PlayerCanvasProps {
  spread: PlayableSpread;
  zoomLevel: number;
  playMode: PlayMode;
  playVersion: PlayVersion;
  hasNext: boolean;
  hasPrevious: boolean;
  onSpreadComplete: (spreadId: string) => void;
  onSkipSpread: (direction: "next" | "prev") => void;
  onPlayModeChange: (mode: PlayMode) => void;
}
import {
  usePlaybackStore,
  usePlaybackActions,
  usePlayerPhase,
  useCurrentStepIndex,
  usePendingClickTargetId,
  useReplayableItems,
} from "@/stores/animation-playback-store";
import { PlayerControlSidebar } from "./player-control-sidebar";
import { PlayQuizModal } from "./play-quiz-modal";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "PlayerCanvas");

// === CSS for click-hint-pulse ===
// IMPORTANT: Apply to the CHILD element (> :first-child), not the wrapper div.
// The wrapper div is 0x0 (children are position:absolute with their own geometry).
const CLICK_HINT_STYLE = `
@keyframes click-hint-pulse {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 0px rgba(255, 165, 0, 0)); }
  50% { opacity: 0.7; filter: drop-shadow(0 0 10px rgba(255, 165, 0, 0.7)); }
}
.click-hint-pulse > :first-child {
  animation: click-hint-pulse 1.2s ease-in-out infinite;
}
.read-along-word {
  transition: background-color 0.15s ease, color 0.15s ease;
  border-radius: 2px;
  padding: 0 1px;
}
.read-along-active-word {
  background-color: rgba(59, 130, 246, 0.25);
  color: #1d4ed8;
}
`;

export function PlayerCanvas({
  spread,
  zoomLevel,
  playMode,
  playVersion,
  hasNext,
  hasPrevious,
  onSpreadComplete,
  onSkipSpread,
  onPlayModeChange,
}: PlayerCanvasProps) {
  // === Store selectors ===
  const playbackActions = usePlaybackActions();
  const phase = usePlayerPhase();
  const currentStepIndex = useCurrentStepIndex();
  const pendingClickTargetId = usePendingClickTargetId();
  const replayableItems = useReplayableItems();
  const steps = usePlaybackStore((s) => s.steps);
  const editorLangCode = useLanguageCode();

  // === Quiz modal state ===
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  const handleQuizPlay = useCallback((quizId: string) => {
    log.info("handleQuizPlay", "quiz modal opened", { quizId });
    setActiveQuizId(quizId);
  }, []);

  // === GSAP engine hook ===
  const {
    spreadContainerRef,
    registerRef,
    handleClickLoopReplay,
    killTimeline,
    applyStepFinalStates,
    reApplyInitialStates,
    handleQuizComplete,
  } = usePlayerGsapEngine({
    spread,
    zoomLevel,
    editorLangCode,
    onSpreadComplete,
    onQuizPlay: handleQuizPlay,
  });

  // Quiz modal close: dismiss modal then complete quiz step
  const handleQuizModalClose = useCallback(
    (_completed: boolean) => {
      setActiveQuizId(null);
      // Next tick so modal unmounts first; handleQuizComplete resumes timeline
      // (mixed step / auto) or calls stepComplete (quiz-only step).
      setTimeout(() => handleQuizComplete(), 0);
    },
    [handleQuizComplete]
  );

  const { width: scaledWidth, height: scaledHeight } =
    getScaledDimensions(zoomLevel);

  // === Version-filtered animations ===
  // Classic mode: only READ_ALONG animations (effect type 11)
  // Interactive mode: all animations
  const filteredAnimations = useMemo(() => {
    if (playVersion === 'classic') {
      return spread.animations.filter((a) => a.effect.type === EFFECT_TYPE.READ_ALONG);
    }
    return spread.animations;
  }, [spread.animations, playVersion]);

  // === Store sync effects ===

  // 1. Sync playMode from props into store
  useEffect(() => {
    playbackActions.setPlayMode(playMode);
  }, [playMode, playbackActions]);

  // 1b. Sync playVersion from props into store
  useEffect(() => {
    playbackActions.setPlayVersion(playVersion);
  }, [playVersion, playbackActions]);

  // 2. Reset steps on spread change or version change & ensure playback starts
  useEffect(() => {
    setActiveQuizId(null); // Clear any open quiz modal from previous spread
    const newSteps = buildAnimationSteps(filteredAnimations);
    playbackActions.reset(newSteps);
    playbackActions.play();
  }, [spread.id, filteredAnimations]); // eslint-disable-line

  // 3. Cleanup on unmount
  useEffect(() => {
    return () => playbackActions.resetStore();
  }, []); // eslint-disable-line

  // 4. Keyboard shortcuts: volume/mute (moved from root)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      switch (e.key) {
        case "m":
        case "M":
          playbackActions.toggleMute();
          break;
        case "ArrowUp":
          e.preventDefault();
          playbackActions.setVolume(usePlaybackStore.getState().volume + 10);
          break;
        case "ArrowDown":
          e.preventDefault();
          playbackActions.setVolume(usePlaybackStore.getState().volume - 10);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playbackActions]);

  // === Navigation handlers ===

  const lastNextTimeRef = useRef<number>(0);
  const lastBackTimeRef = useRef<number>(0);

  const handleNext = useCallback(() => {
    if (playMode !== "off") return;
    // Dismiss quiz modal if open before skipping
    if (activeQuizId) setActiveQuizId(null);
    if (phase === "playing") {
      const currentStep = steps[currentStepIndex];
      if (currentStep?.mustComplete) return;
      const now = Date.now();
      if (now - lastNextTimeRef.current < RAPID_NEXT_THRESHOLD) return;
      lastNextTimeRef.current = now;
      killTimeline();
      if (currentStep) applyStepFinalStates(currentStep);
      const isLastStep = currentStepIndex >= steps.length - 1;
      playbackActions.cancelAndNext();
      if (isLastStep && hasNext) onSkipSpread("next");
      return;
    }
    if (phase === "complete") {
      if (hasNext) onSkipSpread("next");
      return;
    }
    playbackActions.userNext();
  }, [
    playMode,
    phase,
    steps,
    currentStepIndex,
    hasNext,
    activeQuizId,
    killTimeline,
    applyStepFinalStates,
    playbackActions,
    onSkipSpread,
  ]);

  const handleBack = useCallback(() => {
    if (playMode !== "off") return;
    // Dismiss quiz modal if open before going back
    if (activeQuizId) setActiveQuizId(null);
    // No previous on_next step exists → skip to previous spread
    // Handles: step 0, before start, or first interactive step preceded only by 'auto' steps
    const prevOnNextIdx = findPrevOnNextStep(steps, currentStepIndex);
    if (currentStepIndex <= 0 || prevOnNextIdx < 0) {
      if (hasPrevious) onSkipSpread("prev");
      return;
    }
    if (phase === "playing") {
      const currentStep = steps[currentStepIndex];
      if (currentStep?.mustComplete) return;
      const now = Date.now();
      if (now - lastBackTimeRef.current < RAPID_NEXT_THRESHOLD) return;
      lastBackTimeRef.current = now;
      killTimeline();
      reApplyInitialStates(currentStepIndex);
    }
    playbackActions.userBack();
  }, [
    playMode,
    currentStepIndex,
    hasPrevious,
    phase,
    steps,
    activeQuizId,
    killTimeline,
    reApplyInitialStates,
    playbackActions,
    onSkipSpread,
  ]);

  const handleItemClick = useCallback(
    (itemId: string) => {
      if (playMode !== "off") return;
      log.info("handleItemClick", "item clicked", {
        itemId,
        phase,
        pendingClickTargetId,
      });
      if (pendingClickTargetId === itemId) {
        playbackActions.userClick(itemId);
        return;
      }
      if (isReplayableClick(replayableItems, itemId) && phase !== "playing") {
        const result = playbackActions.clickLoopReplay(itemId);
        if (result.shouldReplay && result.step)
          handleClickLoopReplay(result.step as AnimationStep);
        return;
      }
      playbackActions.userClick(itemId);
    },
    [
      playMode,
      pendingClickTargetId,
      replayableItems,
      phase,
      playbackActions,
      handleClickLoopReplay,
    ]
  );

  // === Pointer & Highlight Logic ===

  const getPointerClasses = useCallback(
    (itemId: string): string => {
      if (playMode === "off") {
        if (pendingClickTargetId === itemId)
          return "pointer-events-auto cursor-pointer";
        if (isReplayableClick(replayableItems, itemId))
          return "pointer-events-auto cursor-pointer";
      }
      return "pointer-events-none";
    },
    [playMode, pendingClickTargetId, replayableItems]
  );

  const getHighlightClass = useCallback(
    (itemId: string): string => {
      return pendingClickTargetId === itemId ? "click-hint-pulse" : "";
    },
    [pendingClickTargetId]
  );

  // === Computed navigation state ===

  const canGoBack = useMemo(() => {
    if (playMode !== "off") return false;
    // No previous on_next step → can go back only if previous spread exists
    const prevOnNextIdx = findPrevOnNextStep(steps, currentStepIndex);
    if (currentStepIndex <= 0 || prevOnNextIdx < 0) return hasPrevious;
    if (phase === "playing") {
      const step = steps[currentStepIndex];
      return !step?.mustComplete;
    }
    return true;
  }, [playMode, currentStepIndex, hasPrevious, phase, steps]);

  const canGoNext = useMemo(() => {
    if (playMode !== "off") return false;
    if (phase === "playing") {
      const step = steps[currentStepIndex];
      return !step?.mustComplete;
    }
    if (phase === "complete") return hasNext;
    return true;
  }, [playMode, phase, currentStepIndex, steps, hasNext]);

  // === Memoized textboxes with resolved language ===
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes
      .map((textbox) => {
        const result = getTextboxContentForLanguage(textbox, editorLangCode);
        if (!result?.content?.geometry) return null;
        return { textbox, langKey: result.langKey, data: result.content };
      })
      .filter(Boolean);
  }, [spread.textboxes, editorLangCode]);

  // === Render ===
  return (
    <div className="relative flex-1 overflow-auto flex items-center justify-center p-4 pr-[72px] bg-muted/30">
      <style>{CLICK_HINT_STYLE}</style>

      {/* Spread container */}
      <div
        ref={spreadContainerRef}
        className="relative bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: "transform",
        }}
      >
        {/* Pages */}
        {spread.pages.map((page, pageIndex) => (
          <PageItem
            key={pageIndex}
            page={page}
            pageIndex={pageIndex}
            spread={spread}
            spreadId={spread.id}
            position={
              spread.pages.length === 1
                ? "single"
                : pageIndex === 0
                ? "left"
                : "right"
            }
            isSelected={false}
            onUpdatePage={() => {}}
            availableLayouts={[]}
          />
        ))}

        {/* Page divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: "50%", zIndex: 0 }}
          />
        )}

        {/* Images */}
        {spread.images?.map((image, index) => {
          if (image.player_visible === false) return null;
          return (
            <div
              key={image.id}
              ref={registerRef(image.id)}
              className={`${getPointerClasses(image.id)} ${getHighlightClass(
                image.id
              )}`}
              onClickCapture={() => handleItemClick(image.id)}
            >
              <EditableImage
                image={image}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Shapes */}
        {spread.shapes?.map((shape, index) => {
          if (shape.player_visible === false) return null;
          return (
            <div
              key={shape.id}
              ref={registerRef(shape.id)}
              className={`${getPointerClasses(shape.id)} ${getHighlightClass(
                shape.id
              )}`}
              onClickCapture={() => handleItemClick(shape.id)}
            >
              <EditableShape
                shape={shape}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Videos */}
        {spread.videos?.map((video, index) => {
          if (video.player_visible === false) return null;
          return (
            <div
              key={video.id}
              ref={registerRef(video.id)}
              className={`${getPointerClasses(video.id)} ${getHighlightClass(
                video.id
              )}`}
              onClickCapture={() => handleItemClick(video.id)}
            >
              <EditableVideo
                video={video}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Audios */}
        {spread.audios?.map((audio, index) => {
          if (audio.player_visible === false) return null;
          return (
            <div
              key={audio.id}
              ref={registerRef(audio.id)}
              className={`${getPointerClasses(audio.id)} ${getHighlightClass(
                audio.id
              )}`}
              onClickCapture={() => handleItemClick(audio.id)}
            >
              <EditableAudio
                audio={audio}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Quizzes */}
        {spread.quizzes?.map((quiz, index) => {
          if (quiz.player_visible === false) return null;
          return (
            <div
              key={quiz.id}
              ref={registerRef(quiz.id)}
              className={`${getPointerClasses(quiz.id)} ${getHighlightClass(
                quiz.id
              )}`}
              onClickCapture={() => handleItemClick(quiz.id)}
            >
              <EditableQuiz
                quiz={quiz}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Textboxes */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          const audioMedia = data.audio?.media;
          const syncedMedia = audioMedia?.find((m) => m.script_synced) ?? audioMedia?.[0];
          return (
            <div
              key={textbox.id}
              ref={registerRef(textbox.id)}
              className={`${getPointerClasses(textbox.id)} ${getHighlightClass(
                textbox.id
              )}`}
              onClickCapture={() => handleItemClick(textbox.id)}
            >
              <EditableTextbox
                textboxContent={data}
                index={index}
                zIndex={TEXTBOX_Z_INDEX_BASE + index}
                isSelected={false}
                isSelectable={false}
                isEditable={false}
                onSelect={() => {}}
                onTextChange={() => {}}
                onEditingChange={() => {}}
                wordTimings={syncedMedia?.word_timings}
              />
            </div>
          );
        })}
      </div>

      {/* Player controls sidebar */}
      <PlayerControlSidebar
        onPlayModeChange={onPlayModeChange}
        onNext={handleNext}
        onBack={handleBack}
        canNext={canGoNext}
        canBack={canGoBack}
      />

      {/* Quiz modal */}
      {activeQuizId &&
        (() => {
          const activeQuiz = spread.quizzes?.find((q) => q.id === activeQuizId);
          if (!activeQuiz) return null;
          return (
            <PlayQuizModal
              quiz={activeQuiz}
              languageKey={editorLangCode}
              onClose={handleQuizModalClose}
            />
          );
        })()}
    </div>
  );
}
