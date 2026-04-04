// spreads-main-view.tsx - CanvasSpreadView wrapper for illustration phase (image, textbox, shape only)

import { useCallback, useMemo, useState } from 'react';

import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  GenerateImageModal,
  clampGeometry,
} from '@/features/editor/components/shared-components';
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
import { SpreadsImageToolbar } from './spreads-image-toolbar';
import { SpreadsTextToolbar } from './spreads-text-toolbar';
import { SpreadsShapeToolbar } from './spreads-shape-toolbar';
import { SpreadsPageToolbar } from './spreads-page-toolbar';
import type { SelectedItem } from './utils';
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

/** Resolve the best available image URL for an illustration spread image.
 *  Priority: final hi-res → selected illustration → first illustration → null */
function resolveIllustrationImageUrl(image: SpreadImage): string | null {
  if (image.final_hires_media_url) return image.final_hires_media_url;
  const selected = image.illustrations?.find((v) => v.is_selected);
  if (selected?.media_url) return selected.media_url;
  if (image.illustrations?.[0]?.media_url) return image.illustrations[0].media_url;
  return null;
}

// Hardcoded layout constants for page toolbar (textures are hardcoded in page-item.tsx)
const AVAILABLE_LAYOUTS: LayoutOption[] = [
  { id: 'default', title: 'Default', thumbnail_url: '', type: 1 },
  { id: 'full-bleed', title: 'Full Bleed', thumbnail_url: '', type: 1 },
  { id: 'centered', title: 'Centered', thumbnail_url: '', type: 1 },
];

interface SpreadsMainViewProps {
  selectedSpreadId: string;
  selectedItemId: SelectedItem | null;
  onSpreadSelect: (spreadId: string) => void;
  onItemSelect: (item: SelectedItem | null) => void;
}

export function SpreadsMainView({
  selectedSpreadId,
  selectedItemId,
  onSpreadSelect,
  onItemSelect,
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
  const { spreadLayouts, singlePageLayouts } = useTemplateLayouts(book?.book_type ?? null);

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

      // Populate images/textboxes from template (silent empty fallback if not configured)
      let images: SpreadImage[] = [];
      let textboxes: SpreadTextbox[] = [];

      if (templateLayout) {
        if (type === 'double') {
          const tpl = findTemplateById(spreadLayouts, templateLayout.spread);
          if (tpl) {
            const items = buildIllustrationItemsFromTemplate(tpl, 'full', langCode, bookTypography);
            images = items.images;
            textboxes = items.textboxes;
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
          images = merged.images;
          textboxes = merged.textboxes;
        }
      }

      const newSpread: BaseSpread = {
        id: crypto.randomUUID(),
        pages,
        images,
        textboxes,
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
            const newPages = [...spread.pages];
            newPages[itemId] = { ...newPages[itemId], ...(data as Partial<PageData>) };
            actions.updateIllustrationSpread(spreadId, { pages: newPages });
          }
          break;
      }
    },
    [actions, illustrationSpreads]
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

  const handleCloneShape = useCallback(
    (spreadId: string, shape: SpreadShape) => {
      const newShape: SpreadShape = {
        ...structuredClone(shape),
        id: crypto.randomUUID(),
        geometry: {
          ...shape.geometry,
          x: clampGeometry('x', shape.geometry.x + 2),
          y: clampGeometry('y', shape.geometry.y + 2),
        },
      };
      log.info('handleCloneShape', 'cloning shape', { spreadId, originalId: shape.id, newId: newShape.id });
      actions.addRetouchShape(spreadId, newShape);
    },
    [actions]
  );

  // === Toolbar render props ===

  const renderIllustrationImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => (
      <SpreadsImageToolbar
        context={{
          ...context,
          onGenerateImage: () => openGenerateModal(context.item),
        }}
      />
    ),
    [openGenerateModal]
  );

  const renderIllustrationTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => (
      <SpreadsTextToolbar context={context} />
    ),
    []
  );

  const renderIllustrationShapeToolbar = useCallback(
    (context: ShapeToolbarContext<BaseSpread>) => (
      <SpreadsShapeToolbar
        context={{
          ...context,
          onClone: () => handleCloneShape(selectedSpreadId, context.item),
        }}
      />
    ),
    [selectedSpreadId, handleCloneShape]
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
        initialSelectedId={selectedSpreadId}
        renderItems={['raw_image', 'raw_textbox', 'shape']}
        renderRawImage={renderIllustrationImage}
        renderRawTextbox={renderIllustrationTextbox}
        renderShapeItem={renderIllustrationShape}
        renderRawImageToolbar={renderIllustrationImageToolbar}
        renderRawTextboxToolbar={renderIllustrationTextToolbar}
        renderShapeToolbar={renderIllustrationShapeToolbar}
        renderPageToolbar={renderIllustrationPageToolbar}
        availableLayouts={AVAILABLE_LAYOUTS}
        onSpreadSelect={onSpreadSelect}
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
