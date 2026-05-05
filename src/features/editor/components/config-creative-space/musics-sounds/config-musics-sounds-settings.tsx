// config-musics-sounds-settings.tsx
// Root panel for the Musics & Sounds config section. Owns local tab state and
// fetches `musics`/`sounds` lists once on mount. Dispatches updateBook with the
// minimal field shape per panel (music | sound | narrator).

import * as React from 'react';

import {
  DEFAULT_NARRATOR,
  MUSICS_SOUNDS_DEFAULT_TAB,
  type MusicsSoundsTab,
} from '@/constants/config-constants';
import {
  useBookActions,
  useBookMusic,
  useBookNarrator,
  useBookNarratorVolume,
  useBookSound,
  useCurrentBook,
} from '@/stores/book-store';
import { useMusics, useMusicsActions } from '@/stores/musics-store';
import { useSounds, useSoundsActions } from '@/stores/sounds-store';
import type {
  BookMusicSettings,
  BookSoundSettings,
  NarratorSettings,
} from '@/types/editor';
import { createLogger } from '@/utils/logger';

import { MusicTabPanel } from './music-tab-panel';
import { NarratorTabPanel } from './narrator-tab-panel';
import { SoundTabPanel } from './sound-tab-panel';
import { TabHeader } from './tab-header';

const log = createLogger('Editor', 'ConfigMusicsSoundsSettings');

export function ConfigMusicsSoundsSettings() {
  const book = useCurrentBook();
  const music = useBookMusic();
  const sound = useBookSound();
  const narrator = useBookNarrator();
  const narratorVolume = useBookNarratorVolume();
  const { updateBook } = useBookActions();

  const musicsList = useMusics();
  const soundsList = useSounds();
  const { fetchMusics } = useMusicsActions();
  const { fetchSounds } = useSoundsActions();

  const [activeTab, setActiveTab] = React.useState<MusicsSoundsTab>(
    MUSICS_SOUNDS_DEFAULT_TAB,
  );

  // Fetch asset lists once on mount when empty (cache shared across editor).
  React.useEffect(() => {
    if (musicsList.length === 0) {
      log.debug('mount', 'fetching musics');
      void fetchMusics();
    }
    if (soundsList.length === 0) {
      log.debug('mount', 'fetching sounds');
      void fetchSounds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMusics, fetchSounds]);

  // Latest narrator snapshot to avoid wiping per-language entries on volume change.
  const narratorRef = React.useRef<NarratorSettings | null>(narrator);
  React.useEffect(() => {
    narratorRef.current = narrator;
  }, [narrator]);

  const handleMusicChange = React.useCallback(
    (next: BookMusicSettings) => {
      if (!book) {
        log.warn('handleMusicChange', 'no current book');
        return;
      }
      log.info('handleMusicChange', 'commit', {
        bookId: book.id,
        bgId: next.background_id,
        volume: next.volume_scale,
      });
      void updateBook(book.id, { music: next });
    },
    [book, updateBook],
  );

  const handleSoundChange = React.useCallback(
    (next: BookSoundSettings) => {
      if (!book) {
        log.warn('handleSoundChange', 'no current book');
        return;
      }
      log.info('handleSoundChange', 'commit', {
        bookId: book.id,
        volume: next.volume_scale,
      });
      void updateBook(book.id, { sound: next });
    },
    [book, updateBook],
  );

  const handleNarratorVolumeChange = React.useCallback(
    (v: number) => {
      if (!book) {
        log.warn('handleNarratorVolumeChange', 'no current book');
        return;
      }
      const current = narratorRef.current ?? DEFAULT_NARRATOR;
      const nextNarrator: NarratorSettings = { ...current, volume_scale: v };
      log.info('handleNarratorVolumeChange', 'commit', {
        bookId: book.id,
        volume: v,
      });
      void updateBook(book.id, { narrator: nextNarrator });
    },
    [book, updateBook],
  );

  if (!book) {
    log.debug('render', 'no book — rendering null');
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TabHeader activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        {activeTab === 'music' && (
          <MusicTabPanel
            music={music}
            musicsList={musicsList}
            onChange={handleMusicChange}
          />
        )}
        {activeTab === 'sound' && (
          <SoundTabPanel
            sound={sound}
            soundsList={soundsList}
            onChange={handleSoundChange}
          />
        )}
        {activeTab === 'narrator' && (
          <NarratorTabPanel
            volume={narratorVolume}
            onChange={handleNarratorVolumeChange}
          />
        )}
      </div>
    </div>
  );
}
