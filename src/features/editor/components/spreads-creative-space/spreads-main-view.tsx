// spreads-main-view.tsx - CanvasSpreadView wrapper for illustration phase (image, textbox, shape only)

import { useCallback } from 'react';
import { toast } from 'sonner';
import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  clampGeometry,
} from '@/features/editor/components/shared-components';
import {
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { getTextboxContentForLanguage } from '@/features/editor/utils/textbox-helpers';
import { useLanguageCode } from '@/stores/editor-settings-store';
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

  // === Spread-level handlers ===

  const handleSpreadAdd = useCallback(
    (type: SpreadType) => {
      const spreadIndex = illustrationSpreads.length;
      const basePage: PageData = {
        number: spreadIndex * 2,
        type: 'normal_page',
        layout: null,
        background: { color: '#FFFFFF', texture: null },
      };
      const newSpread: BaseSpread = {
        id: crypto.randomUUID(),
        pages:
          type === 'double'
            ? [basePage, { ...basePage, number: spreadIndex * 2 + 1 }]
            : [basePage],
        images: [],
        textboxes: [],
        shapes: [],
      };
      log.info('handleSpreadAdd', 'adding spread', { type, spreadId: newSpread.id });
      actions.addIllustrationSpread(newSpread);
      onSpreadSelect(newSpread.id);
    },
    [actions, illustrationSpreads.length, onSpreadSelect]
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
            actions.addIllustrationImage(spreadId, data as SpreadImage);
          else if (action === 'update')
            actions.updateIllustrationImage(spreadId, itemId as string, data as Partial<SpreadImage>);
          else if (action === 'delete')
            actions.deleteIllustrationImage(spreadId, itemId as string);
          break;
        case 'textbox':
          if (action === 'add')
            actions.addIllustrationTextbox(spreadId, data as SpreadTextbox);
          else if (action === 'update')
            actions.updateIllustrationTextbox(spreadId, itemId as string, data as Partial<SpreadTextbox>);
          else if (action === 'delete')
            actions.deleteIllustrationTextbox(spreadId, itemId as string);
          break;
        case 'shape':
          if (action === 'add')
            actions.addIllustrationShape(spreadId, data as SpreadShape);
          else if (action === 'update')
            actions.updateIllustrationShape(spreadId, itemId as string, data as Partial<SpreadShape>);
          else if (action === 'delete')
            actions.deleteIllustrationShape(spreadId, itemId as string);
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

  // === Toolbar handlers ===

  const handleGenerateImage = useCallback(
    (item: SpreadImage) => {
      log.info('handleGenerateImage', 'generate image requested', { itemId: item.id });
      toast.info('Generate image coming soon');
    },
    []
  );


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
      actions.addIllustrationShape(spreadId, newShape);
    },
    [actions]
  );

  // === Toolbar render props ===

  const renderIllustrationImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => (
      <SpreadsImageToolbar
        context={{
          ...context,
          onGenerateImage: () => handleGenerateImage(context.item),
        }}
      />
    ),
    [handleGenerateImage]
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
            onItemSelect({ type: 'image', id: context.item.id });
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
            onItemSelect({ type: 'textbox', id: context.item.id });
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
    <CanvasSpreadView
      spreads={illustrationSpreads}
      initialSelectedId={selectedSpreadId}
      renderItems={['image', 'textbox', 'shape']}
      renderImageItem={renderIllustrationImage}
      renderTextItem={renderIllustrationTextbox}
      renderShapeItem={renderIllustrationShape}
      renderImageToolbar={renderIllustrationImageToolbar}
      renderTextToolbar={renderIllustrationTextToolbar}
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
      canDeleteItem={true}
      canResizeItem={true}
      canDragItem={true}
      externalSelectedItemId={selectedItemId}
    />
  );
}

export default SpreadsMainView;
