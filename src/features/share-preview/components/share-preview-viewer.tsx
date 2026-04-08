// share-preview-viewer.tsx - Data conversion layer: API response → PlayableSpreadView props
import { useMemo, useEffect } from 'react';
import { PlayableSpreadView } from '@/features/editor/components/playable-spread-view';
import type { PlayableSpread } from '@/types/playable-types';
import type { Section } from '@/types/illustration-types';
import type { BookPreviewData, ShareConfig, SnapshotPreviewData } from '@/types/share-preview-types';
import { useSetCanvasSize } from '@/stores/editor-settings-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('SharePreview', 'SharePreviewViewer');

interface SharePreviewViewerProps {
  book: BookPreviewData;
  snapshot: SnapshotPreviewData | null;
  shareConfig: ShareConfig;
}

export function SharePreviewViewer({ book, snapshot, shareConfig }: SharePreviewViewerProps) {
  const setCanvasSize = useSetCanvasSize();

  // Sync book dimension → canvas size store so PlayerCanvas renders at correct spread dimensions
  useEffect(() => {
    log.debug('useEffect:dimension', 'set canvas size', { dimension: book.dimension });
    setCanvasSize(book.dimension ?? null);
  }, [book.dimension, setCanvasSize]);

  // Convert API spreads → PlayableSpread[] (direct cast with defaults)
  const playableSpreads = useMemo<PlayableSpread[]>(() => {
    if (!snapshot) return [];
    log.debug('playableSpreads', 'converting spreads', { count: snapshot.illustration.spreads.length });
    return snapshot.illustration.spreads.map((raw) => ({
      ...(raw as Omit<PlayableSpread, 'animations'>),
      animations: (raw.animations as PlayableSpread['animations']) ?? [],
    }));
  }, [snapshot]);

  // editions: empty object → all enabled; otherwise use as-is
  const availableEditions = useMemo(() => {
    const e = shareConfig.editions;
    if (!e.classic && !e.dynamic && !e.interactive) {
      return { classic: true, dynamic: true, interactive: true };
    }
    return e;
  }, [shareConfig.editions]);

  // languages: empty array → undefined (= no constraint, show all)
  const availableLanguages = shareConfig.languages.length > 0
    ? shareConfig.languages
    : undefined;

  // sections from snapshot illustration (authoritative source for playback)
  const sections = useMemo<Section[]>(() => {
    if (!snapshot) return [];
    return (snapshot.illustration.sections ?? []) as Section[];
  }, [snapshot]);

  log.info('render', 'share preview viewer', {
    bookId: book.id,
    hasSnapshot: !!snapshot,
    spreadCount: playableSpreads.length,
  });

  // Empty snapshot state
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="text-4xl" aria-hidden="true">📭</span>
        <p className="text-base font-medium">{book.title}</p>
        <p className="text-sm">Sách chưa có nội dung</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <PlayableSpreadView
        mode="player"
        spreads={playableSpreads}
        sections={sections}
        bookTitle={book.title}
        availableEditions={availableEditions}
        availableLanguages={availableLanguages}
        pageNumbering={book.template_layout?.page_numbering}
        showThumbnails={false}
      />
    </div>
  );
}
