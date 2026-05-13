// remix-display-canvas-area.tsx — Display-only wrapper around CanvasSpreadView.
// Renders spreads of the active remix without selection/edit affordances.

import { useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import { EmptyState } from '@/features/editor/components/canvas-spread-view/empty-state';
import {
  EditableImage,
  EditableTextbox,
  EditableShape,
  EditableVideo,
  EditableAutoPic,
  EditableAudio,
  EditableAutoAudio,
  EditableQuiz,
} from '@/features/editor/components/shared-components';
import { useSpaceViewSlot, useEditorSpaceViewStore } from '@/stores/editor-space-view-store';
import { useLanguageCode } from '@/stores/editor-settings-store';
import { useBookTypography, useCurrentBook } from '@/stores/book-store';
import { getTextboxContentForLanguage } from '@/features/editor/utils/textbox-helpers';
import { createLogger } from '@/utils/logger';
import type { ItemType, ViewMode } from '@/types/canvas-types';
import type { PageNumberingSettings } from '@/types/editor';
import type { RemixSpread } from '@/types/remix';

const log = createLogger('Editor', 'RemixDisplayCanvasArea');

const RENDER_ITEMS: ItemType[] = [
  'image',
  'textbox',
  'shape',
  'video',
  'auto_pic',
  'audio',
  'auto_audio',
  'quiz',
];

const noop = () => {};

interface Props {
  spreads: RemixSpread[];
  pageNumbering?: PageNumberingSettings | null;
}

export function RemixDisplayCanvasArea({ spreads, pageNumbering }: Props) {
  const book = useCurrentBook();
  const bookId = book?.id ?? '';
  const langCode = useLanguageCode();
  const bookTypography = useBookTypography();
  const state = useSpaceViewSlot(bookId, 'remix');
  const patchSpace = useEditorSpaceViewStore((s) => s.patchSpace);

  const activeSpreadId = state.activeSpreadId ?? null;
  const viewMode: ViewMode = state.viewMode ?? 'edit';
  const zoomLevel = state.zoomLevel ?? 100;
  const columnsPerRow = state.columnsPerRow ?? 4;

  // Reset selectedSpreadId when active remix switches (id no longer in list).
  useEffect(() => {
    if (!bookId) return;
    if (activeSpreadId && !spreads.find((s) => s.id === activeSpreadId)) {
      log.debug('reset-selected-spread', 'active spread missing', { prev: activeSpreadId });
      patchSpace(bookId, 'remix', { activeSpreadId: spreads[0]?.id ?? null });
    }
  }, [bookId, spreads, activeSpreadId, patchSpace]);

  if (spreads.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff className="h-12 w-12" />}
        title="No spreads in this remix"
        description="Remix was cloned without playable spreads."
      />
    );
  }

  return (
    <CanvasSpreadView<RemixSpread>
      spreads={spreads}
      selectedSpreadId={activeSpreadId ?? spreads[0].id}
      viewMode={viewMode}
      zoomLevel={zoomLevel}
      columnsPerRow={columnsPerRow}
      onSpreadSelect={(id) => patchSpace(bookId, 'remix', { activeSpreadId: id })}
      onViewModeChange={(mode) => patchSpace(bookId, 'remix', { viewMode: mode })}
      onZoomChange={(z) => patchSpace(bookId, 'remix', { zoomLevel: z })}
      onColumnsChange={(c) => patchSpace(bookId, 'remix', { columnsPerRow: c })}
      isEditable={false}
      canAddSpread={false}
      canDeleteSpread={false}
      canReorderSpread={false}
      canResizeItem={false}
      canDragItem={false}
      pageNumbering={pageNumbering ?? undefined}
      renderItems={RENDER_ITEMS}
      renderImageItem={(ctx) => (
        <EditableImage
          image={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isSelectable={false}
          isEditable={false}
          onSelect={noop}
        />
      )}
      renderTextItem={(ctx) => {
        const resolved = getTextboxContentForLanguage(
          ctx.item as unknown as Record<string, unknown>,
          langCode,
          bookTypography,
        );
        if (!resolved) return null;
        return (
          <EditableTextbox
            textboxContent={resolved.content}
            index={ctx.itemIndex}
            zIndex={ctx.zIndex}
            isSelected={false}
            isSelectable={false}
            isEditable={false}
            onSelect={noop}
            onTextChange={noop as (text: string) => void}
            onEditingChange={noop as (isEditing: boolean) => void}
          />
        );
      }}
      renderShapeItem={(ctx) => (
        <EditableShape
          shape={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isEditable={false}
          onSelect={noop}
        />
      )}
      renderVideoItem={(ctx) => (
        <EditableVideo
          video={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isEditable={false}
          onSelect={noop}
        />
      )}
      renderAutoPicItem={(ctx) => (
        <EditableAutoPic
          autoPic={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isEditable={false}
          onSelect={noop}
        />
      )}
      renderAudioItem={(ctx) => (
        <EditableAudio
          audio={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isEditable={false}
          onSelect={noop}
        />
      )}
      renderAutoAudioItem={(ctx) => (
        // Divergence per design §3.6 — keep isEditable=true so icon stays visible.
        <EditableAutoAudio
          autoAudio={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isEditable={true}
          onSelect={noop}
        />
      )}
      renderQuizItem={(ctx) => (
        <EditableQuiz
          quiz={ctx.item}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={false}
          isEditable={false}
          onSelect={noop}
        />
      )}
    />
  );
}
