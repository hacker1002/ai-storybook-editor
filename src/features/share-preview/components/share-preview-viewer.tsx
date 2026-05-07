// share-preview-viewer.tsx - Data conversion layer: API response → PlayableSpreadView props
import { useMemo, useEffect } from 'react';
import { PlayableSpreadView } from '@/features/editor/components/playable-spread-view';
import type { PlayableSpread } from '@/types/playable-types';
import type { Section } from '@/types/illustration-types';
import type {
  BookPreviewData,
  ShareConfig,
  ShareMediaRef,
  ShareNarratorSetting,
  SnapshotPreviewData,
} from '@/types/share-preview-types';
import { useSetCanvasSize } from '@/stores/editor-settings-store';
import { useBookStore } from '@/stores/book-store';
import { useMusicsStore } from '@/stores/musics-store';
import { useSoundsStore } from '@/stores/sounds-store';
import type { AudioResource } from '@/features/audio-library';
import type { Book, NarratorLanguageEntry, NarratorSettings } from '@/types/editor';
import {
  DEFAULT_INFERENCE_PARAMS,
  NARRATOR_LANGUAGE_KEY_REGEX,
  VOLUME_DEFAULT,
} from '@/constants/config-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('SharePreview', 'SharePreviewViewer');

interface SharePreviewViewerProps {
  book: BookPreviewData;
  snapshot: SnapshotPreviewData | null;
  shareConfig: ShareConfig;
}

// Map a denormalized share-preview media ref → AudioResource shape that
// musics-store / sounds-store consumers expect. Non-runtime fields are stubbed
// because share-preview never invokes update/delete/library flows.
function shareMediaToAudioResource(ref: ShareMediaRef, loop: boolean): AudioResource {
  return {
    id: ref.id,
    name: ref.name ?? '',
    description: null,
    mediaUrl: ref.media_url,
    loop,
    duration: 0,
    influence: null,
    tags: null,
    source: 0,
    createdAt: '',
  };
}

// Convert ShareNarratorSetting (per-language entries with media_url) →
// NarratorSettings expected by `useBookNarratorVolume` / `useNarratorLanguageEntry`.
// Inference params get defaults — they only affect generation, not playback.
function hydrateNarrator(input: ShareNarratorSetting | undefined): NarratorSettings | null {
  if (!input) return null;
  const volumeScale = typeof input.volume_scale === 'number' ? input.volume_scale : VOLUME_DEFAULT;
  const out: NarratorSettings = {
    ...DEFAULT_INFERENCE_PARAMS,
    model: 'eleven_v3',
  };
  // volume_scale lives outside NarratorInferenceParams; assigned via index signature.
  (out as unknown as Record<string, number>).volume_scale = volumeScale;
  for (const [key, val] of Object.entries(input)) {
    if (key === 'volume_scale') continue;
    if (!NARRATOR_LANGUAGE_KEY_REGEX.test(key)) continue;
    if (!val || typeof val !== 'object') continue;
    const entry = val as { voice_id?: string | null; media_url?: string };
    const langEntry: NarratorLanguageEntry = {
      voice_id: entry.voice_id ?? '',
      media_url: entry.media_url ?? null,
    };
    (out as unknown as Record<string, NarratorLanguageEntry>)[key] = langEntry;
  }
  return out;
}

export function SharePreviewViewer({ book, snapshot, shareConfig }: SharePreviewViewerProps) {
  const setCanvasSize = useSetCanvasSize();

  // Sync book dimension → canvas size store so PlayerCanvas renders at correct spread dimensions
  useEffect(() => {
    log.debug('useEffect:dimension', 'set canvas size', { dimension: book.dimension });
    setCanvasSize(book.dimension ?? null);
  }, [book.dimension, setCanvasSize]);

  // Hydrate editor stores with denormalized share-preview data so the player
  // path (BGM, SFX, narrator volume, page-turn effects) works without DB access.
  // Reset on unmount to keep editor routes clean if the user navigates away.
  useEffect(() => {
    const hydratedBook: Book = {
      id: book.id,
      title: book.title,
      description: null,
      owner_id: '',
      step: 0,
      type: 1,
      original_language: book.original_language,
      current_version: null,
      current_content: null,
      cover: book.cover,
      book_type: book.book_type,
      dimension: book.dimension,
      target_audience: null,
      format_id: null,
      era_id: null,
      location_id: null,
      artstyle_id: null,
      typography: book.typography as unknown as Book['typography'],
      narrator: hydrateNarrator(book.narrator),
      shape: book.shape as unknown as Book['shape'],
      branch: book.branch as unknown as Book['branch'],
      music: book.music
        ? {
            background_id: book.music.background?.id ?? null,
            volume_scale: book.music.volume_scale,
          }
        : null,
      sound: book.sound
        ? {
            transition_id: book.sound.transition?.id ?? null,
            true_id: book.sound.true?.id ?? null,
            wrong_id: book.sound.wrong?.id ?? null,
            volume_scale: book.sound.volume_scale,
          }
        : null,
      effects: book.effects as unknown as Book['effects'],
      template_layout: book.template_layout as unknown as Book['template_layout'],
      created_at: '',
      updated_at: '',
    };

    const musicItems: AudioResource[] = book.music?.background
      ? [shareMediaToAudioResource(book.music.background, /* loop */ true)]
      : [];

    const soundCandidates = [book.sound?.transition, book.sound?.true, book.sound?.wrong];
    const seenSoundIds = new Set<string>();
    const soundItems: AudioResource[] = [];
    for (const ref of soundCandidates) {
      if (!ref || seenSoundIds.has(ref.id)) continue;
      seenSoundIds.add(ref.id);
      soundItems.push(shareMediaToAudioResource(ref, /* loop */ false));
    }

    useBookStore.getState().setCurrentBook(hydratedBook);
    useMusicsStore.setState({ items: musicItems, isLoading: false, error: null });
    useSoundsStore.setState({ items: soundItems, isLoading: false, error: null });

    log.info('hydrateStores', 'share-preview stores hydrated', {
      bookId: book.id,
      bgmCount: musicItems.length,
      sfxCount: soundItems.length,
      hasNarrator: !!hydratedBook.narrator,
      hasEffects: !!hydratedBook.effects,
    });

    return () => {
      log.debug('hydrateStores', 'cleanup — resetting stores');
      useBookStore.getState().setCurrentBook(null);
      useMusicsStore.setState({ items: [], isLoading: false, error: null });
      useSoundsStore.setState({ items: [], isLoading: false, error: null });
    };
  }, [book]);

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
