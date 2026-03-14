// dummy-main-view.tsx - Main editor view for dummy creative space
'use client';

import { useMemo, useCallback } from 'react';
import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import { EditableImage, EditableTextbox } from '@/features/editor/components/shared-components';
import { useDummyById, useDummyActions } from './hooks';
import { DummyItemToolbar } from './dummy-item-toolbar';
import type {
  BaseSpread,
  ItemType,
  ImageItemContext,
  TextItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  SpreadItemActionUnion,
  PageData,
} from '@/features/editor/components/canvas-spread-view/types';
import type { SpreadType } from '@/features/editor/components/canvas-spread-view';
import type {
  DummySpread,
  DummyImage,
  DummyTextbox,
  DummyTextboxContent,
} from '@/types/dummy';
import { getFirstTextboxKey } from '@/types/dummy';

interface DummyMainViewProps {
  selectedDummyId: string;
}

function convertDummySpreadsToBaseSpreads(dummySpreads: DummySpread[]): BaseSpread[] {
  return dummySpreads.map((spread) => ({
    id: spread.id,
    pages: spread.pages,
    images: spread.images.map((img) => ({
      id: img.id,
      art_note: img.art_note,
      visual_description: img.art_note,
      geometry: img.geometry,
      illustrations: [],
      final_hires_media_url: undefined,
    })),
    textboxes: spread.textboxes,
    objects: [],
  }));
}

function createEmptySpread(spreadIndex: number): DummySpread {
  const basePage: PageData = {
    number: spreadIndex * 2,
    type: 'normal_page',
    layout: null,
    background: { color: '#ffffff', texture: null },
  };

  return {
    id: crypto.randomUUID(),
    pages: [
      basePage,
      { ...basePage, number: spreadIndex * 2 + 1 },
    ],
    images: [],
    textboxes: [],
  };
}

export function DummyMainView({ selectedDummyId }: DummyMainViewProps) {
  const dummy = useDummyById(selectedDummyId);
  const actions = useDummyActions();

  const baseSpreads = useMemo(() => {
    if (!dummy) return [];
    return convertDummySpreadsToBaseSpreads(dummy.spreads);
  }, [dummy]);

  const handleSpreadSelect = useCallback((spreadId: string) => {
    console.log('Spread selected:', spreadId);
  }, []);

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderDummySpreads(selectedDummyId, fromIndex, toIndex);
    },
    [actions, selectedDummyId]
  );

  const handleSpreadAdd = useCallback(
    (type: SpreadType) => {
      if (!dummy) return;
      const newSpread = createEmptySpread(dummy.spreads.length);
      if (type !== 'double') {
        newSpread.pages = [newSpread.pages[0]];
      }
      actions.addDummySpread(selectedDummyId, newSpread);
    },
    [actions, selectedDummyId, dummy]
  );

  const handleDeleteSpread = useCallback(
    (spreadId: string) => {
      actions.deleteDummySpread(selectedDummyId, spreadId);
    },
    [actions, selectedDummyId]
  );

  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId, itemType, action, itemId, data } = params;
      if (!dummy) return;

      const spread = dummy.spreads.find((s) => s.id === spreadId);
      if (!spread) return;

      switch (itemType) {
        case 'image':
          if (action === 'add') {
            const newImage: DummyImage = {
              id: crypto.randomUUID(),
              art_note: '',
              geometry: { x: 10, y: 10, w: 30, h: 30 },
              typography: { size: 12, color: '#000000' },
            };
            actions.updateDummySpread(selectedDummyId, spreadId, {
              images: [...spread.images, newImage],
            });
          } else if (action === 'update' && itemId && data) {
            actions.updateDummySpread(selectedDummyId, spreadId, {
              images: spread.images.map((img) =>
                img.id === itemId ? { ...img, ...data } : img
              ),
            });
          } else if (action === 'delete' && itemId) {
            actions.updateDummySpread(selectedDummyId, spreadId, {
              images: spread.images.filter((img) => img.id !== itemId),
            });
          }
          break;

        case 'textbox':
          if (action === 'add') {
            const newTextbox: DummyTextbox = {
              id: crypto.randomUUID(),
              en_US: {
                text: '',
                geometry: { x: 10, y: 10, w: 30, h: 20 },
                typography: {
                  family: 'Arial',
                  size: 14,
                  weight: 400,
                  style: 'normal',
                  textAlign: 'left',
                  lineHeight: 1.5,
                  letterSpacing: 0,
                  color: '#000000',
                  decoration: 'none',
                  textTransform: 'none',
                },
              },
            };
            actions.updateDummySpread(selectedDummyId, spreadId, {
              textboxes: [...spread.textboxes, newTextbox],
            });
          } else if (action === 'update' && itemId && data) {
            actions.updateDummySpread(selectedDummyId, spreadId, {
              textboxes: spread.textboxes.map((tb) =>
                tb.id === itemId
                  ? { ...tb, ...(data as Partial<DummyTextbox>) }
                  : tb
              ) as DummyTextbox[],
            });
          } else if (action === 'delete' && itemId) {
            actions.updateDummySpread(selectedDummyId, spreadId, {
              textboxes: spread.textboxes.filter((tb) => tb.id !== itemId),
            });
          }
          break;

        case 'page':
          if (action === 'update' && typeof itemId === 'number' && data) {
            const newPages = [...spread.pages];
            newPages[itemId] = { ...newPages[itemId], ...(data as Partial<PageData>) };
            actions.updateDummySpread(selectedDummyId, spreadId, { pages: newPages });
          }
          break;
      }
    },
    [actions, selectedDummyId, dummy]
  );

  const renderImageItem = useCallback(
    (context: ImageItemContext<BaseSpread>) => {
      const spread = dummy?.spreads.find((s) => s.id === context.spreadId);
      const dummyImage = spread?.images.find((img) => img.id === context.item.id);

      return (
        <EditableImage
          image={{
            id: context.item.id,
            art_note: context.item.art_note || '',
            visual_description: context.item.art_note || '',
            geometry: context.item.geometry,
            illustrations: [],
            final_hires_media_url: undefined,
          }}
          index={context.itemIndex}
          isSelected={context.isSelected}
          isEditable={context.isSpreadSelected}
          onSelect={context.onSelect}
          onArtNoteChange={(artNote) => context.onUpdate({ art_note: artNote })}
          onEditingChange={context.onEditingChange}
          artNoteTypography={dummyImage?.typography}
        />
      );
    },
    [dummy]
  );

  const renderTextItem = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      const textbox = context.item as unknown as DummyTextbox;
      const langKey = getFirstTextboxKey(textbox);
      if (!langKey) return null;

      const langData = textbox[langKey] as DummyTextboxContent;

      return (
        <EditableTextbox
          text={langData.text}
          geometry={langData.geometry}
          typography={langData.typography}
          index={context.itemIndex}
          isSelected={context.isSelected}
          isSelectable={context.isSpreadSelected}
          isEditable={context.isSpreadSelected}
          onSelect={context.onSelect}
          onTextChange={(newText) => {
            context.onUpdate({
              [langKey]: { ...langData, text: newText },
            } as unknown as Partial<DummyTextbox>);
          }}
          onEditingChange={context.onEditingChange ?? (() => {})}
        />
      );
    },
    []
  );

  const renderImageToolbar = useCallback(
    (context: ImageToolbarContext<BaseSpread>) => {
      if (!dummy) return null;
      const spread = dummy.spreads.find((s) => s.id === context.spreadId);
      const image = spread?.images.find((img) => img.id === context.item.id);
      if (!image) return null;

      const contextWithClone: ImageToolbarContext<BaseSpread> = {
        ...context,
        onClone: () => {
          const cloned: DummyImage = {
            ...image,
            id: crypto.randomUUID(),
            geometry: { ...image.geometry, x: image.geometry.x + 5, y: image.geometry.y + 5 },
          };
          handleSpreadItemAction({
            spreadId: context.spreadId,
            itemType: 'image',
            action: 'add',
            itemId: null,
            data: cloned,
          });
        },
      };

      return <DummyItemToolbar data={{ type: 'image', context: contextWithClone, item: image }} />;
    },
    [dummy, handleSpreadItemAction]
  );

  const renderTextToolbar = useCallback(
    (context: TextToolbarContext<BaseSpread>) => {
      if (!dummy) return null;
      const spread = dummy.spreads.find((s) => s.id === context.spreadId);
      const textbox = spread?.textboxes.find((tb) => tb.id === context.item.id);
      if (!textbox) return null;

      const contextWithClone: TextToolbarContext<BaseSpread> = {
        ...context,
        onClone: () => {
          const langKey = getFirstTextboxKey(textbox);
          if (!langKey) return;
          const langData = textbox[langKey] as DummyTextboxContent;
          const cloned: DummyTextbox = {
            ...textbox,
            id: crypto.randomUUID(),
            [langKey]: {
              ...langData,
              geometry: { ...langData.geometry, x: langData.geometry.x + 5, y: langData.geometry.y + 5 },
            },
          };
          handleSpreadItemAction({
            spreadId: context.spreadId,
            itemType: 'textbox',
            action: 'add',
            itemId: null,
            data: cloned,
          });
        },
      };

      return <DummyItemToolbar data={{ type: 'textbox', context: contextWithClone, item: textbox }} />;
    },
    [dummy, handleSpreadItemAction]
  );

  if (!dummy) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Dummy not found</p>
      </div>
    );
  }

  return (
    <CanvasSpreadView
      spreads={baseSpreads}
      renderItems={['image', 'text'] as ItemType[]}
      renderImageItem={renderImageItem}
      renderTextItem={renderTextItem}
      renderImageToolbar={renderImageToolbar}
      renderTextToolbar={renderTextToolbar}
      onSpreadSelect={handleSpreadSelect}
      onSpreadReorder={handleSpreadReorder}
      onSpreadAdd={handleSpreadAdd}
      onDeleteSpread={handleDeleteSpread}
      onUpdateSpreadItem={handleSpreadItemAction}
      isEditable={true}
      canAddSpread={true}
      canReorderSpread={true}
      canDeleteSpread={true}
      canDeleteItem={true}
      canResizeItem={true}
      canDragItem={true}
      initialViewMode="edit"
    />
  );
}

export default DummyMainView;
