// preview-creative-space.tsx — Source-aware preview/playback creative space.
// User picks between Original (snapshot retouch data) or one of the remixes via
// PlayerHeader; spreads, sections, and animations are derived from the chosen
// source. Language fallback + write-back is handled here when the active remix
// does not support the current narrationLanguage.
"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { PlayerAnimationSidebar } from "./player-animation-sidebar";
import { PlayerHeader } from "./player-header";
import { resolveEffectiveLanguage } from "./resolve-effective-language";
import {
  PlayableSpreadView,
  type PlayableSpread,
} from "@/features/editor/components/playable-spread-view";
import {
  resolveAnimations,
  buildItemsMap,
} from "@/features/editor/components/objects-creative-space";
import {
  useRetouchSpreads,
  useSections,
} from "@/stores/snapshot-store/selectors";
import {
  useNarrationLanguage,
  usePlaybackStore,
} from "@/stores/animation-playback-store";
import { useRemixes, useRemixById } from "@/stores/remix-store";
import { useBookTemplateLayout } from "@/stores/book-store";
import { createLogger } from "@/utils/logger";
import type { BaseSpread } from "@/types/spread-types";
import type { Section } from "@/types/illustration-types";

const log = createLogger("Editor", "PreviewCreativeSpace");

// Human-readable language labels for fallback toast.
const LANG_LABEL: Record<string, string> = {
  vi: "Tiếng Việt",
  vi_VN: "Tiếng Việt",
  en: "English",
  en_US: "English (US)",
  en_GB: "English (UK)",
  ja: "日本語",
  ja_JP: "日本語",
  zh: "中文",
  zh_CN: "中文（简体）",
  fr: "Français",
  fr_FR: "Français",
  es: "Español",
  es_ES: "Español",
  ko: "한국어",
  ko_KR: "한국어",
};

function labelOf(code: string): string {
  return LANG_LABEL[code] ?? code.toUpperCase();
}

export function PreviewCreativeSpace() {
  const narrationLanguage = useNarrationLanguage();
  const templateLayout = useBookTemplateLayout();

  // Local source state — Original by default. Decoupled from RemixStore.activeRemixId
  // (Remix space's selection MUST NOT leak into Preview's source picker).
  const [userSelectedRemixId, setUserSelectedRemixId] = useState<string | null>(null);
  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<string | null>(null);

  const remixes = useRemixes();
  const activeRemix = useRemixById(userSelectedRemixId);

  // Unconditional store subs (rule of hooks); pick source in derived useMemo below.
  const retouchSpreads = useRetouchSpreads();
  const retouchSections = useSections();

  // Stale-remix self-heal: if the picked remix was deleted we treat the source
  // as Original via derivation (no setState — avoids react-hooks/set-state-in-effect).
  // The lingering `userSelectedRemixId` is harmless because every downstream
  // derivation keys off `activeRemix` (which is null when stale).
  const effectiveSelectedRemixId = activeRemix ? userSelectedRemixId : null;
  const isStale = userSelectedRemixId !== null && activeRemix === null;
  useEffect(() => {
    if (isStale) {
      log.warn("source.stale", "remix not found, treating as Original", {
        userSelectedRemixId,
      });
    }
  }, [isStale, userSelectedRemixId]);

  // Source-aware derivation. RemixSpread = Omit<BaseSpread, ...> where the omitted
  // fields are all optional in BaseSpread, so the assignment is structurally safe.
  const spreads: BaseSpread[] = useMemo(() => {
    if (activeRemix) return activeRemix.illustration.spreads as BaseSpread[];
    return retouchSpreads;
  }, [activeRemix, retouchSpreads]);

  const sections: Section[] = useMemo(() => {
    if (activeRemix) return activeRemix.illustration.sections;
    return retouchSections;
  }, [activeRemix, retouchSections]);

  const spreadIds = useMemo(() => spreads.map((s) => s.id), [spreads]);

  const effectiveSpreadId = useMemo(() => {
    if (userSelectedSpreadId && spreadIds.includes(userSelectedSpreadId)) {
      return userSelectedSpreadId;
    }
    return spreadIds[0] ?? null;
  }, [spreadIds, userSelectedSpreadId]);

  const currentSpread = useMemo(
    () => spreads.find((s) => s.id === effectiveSpreadId) ?? null,
    [spreads, effectiveSpreadId],
  );

  const effectiveLanguage = useMemo(
    () => resolveEffectiveLanguage(activeRemix, narrationLanguage),
    [activeRemix, narrationLanguage],
  );

  const itemsMap = useMemo(
    () => buildItemsMap(currentSpread ?? undefined, effectiveLanguage),
    [currentSpread, effectiveLanguage],
  );

  const resolvedAnimations = useMemo(
    () => resolveAnimations(currentSpread?.animations ?? [], itemsMap),
    [currentSpread, itemsMap],
  );

  const playableSpreads = useMemo((): PlayableSpread[] => {
    return spreads.map((spread) => ({
      ...spread,
      animations: spread.animations ?? [],
    } as PlayableSpread));
  }, [spreads]);

  const branchSetting = currentSpread?.branch_setting ?? null;

  // Strategy B: explicit playback reset on source switch. PlayableSpreadView does
  // not auto-reset on spreads reference change (verified phase-03 Bước 1), so we
  // drive the reset here to guarantee clean playback when switching Original ↔
  // remix or remix ↔ remix.
  const activeRemixId = activeRemix?.id ?? null;
  useEffect(() => {
    usePlaybackStore.getState().resetStore();
    log.info("source.switch", "playback reset", {
      sourceKind: activeRemixId ? "remix" : "original",
      remixId: activeRemixId,
    });
  }, [activeRemixId]);

  // Language fallback write-back + toast. Only fires on transition; the guard
  // (effectiveLanguage === narrationLanguage after write-back) prevents looping.
  useEffect(() => {
    if (activeRemix === null) return;
    if (effectiveLanguage === narrationLanguage) return;

    usePlaybackStore.getState().setNarrationLanguage(effectiveLanguage);

    log.info("language.fallback", "transition + write-back", {
      remixId: activeRemix.id,
      requested: narrationLanguage,
      applied: effectiveLanguage,
    });

    toast.info(
      `Showing in ${labelOf(effectiveLanguage)} — "${activeRemix.name}" doesn't support ${labelOf(narrationLanguage)}`,
    );
  }, [activeRemix, effectiveLanguage, narrationLanguage]);

  log.debug("render", "derived", {
    source: activeRemix ? "remix" : "original",
    remixId: activeRemix?.id ?? null,
    spreadCount: spreads.length,
    effectiveLanguage,
    hasBranch: !!branchSetting,
  });

  if (spreadIds.length === 0) {
    return (
      <div className="flex h-full overflow-hidden">
        <PlayerAnimationSidebar
          animations={resolvedAnimations}
          branchSetting={branchSetting}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <PlayerHeader
            remixes={remixes}
            selectedRemixId={userSelectedRemixId}
            onSelect={setUserSelectedRemixId}
          />
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">No spreads available for preview</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <PlayerAnimationSidebar
        animations={resolvedAnimations}
        branchSetting={branchSetting}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PlayerHeader
          remixes={remixes}
          selectedRemixId={effectiveSelectedRemixId}
          onSelect={setUserSelectedRemixId}
        />
        <div className="flex-1 overflow-hidden">
          <PlayableSpreadView
            spreads={playableSpreads}
            sections={sections}
            onSpreadSelect={setUserSelectedSpreadId}
            pageNumbering={templateLayout?.page_numbering}
          />
        </div>
      </div>
    </div>
  );
}
