// objects-main-view.tsx - CanvasSpreadView wrapper with retouch render props
'use client';

import { useCallback } from 'react';
import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableQuiz,
} from '@/features/editor/components/shared-components';
import {
  useRetouchSpreads,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { getFirstTextboxKey } from '@/features/editor/utils/textbox-helpers';
import { createLogger } from '@/utils/logger';
import type { SelectedItem } from './objects-creative-space';
import type { SpreadType } from '@/features/editor/components/canvas-spread-view';
import type {
  BaseSpread,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  QuizItemContext,
  SpreadItemActionUnion,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  PageData,
} from '@/types/canvas-types';
import type { SpreadTextboxContent } from '@/types/spread-types';

const log = createLogger('Editor', 'ObjectsMainView');

interface ObjectsMainViewProps {
  selectedSpreadId: string;
  onSpreadSelect: (spreadId: string) => void;
  onItemSelect: (item: SelectedItem | null) => void;
}

export function ObjectsMainView({
  selectedSpreadId,
  onSpreadSelect,
  onItemSelect,
}: ObjectsMainViewProps) {
  const retouchSpreads = useRetouchSpreads();
  const actions = useSnapshotActions();

  // Unified item action handler - dispatches to store per type
  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId, itemType, action, itemId, data } = params;
      log.debug('handleSpreadItemAction', 'dispatch', { spreadId, itemType, action });

      switch (itemType) {
        case 'image':
          if (action === 'add') actions.addRetouchImage(spreadId, data as SpreadImage);
          else if (action === 'update') actions.updateRetouchImage(spreadId, itemId as string, data as Partial<SpreadImage>);
          else if (action === 'delete') actions.deleteRetouchImage(spreadId, itemId as string);
          break;
        case 'textbox':
          if (action === 'add') actions.addRetouchTextbox(spreadId, data as SpreadTextbox);
          else if (action === 'update') actions.updateRetouchTextbox(spreadId, itemId as string, data as Partial<SpreadTextbox>);
          else if (action === 'delete') actions.deleteRetouchTextbox(spreadId, itemId as string);
          break;
        case 'shape':
          if (action === 'add') actions.addRetouchShape(spreadId, data as SpreadShape);
          else if (action === 'update') actions.updateRetouchShape(spreadId, itemId as string, data as Partial<SpreadShape>);
          else if (action === 'delete') actions.deleteRetouchShape(spreadId, itemId as string);
          break;
        case 'video':
          if (action === 'add') actions.addRetouchVideo(spreadId, data as SpreadVideo);
          else if (action === 'update') actions.updateRetouchVideo(spreadId, itemId as string, data as Partial<SpreadVideo>);
          else if (action === 'delete') actions.deleteRetouchVideo(spreadId, itemId as string);
          break;
        case 'audio':
          if (action === 'add') actions.addRetouchAudio(spreadId, data as SpreadAudio);
          else if (action === 'update') actions.updateRetouchAudio(spreadId, itemId as string, data as Partial<SpreadAudio>);
          else if (action === 'delete') actions.deleteRetouchAudio(spreadId, itemId as string);
          break;
        case 'quiz':
          if (action === 'add') actions.addRetouchQuiz(spreadId, data as SpreadQuiz);
          else if (action === 'update') actions.updateRetouchQuiz(spreadId, itemId as string, data as Partial<SpreadQuiz>);
          else if (action === 'delete') actions.deleteRetouchQuiz(spreadId, itemId as string);
          break;
        case 'page':
          if (action === 'update' && typeof itemId === 'number') {
            const spread = retouchSpreads.find((s) => s.id === spreadId);
            if (!spread) break;
            const newPages = [...spread.pages];
            newPages[itemId] = { ...newPages[itemId], ...(data as Partial<PageData>) };
            actions.updateRetouchSpread(spreadId, { pages: newPages });
          }
          break;
      }
    },
    [actions, retouchSpreads]
  );

  // Spread-level handlers
  const handleSpreadAdd = useCallback(
    (type: SpreadType) => {
      const spreadIndex = retouchSpreads.length;
      const basePage: PageData = {
        number: spreadIndex * 2,
        type: 'normal_page',
        layout: null,
        background: { color: '#ffffff', texture: null },
      };
      const newSpread: BaseSpread = {
        id: crypto.randomUUID(),
        pages: type === 'double'
          ? [basePage, { ...basePage, number: spreadIndex * 2 + 1 }]
          : [basePage],
        images: [],
        textboxes: [],
      };
      actions.addRetouchSpread(newSpread);
    },
    [actions, retouchSpreads.length]
  );

  const handleDeleteSpread = useCallback(
    (spreadId: string) => {
      actions.deleteRetouchSpread(spreadId);
    },
    [actions]
  );

  const handleSpreadReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderRetouchSpreads(fromIndex, toIndex);
    },
    [actions]
  );

  // === Render props for 6 item types ===

  const renderRetouchImage = useCallback(
    (context: ImageItemContext<BaseSpread>) => {
      if ((context.item as SpreadImage).editor_visible === false) return null;
      return (
        <EditableImage
          image={context.item}
          index={context.itemIndex}
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

  const renderRetouchTextbox = useCallback(
    (context: TextItemContext<BaseSpread>) => {
      if ((context.item as SpreadTextbox).editor_visible === false) return null;
      const textbox = context.item;
      const langKey = getFirstTextboxKey(textbox);
      if (!langKey) return null;
      const langData = textbox[langKey] as SpreadTextboxContent;

      return (
        <EditableTextbox
          textboxContent={langData}
          index={context.itemIndex}
          isSelected={context.isSelected}
          isSelectable={context.isSpreadSelected}
          isEditable={context.isSpreadSelected}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'text', id: context.item.id });
          }}
          onTextChange={(newText) => {
            context.onUpdate({
              [langKey]: { ...langData, text: newText },
            } as unknown as Partial<SpreadTextbox>);
          }}
          onEditingChange={context.onEditingChange ?? (() => {})}
        />
      );
    },
    [onItemSelect]
  );

  const renderRetouchShape = useCallback(
    (context: ShapeItemContext<BaseSpread>) => {
      if ((context.item as SpreadShape).editor_visible === false) return null;
      return (
        <EditableShape
          shape={context.item}
          index={context.itemIndex}
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

  const renderRetouchVideo = useCallback(
    (context: VideoItemContext<BaseSpread>) => {
      if ((context.item as SpreadVideo).editor_visible === false) return null;
      return (
        <EditableVideo
          video={context.item}
          index={context.itemIndex}
          isSelected={context.isSelected}
          isEditable={context.isSpreadSelected}
          isThumbnail={context.isThumbnail}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'video', id: context.item.id });
          }}
        />
      );
    },
    [onItemSelect]
  );

  const renderRetouchAudio = useCallback(
    (context: AudioItemContext<BaseSpread>) => {
      if ((context.item as SpreadAudio).editor_visible === false) return null;
      return (
        <EditableAudio
          audio={context.item}
          index={context.itemIndex}
          isSelected={context.isSelected}
          isEditable={context.isSpreadSelected}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'audio', id: context.item.id });
          }}
        />
      );
    },
    [onItemSelect]
  );

  const renderRetouchQuiz = useCallback(
    (context: QuizItemContext<BaseSpread>) => {
      if ((context.item as SpreadQuiz).editor_visible === false) return null;
      return (
        <EditableQuiz
          quiz={context.item}
          index={context.itemIndex}
          isSelected={context.isSelected}
          isEditable={context.isSpreadSelected}
          onSelect={() => {
            context.onSelect();
            onItemSelect({ type: 'quiz', id: context.item.id });
          }}
        />
      );
    },
    [onItemSelect]
  );

  return (
    <CanvasSpreadView
      spreads={retouchSpreads}
      initialSelectedId={selectedSpreadId}
      renderItems={['image', 'textbox', 'shape', 'video', 'audio', 'quiz']}
      renderImageItem={renderRetouchImage}
      renderTextItem={renderRetouchTextbox}
      renderShapeItem={renderRetouchShape}
      renderVideoItem={renderRetouchVideo}
      renderAudioItem={renderRetouchAudio}
      renderQuizItem={renderRetouchQuiz}
      onSpreadSelect={onSpreadSelect}
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
    />
  );
}

export default ObjectsMainView;
