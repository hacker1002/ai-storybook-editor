// spreads-main-view.tsx - CanvasSpreadView wrapper for illustration phase (image, textbox, shape only)

import { useCallback, useMemo, useState } from 'react';

import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  GenerateImageModal,
} from '@/features/editor/components/shared-components';
import {
  cloneItemWithNewId,
  nextTopZInTier,
  shiftTextboxLanguageGeometries,
} from '@/features/editor/utils/duplicate-item-helpers';
import {
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { getTextboxContentForLanguage } from '@/features/editor/utils/textbox-helpers';
import { useLanguageCode } from '@/stores/editor-settings-store';
import { useCurrentBook, useBookTemplateLayout, useBookTypography } from '@/stores/book-store';
import { useTemplateLayouts } from '@/hooks/use-template-layouts';
import {
  buildIllustrationItemsFromTemplate,
  findTemplateById,
  mergeItems,
} from '@/utils/template-layout-utils';
import { createLogger } from '@/utils/logger';
import { useInteractionLayerContext } from '@/features/editor/contexts/interaction-layer-provider';
import { useGlobalHotkey } from '@/features/editor/contexts/use-global-hotkey';
import { SpreadsImageToolbar } from './spreads-image-toolbar';
import { SpreadsTextToolbar } from './spreads-text-toolbar';
import { SpreadsShapeToolbar } from './spreads-shape-toolbar';
import { SpreadsPageToolbar } from './spreads-page-toolbar';
import type { SelectedItem } from './utils';
import type { ViewMode } from '@/types/canvas-types';
import type {
  SpreadType,
  BaseSpread,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  ShapeToolbarContext,
  PageToolbarContext,
  LayoutOption,
  SpreadItemActionUnion,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  PageData,
} from '@/features/editor/components/canvas-spread-view';

const EMPTY_SPREADS: BaseSpread[] = [];
const log = createLogger('Editor', 'SpreadsMainView');

const matchCtrlD = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd';

const SPREADS_FORBIDDEN = ['page'] as const;

/** Resolve the best available image URL for an illustration spread image.
 *  Priority: final hi-res → selected illustration → first illustration → null */
function resolveIllustrationImageUrl(image: SpreadImage): string | null {
  if (image.final_hires_media_url) return image.final_hires_media_url;
  const selected = image.illustrations?.find((v) => v.is_selected);
  if (selected?.media_url) return selected.media_url;
  if (image.illustrations?.[0]?.media_url) return image.illustrations[0].media_url;
  return null;
}

// Map DB template_layouts → LayoutOption for page toolbar dropdown
function toLayoutOptions(layouts: { id: string; title: string; thumbnail_url: string; type: number }[]): LayoutOption[] {
  return layouts.map((l) => ({
    id: l.id,
    title: l.title,
    thumbnail_url: l.thumbnail_url ?? '',
    type: l.type as 1 | 2,
  }));
}

interface SpreadsMainViewProps {
  selectedSpreadId: string;
  selectedItemId: SelectedItem | null;
  onSpreadSelect: (spreadId: string) => void;
  onItemSelect: (item: SelectedItem | null) => void;
  viewMode: ViewMode;
  zoomLevel: number;
  columnsPerRow: number;
  onViewModeChange: (mode: ViewMode) => void;
  onZoomChange: (level: number) => void;
  onColumnsChange: (columns: number) => void;
}

export function SpreadsMainView({
  selectedSpreadId,
  selectedItemId,
  onSpreadSelect,
  onItemSelect,
  viewMode,
  zoomLevel,
  columnsPerRow,
  onViewModeChange,
  onZoomChange,
  onColumnsChange,
}: SpreadsMainViewProps) {
  // Stable ref: return store array directly, fallback to module-level constant
  const illustrationSpreads = useSnapshotStore(
    (s) => s.illustration?.spreads ?? EMPTY_SPREADS
  );
  const actions = useSnapshotActions();
  const langCode = useLanguageCode();
  const book = useCurrentBook();
  const templateLayout = useBookTemplateLayout();
  const bookTypography = useBookTypography();
  const { spreadLayouts, singlePageLayouts, allLayouts } = useTemplateLayouts(book?.book_type ?? null);

  // DB layouts → LayoutOption[] for page toolbar dropdown (page-item filters by type internally)
  const availableLayouts = useMemo(() => toLayoutOptions(allLayouts), [allLayouts]);

  // === Spread-level handlers ===

  const handleSpreadAdd = useCallback(
    (type: SpreadType) => {
      const nextPageNum = illustrationSpreads.length * 2;
      const basePage: PageData = {
        number: nextPageNum,
        type: 'normal_page',
        layout: null,
        background: { color: '#FFFFFF', texture: null },
      };

      // 'double' = DPS → 1 page spanning two numbers; 'single' = non-DPS → 2 pages
      const pages: PageData[] =
        type === 'double'
          ? [{ ...basePage, number: `${nextPageNum}-${nextPageNum + 1}` }]
          : [basePage, { ...basePage, number: nextPageNum + 1 }];

      // Populate raw_images/raw_textboxes from template (silent empty fallback)
      let raw_images: SpreadImage[] = [];
      let raw_textboxes: SpreadTextbox[] = [];

      if (templateLayout) {
        if (type === 'double') {
          const tpl = findTemplateById(spreadLayouts, templateLayout.spread);
          if (tpl) {
            const items = buildIllustrationItemsFromTemplate(tpl, 'full', langCode, bookTypography);
            raw_images = items.images;
            raw_textboxes = items.textboxes;
          }
        } else {
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
      }

      const newSpread: BaseSpread = {
        id: crypto.randomUUID(),
        pages,
        raw_images,
        raw_textboxes,
        images: [],
        textboxes: [],
      };
      log.info('handleSpreadAdd', 'adding spread', { type, spreadId: newSpread.id });
      actions.addIllustrationSpread(newSpread);
      onSpreadSelect(newSpread.id);
    },
    [actions, illustrationSpreads.length, onSpreadSelect, templateLayout, spreadLayouts, singlePageLayouts, langCode, bookTypography]
  );

  const handleDeleteSpread = useCallback(
    (spreadId: string) => {
      log.info('handleDeleteSpread', 'deleting spread', { spreadId });
      actions.deleteIllustrationSpread(spreadId);
    },
    [actions]
  );

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      log.debug('handleSpreadReorder', 'reorder', { fromIndex, toIndex });
      actions.reorderIllustrationSpreads(fromIndex, toIndex);
    },
    [actions]
  );

  // Unified item action handler — dispatches to illustration store per type
  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId, itemType, action, itemId, data } = params;
      log.debug('handleSpreadItemAction', 'dispatch', { spreadId, itemType, action });

      switch (itemType) {
        case 'image':
          if (action === 'add')
            actions.addRawImage(spreadId, data as SpreadImage);
          else if (action === 'update')
            actions.updateRawImage(spreadId, itemId as string, data as Partial<SpreadImage>);
          else if (action === 'delete')
            actions.deleteRawImage(spreadId, itemId as string);
          break;
        case 'textbox':
          if (action === 'add')
            actions.addRawTextbox(spreadId, data as SpreadTextbox);
          else if (action === 'update')
            actions.updateRawTextbox(spreadId, itemId as string, data as Partial<SpreadTextbox>);
          else if (action === 'delete')
            actions.deleteRawTextbox(spreadId, itemId as string);
          break;
        case 'shape':
          if (action === 'add')
            actions.addRetouchShape(spreadId, data as SpreadShape);
          else if (action === 'update')
            actions.updateRetouchShape(spreadId, itemId as string, data as Partial<SpreadShape>);
          else if (action === 'delete')
            actions.deleteRetouchShape(spreadId, itemId as string);
          break;
        case 'page':
          if (action === 'update' && typeof itemId === 'number') {
            const spread = illustrationSpreads.find((s) => s.id === spreadId);
            if (!spread) break;
            const pageUpdates = data as Partial<PageData>;
            const pageIndex = itemId;

            // Layout change → delete old items on this page, add new items from template
            if (pageUpdates.layout !== undefined && pageUpdates.layout !== null) {
              const template = findTemplateById(allLayouts, pageUpdates.layout);
              const isDPS = spread.pages.length === 1;
              const side: 'full' | 'left' | 'right' = isDPS ? 'full' : pageIndex === 0 ? 'left' : 'right';

              // Filter: keep items NOT on this page
              const isOnThisPage = (x: number) => {
                if (isDPS) return true;
                return pageIndex === 0 ? x < 50 : x >= 50;
              };

              const existingImages = spread.raw_images ?? [];
              const existingTextboxes = spread.raw_textboxes ?? [];

              const keptImages = existingImages.filter((img) => !isOnThisPage(img.geometry.x));
              const keptTextboxes = existingTextboxes.filter((tb) => {
                for (const val of Object.values(tb)) {
                  if (typeof val === 'object' && val !== null && 'geometry' in val) {
                    return !isOnThisPage((val as { geometry: { x: number } }).geometry.x);
                  }
                }
                return true; // no geometry found → keep
              });

              // Build new items from selected template
              let newImages: SpreadImage[] = [];
              let newTextboxes: SpreadTextbox[] = [];
              if (template) {
                const items = buildIllustrationItemsFromTemplate(template, side, langCode, bookTypography);
                newImages = items.images;
                newTextboxes = items.textboxes;
              }

              const newPages = [...spread.pages];
              newPages[pageIndex] = { ...newPages[pageIndex], ...pageUpdates };
              actions.updateIllustrationSpread(spreadId, {
                raw_images: [...keptImages, ...newImages],
                raw_textboxes: [...keptTextboxes, ...newTextboxes],
                pages: newPages,
              });

              log.info('handleSpreadItemAction', 'layout changed — items replaced', {
                spreadId, pageIndex, layoutId: pageUpdates.layout,
                removed: existingImages.length - keptImages.length + existingTextboxes.length - keptTextboxes.length,
                added: newImages.length + newTextboxes.length,
              });
            } else {
              // Non-layout page update (color, texture, etc.)
              const newPages = [...spread.pages];
              newPages[pageIndex] = { ...newPages[pageIndex], ...pageUpdates };
              actions.updateIllustrationSpread(spreadId, { pages: newPages });
            }
          }
          break;
      }
    },
    [actions, illustrationSpreads, allLayouts, langCode, bookTypography]
  );

  // === Generate image modal state ===
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateModalImageId, setGenerateModalImageId] = useState<string | null>(null);

  // Derive live image from store so modal reflects generation results in real-time
  const generateModalImage = useMemo(() => {
    if (!generateModalImageId) return null;
    const spread = illustrationSpreads.find((s) => s.id === selectedSpreadId);
    return spread?.raw_images?.find((img) => img.id === generateModalImageId) ?? null;
  }, [generateModalImageId, illustrationSpreads, selectedSpreadId]);

  const openGenerateModal = useCallback((image: SpreadImage) => {
    setGenerateModalImageId(image.id);
    setGenerateModalOpen(true);
  }, []);

  const handleGenerateImageUpdate = useCallback(
    (imageId: string, updates: Partial<SpreadImage>) => {
      handleSpreadItemAction({
        spreadId: selectedSpreadId,
        itemType: 'image',
        action: 'update',
        itemId: imageId,
        data: updates,
      });
    },
    [selectedSpreadId, handleSpreadItemAction]
  );

  // === Page & deselect handlers ===

  const handlePageSelect = useCallback(
    (pageIndex: number) => onItemSelect({ type: 'page', id: `page-${pageIndex}` }),
    [onItemSelect]
  );

  const handleDeselect = useCallback(
    () => onItemSelect(null),
    [onItemSelect]
  );

  // === Toolbar handlers ===

  const handleDuplicateItem = useCallback(
    (itemType: 'raw_image' | 'raw_textbox' | 'shape', itemId: string) => {
      const spread = illustrationSpreads.find((s) => s.id === selectedSpreadId);
      if (!spread) {
        log.warn('handleDuplicateItem', 'spread not found', { selectedSpreadId });
        return;
      }

      if (itemType === 'raw_image') {
        // raw_images không có z-index → không cascade
        const source = spread.raw_images?.find((i) => i.id === itemId);
        if (!source) { log.warn('handleDuplicateItem', 'source not found', { itemType, itemId }); return; }
        const cloned = cloneItemWithNewId(source);
        actions.addRawImage(selectedSpreadId, cloned);
        log.info('handleDuplicateItem', 'duplicated', { itemType, sourceId: itemId, cloneId: cloned.id });
        onItemSelect({ type: 'raw_image', id: cloned.id });
      } else if (itemType === 'raw_textbox') {
        // raw_textboxes không có z-index → không cascade
        const source = spread.raw_textboxes?.find((t) => t.id === itemId);
        if (!source) { log.warn('handleDuplicateItem', 'source not found', { itemType, itemId }); return; }
        const cloned = cloneItemWithNewId(source);
        shiftTextboxLanguageGeometries(cloned as unknown as Record<string, unknown>);
        actions.addRawTextbox(selectedSpreadId, cloned);
        log.info('handleDuplicateItem', 'duplicated', { itemType, sourceId: itemId, cloneId: cloned.id });
        onItemSelect({ type: 'raw_textbox', id: cloned.id });
      } else if (itemType === 'shape') {
        const source = spread.shapes?.find((s) => s.id === itemId);
        if (!source) { log.warn('handleDuplicateItem', 'source not found', { itemType, itemId }); return; }

        // Top-push: clone goes above all existing mix-tier items regardless of source position.
        const newZ = nextTopZInTier(spread, 'mix');
        const cloned = cloneItemWithNewId(source);
        cloned['z-index'] = newZ;
        actions.addRetouchShape(selectedSpreadId, cloned);
        log.info('handleDuplicateItem', 'duplicated', { itemType, sourceId: itemId, cloneId: cloned.id, newZ });
        onItemSelect({ type: 'shape', id: cloned.id });
      }
    },
    [actions, illustrationSpreads, selectedSpreadId, onItemSelect]
  );

  const { stackRef } = useInteractionLayerContext();

  useGlobalHotkey(
    matchCtrlD,
    () => {
      if (stackRef.current.modal !== null) {
        log.debug('useGlobalHotkey', 'ctrl-d blocked by modal');
        return;
      }
      if (!selectedItemId) {
        log.debug('useGlobalHotkey', 'ctrl-d no item selected');
        return;
      }
      if ((SPREADS_FORBIDDEN as readonly string[]).includes(selectedItemId.type)) {
        log.debug('useGlobalHotkey', 'ctrl-d forbidden type', { type: selectedItemId.type });
        return;
      }
      log.debug('useGlobalHotkey', 'ctrl-d duplicating', { type: selectedItemId.type, id: selectedItemId.id });
      handleDuplicateItem(
        selectedItemId.type as 'raw_image' | 'raw_textbox' | 'shape',
        selectedItemId.id
      );
    },
    [selectedItemId, handleDuplicateItem, stackRef]
  );

  // === Toolbar render props ===

  const renderIllustrationImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => (
      <SpreadsImageToolbar
        context={{
          ...context,
          onGenerateImage: () => openGenerateModal(context.item),
          onClone: () => handleDuplicateItem('raw_image', context.item.id),
        }}
      />
    ),
    [openGenerateModal, handleDuplicateItem]
  );

  const renderIllustrationTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <SpreadsTextToolbar
        context={{
          ...context,
          onClone: () => handleDuplicateItem('raw_textbox', context.item.id),
        }}
      />
    ),
    [handleDuplicateItem]
  );

  const renderIllustrationShapeToolbar = useCallback(
    (context: ShapeToolbarContext<BaseSpread>) => (
      <SpreadsShapeToolbar
        context={{
          ...context,
          onClone: () => handleDuplicateItem('shape', context.item.id),
        }}
      />
    ),
    [handleDuplicateItem]
  );

  const renderIllustrationPageToolbar = useCallback(
    (context: PageToolbarContext<BaseSpread>) => (
      <SpreadsPageToolbar context={context} />
    ),
    []
  );

  // === Render props ===

  const renderIllustrationImage = useCallback(
    (context: ImageItemContext<BaseSpread>) => {
      const img = context.item as SpreadImage;
      const imageUrl = resolveIllustrationImageUrl(img);
      return (
        <EditableImage
          image={{ ...context.item, media_url: imageUrl ?? undefined }}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={context.isSelected}
          isEditable={context.isSpreadSelected}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'raw_image', id: context.item.id });
          }}
          onArtNoteChange={(artNote) => context.onUpdate({ art_note: artNote })}
          onEditingChange={context.onEditingChange}
        />
      );
    },
    [onItemSelect]
  );

  const renderIllustrationTextbox = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      const tb = context.item as SpreadTextbox;
      const result = getTextboxContentForLanguage(tb as unknown as Record<string, unknown>, langCode);
      if (!result) return null;
      const { langKey, content } = result;
      return (
        <EditableTextbox
          textboxContent={content}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={context.isSelected}
          isSelectable={context.isSpreadSelected}
          isEditable={context.isSpreadSelected}
          isEditing={context.isEditing}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'raw_textbox', id: context.item.id });
          }}
          onTextChange={(newText) => {
            context.onUpdate({
              [langKey]: { ...content, text: newText },
            } as unknown as Partial<SpreadTextbox>);
          }}
          onEditingChange={context.onEditingChange ?? (() => {})}
        />
      );
    },
    [onItemSelect, langCode]
  );

  const renderIllustrationShape = useCallback(
    (context: ShapeItemContext<BaseSpread>) => {
      return (
        <EditableShape
          shape={context.item}
          index={context.itemIndex}
          zIndex={context.zIndex}
          isSelected={context.isSelected}
          isEditable={context.isSpreadSelected}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'shape', id: context.item.id });
          }}
        />
      );
    },
    [onItemSelect]
  );

  return (
    <>
      <CanvasSpreadView
        spreads={illustrationSpreads}
        selectedSpreadId={selectedSpreadId}
        viewMode={viewMode}
        zoomLevel={zoomLevel}
        columnsPerRow={columnsPerRow}
        renderItems={['raw_image', 'raw_textbox', 'shape']}
        renderRawImage={renderIllustrationImage}
        renderRawTextbox={renderIllustrationTextbox}
        renderShapeItem={renderIllustrationShape}
        renderRawImageToolbar={renderIllustrationImageToolbar}
        renderRawTextboxToolbar={renderIllustrationTextToolbar}
        renderShapeToolbar={renderIllustrationShapeToolbar}
        renderPageToolbar={renderIllustrationPageToolbar}
        availableLayouts={availableLayouts}
        onSpreadSelect={onSpreadSelect}
        onViewModeChange={onViewModeChange}
        onZoomChange={onZoomChange}
        onColumnsChange={onColumnsChange}
        onSpreadReorder={handleSpreadReorder}
        onSpreadAdd={handleSpreadAdd}
        onDeleteSpread={handleDeleteSpread}
        onUpdateSpreadItem={handleSpreadItemAction}
        isEditable={true}
        canAddSpread={true}
        canDeleteSpread={true}
        canReorderSpread={true}
        canResizeItem={true}
        canDragItem={true}
        externalSelectedItemId={selectedItemId}
        onPageSelect={handlePageSelect}
        onDeselect={handleDeselect}
        pageNumbering={templateLayout?.page_numbering}
      />
      {generateModalImage && (
        <GenerateImageModal
          open={generateModalOpen}
          onOpenChange={setGenerateModalOpen}
          spreadId={selectedSpreadId}
          image={generateModalImage}
          onUpdateImage={(updates) => {
            handleGenerateImageUpdate(generateModalImage.id, updates);
          }}
        />
      )}
    </>
  );
}

export default SpreadsMainView;
