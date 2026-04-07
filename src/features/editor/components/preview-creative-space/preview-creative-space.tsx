// preview-creative-space.tsx - Dedicated creative space for animation preview/playback
// Always uses retouch animation data regardless of current pipeline step.
// Renders PlayerAnimationSidebar + PlayableSpreadView(mode=player).
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
  useSections,
} from "@/stores/snapshot-store/selectors";
import { useNarrationLanguage } from "@/stores/animation-playback-store";
import { useBookTemplateLayout } from "@/stores/book-store";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "PreviewCreativeSpace");

export function PreviewCreativeSpace() {
  const languageCode = useNarrationLanguage();
  const templateLayout = useBookTemplateLayout();

  // Always use retouch data — animations only exist in retouch step
  const spreadIds = useRetouchSpreadIds();
  const spreads = useRetouchSpreads();
  const sections = useSections();

  // Local state: selected spread (default = first)
  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<string | null>(null);

  const effectiveSpreadId = useMemo(() => {
    if (userSelectedSpreadId && spreadIds.includes(userSelectedSpreadId)) {
      return userSelectedSpreadId;
    }
    return spreadIds[0] ?? null;
  }, [spreadIds, userSelectedSpreadId]);

  const currentSpread = useRetouchSpreadById(effectiveSpreadId ?? "");
  const animations = useRetouchAnimations(effectiveSpreadId ?? "");

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

  // Branch setting for the current spread (if any)
  const branchSetting = currentSpread?.branch_setting ?? null;

  log.debug("render", "PreviewCreativeSpace", {
    spreadCount: spreadIds.length,
    hasBranch: !!branchSetting,
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
      <PlayerAnimationSidebar
        animations={resolvedAnimations}
        branchSetting={branchSetting}
      />
      <div className="flex-1 overflow-hidden">
        <PlayableSpreadView
          mode="player"
          spreads={playableSpreads}
          sections={sections}
          onSpreadSelect={setUserSelectedSpreadId}
          pageNumbering={templateLayout?.page_numbering}
        />
      </div>
    </div>
  );
}
