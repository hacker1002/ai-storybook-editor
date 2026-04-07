// spreads-creative-space.tsx - Root container for illustration spreads creative space
"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { SpreadsMainView } from "./spreads-main-view";
import { SpreadsSidebar } from "./spreads-sidebar";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import { useCurrentBook, useBookTemplateLayout, useBookTypography } from "@/stores/book-store";
import { useTemplateLayouts } from "@/hooks/use-template-layouts";
import { useLanguageCode } from "@/stores/editor-settings-store";
import {
  buildIllustrationItemsFromTemplate,
  findTemplateById,
  mergeItems,
} from "@/utils/template-layout-utils";
import { createLogger } from "@/utils/logger";
import type { SelectedItem } from "./utils";
import type { BaseSpread, PageData, SpreadImage, SpreadTextbox } from "@/features/editor/components/canvas-spread-view";

const log = createLogger("Editor", "SpreadsCreativeSpace");

export function SpreadsCreativeSpace() {
  // useShallow: .map() returns new array ref each call — must shallow-compare
  const illustrationSpreadIds = useSnapshotStore(
    useShallow((s) => s.illustration?.spreads?.map((sp) => sp.id) ?? [])
  );
  const actions = useSnapshotActions();
  const book = useCurrentBook();
  const templateLayout = useBookTemplateLayout();
  const bookTypography = useBookTypography();
  const langCode = useLanguageCode();
  const { singlePageLayouts } = useTemplateLayouts(book?.book_type ?? null);

  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<
    string | null
  >(null);
  const [selectedItemId, setSelectedItemId] = useState<SelectedItem | null>(
    null
  );

  // Auto-add 1 default single spread when illustration has no spreads
  const hasAutoAdded = useRef(false);
  useEffect(() => {
    if (illustrationSpreadIds.length > 0 || hasAutoAdded.current) return;
    hasAutoAdded.current = true;

    let raw_images: SpreadImage[] = [];
    let raw_textboxes: SpreadTextbox[] = [];

    if (templateLayout) {
      const leftTpl = findTemplateById(singlePageLayouts, templateLayout.left_page);
      const rightTpl = findTemplateById(singlePageLayouts, templateLayout.right_page);
      const leftItems = leftTpl
        ? buildIllustrationItemsFromTemplate(leftTpl, 'left', langCode, bookTypography)
        : { images: [] as SpreadImage[], textboxes: [] as SpreadTextbox[] };
      const rightItems = rightTpl
        ? buildIllustrationItemsFromTemplate(rightTpl, 'right', langCode, bookTypography)
        : { images: [] as SpreadImage[], textboxes: [] as SpreadTextbox[] };
      const merged = mergeItems(leftItems, rightItems);
      raw_images = merged.images;
      raw_textboxes = merged.textboxes;
    }

    const defaultSpread: BaseSpread = {
      id: crypto.randomUUID(),
      pages: [
        { number: 0, type: 'normal_page', layout: null, background: { color: '#FFFFFF', texture: null } },
        { number: 1, type: 'normal_page', layout: null, background: { color: '#FFFFFF', texture: null } },
      ] as PageData[],
      raw_images,
      raw_textboxes,
      images: [],
      textboxes: [],
    };

    log.info('autoAddDefaultSpread', 'illustration has no spreads, adding default single spread', { spreadId: defaultSpread.id });
    actions.addIllustrationSpread(defaultSpread);
  }, [illustrationSpreadIds.length, actions, templateLayout, singlePageLayouts, langCode, bookTypography]);

  // Derive effective spread: user choice if valid, else first available
  const selectedSpreadId = useMemo(() => {
    if (
      userSelectedSpreadId &&
      illustrationSpreadIds.includes(userSelectedSpreadId)
    ) {
      return userSelectedSpreadId;
    }
    return illustrationSpreadIds[0] ?? null;
  }, [illustrationSpreadIds, userSelectedSpreadId]);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadSelect", "spread selected", { spreadId });
    setUserSelectedSpreadId(spreadId);
    setSelectedItemId(null);
  }, []);

  const handleItemSelect = useCallback(
    (item: SelectedItem | null) => {
      log.debug("handleItemSelect", "item selection changed", { item });
      setSelectedItemId(item);
    },
    []
  );

  return (
    <div
      className="flex h-full"
      role="main"
      aria-label="Spreads creative space"
    >
      <SpreadsSidebar
        selectedSpreadId={selectedSpreadId ?? ""}
        selectedItemId={selectedItemId}
        onItemSelect={handleItemSelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedSpreadId ? (
          <SpreadsMainView
            selectedSpreadId={selectedSpreadId}
            selectedItemId={selectedItemId}
            onSpreadSelect={handleSpreadSelect}
            onItemSelect={handleItemSelect}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No spreads yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SpreadsCreativeSpace;
