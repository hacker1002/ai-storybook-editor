// preview-creative-space.tsx - Dedicated creative space for animation preview/playback
// Renders PlayerAnimationSidebar + PlayableSpreadView(mode=player) without editor logic.
// Supports both Illustration and Retouch steps — shows static spreads when no animations exist.
"use client";

import { useState, useMemo } from "react";
import { PlayerAnimationSidebar } from "@/features/editor/components/animations-creative-space";
import {
  PlayableSpreadView,
  type PlayableSpread,
} from "@/features/editor/components/playable-spread-view";
import {
  resolveAnimations,
  buildItemsMap,
} from "@/features/editor/components/animations-creative-space";
import {
  useRetouchSpreadIds,
  useRetouchSpreads,
  useRetouchSpreadById,
  useRetouchAnimations,
  useIllustrationSpreadIds,
  useIllustrationSpreads,
  useIllustrationSpreadById,
} from "@/stores/snapshot-store/selectors";
import { useCurrentLanguage, useCurrentStep } from "@/stores/editor-settings-store";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "PreviewCreativeSpace");

export function PreviewCreativeSpace() {
  const currentStep = useCurrentStep();
  const currentLanguage = useCurrentLanguage();
  const languageCode = currentLanguage.code;

  // Select spread data source based on current pipeline step
  const isRetouch = currentStep === "retouch";

  const retouchSpreadIds = useRetouchSpreadIds();
  const retouchSpreads = useRetouchSpreads();
  const illustrationSpreadIds = useIllustrationSpreadIds();
  const illustrationSpreads = useIllustrationSpreads();

  const spreadIds = isRetouch ? retouchSpreadIds : illustrationSpreadIds;
  const spreads = isRetouch ? retouchSpreads : illustrationSpreads;

  // Local state: selected spread (default = first)
  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<string | null>(null);

  const effectiveSpreadId = useMemo(() => {
    if (userSelectedSpreadId && spreadIds.includes(userSelectedSpreadId)) {
      return userSelectedSpreadId;
    }
    return spreadIds[0] ?? null;
  }, [spreadIds, userSelectedSpreadId]);

  // Spread data — use the correct selector based on step
  const retouchSpread = useRetouchSpreadById(isRetouch ? (effectiveSpreadId ?? "") : "");
  const illustrationSpread = useIllustrationSpreadById(!isRetouch ? (effectiveSpreadId ?? "") : "");
  const currentSpread = isRetouch ? retouchSpread : illustrationSpread;

  // Animations — only retouch has animations; illustration has none
  const animations = useRetouchAnimations(isRetouch ? (effectiveSpreadId ?? "") : "");

  // Resolved animations for sidebar
  const itemsMap = useMemo(
    () => buildItemsMap(currentSpread, languageCode),
    [currentSpread, languageCode],
  );

  const resolvedAnimations = useMemo(
    () => resolveAnimations(animations, itemsMap),
    [animations, itemsMap],
  );

  // Build PlayableSpread[] for PlayableSpreadView
  const playableSpreads = useMemo((): PlayableSpread[] => {
    return spreads.map((spread) => ({
      ...spread,
      animations: spread.animations ?? [],
    } as PlayableSpread));
  }, [spreads]);

  const hasAnimations = animations.length > 0;

  // --- Render ---
  log.debug("render", "PreviewCreativeSpace", {
    step: currentStep,
    spreadCount: spreadIds.length,
    hasAnimations,
  });

  if (spreadIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No spreads available for preview</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {hasAnimations && (
        <PlayerAnimationSidebar animations={resolvedAnimations} />
      )}
      <div className="flex-1 overflow-hidden">
        <PlayableSpreadView
          mode="player"
          spreads={playableSpreads}
          onSpreadSelect={setUserSelectedSpreadId}
        />
      </div>
    </div>
  );
}
