import { useCallback, useEffect, useMemo, useState } from 'react';
import { SoundsHeader } from '@/features/sounds/components/sounds-header';
import { SoundsToolbar } from '@/features/sounds/components/sounds-toolbar';
import { SoundsList } from '@/features/sounds/components/sounds-list';
import { EditSoundModal } from '@/features/sounds/components/edit-sound-modal';
import { DeleteSoundDialog } from '@/features/sounds/components/delete-sound-dialog';
import { UploadSoundModal } from '@/features/sounds/components/upload-sound-modal/upload-sound-modal';
import { GenerateSoundModal } from '@/features/sounds/components/generate-sound-modal/generate-sound-modal';
import { useSoundAudioPlayer } from '@/features/sounds/hooks/use-sound-audio-player';
import { toast } from 'sonner';
import {
  applyFilters,
  distinctTags,
  durationBounds as computeDurationBounds,
} from '@/features/sounds/utils/sound-filters';
import { DEFAULT_SOUNDS_FILTERS } from '@/features/sounds/constants';
import {
  useSounds,
  useSoundsActions,
  useSoundsLoading,
} from '@/stores/sounds-store';
import type {
  Sound,
  SoundsActiveModal,
  SoundsFilterState,
} from '@/types/sound';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'SoundsPage');

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading sounds"
      className="flex flex-col gap-3 px-6 py-4"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

export function SoundsPage() {
  const sounds = useSounds();
  const isLoading = useSoundsLoading();
  // NOTE: lazy fetch on mount per Phase 02 validation. Promote to App init when
  // audio mixing feature ships (then sounds become a global concern).
  const { fetchSounds, upsertLocal } = useSoundsActions();
  const { playingId, play, stop } = useSoundAudioPlayer();

  const [filters, setFilters] = useState<SoundsFilterState>(DEFAULT_SOUNDS_FILTERS);
  const [editingSound, setEditingSound] = useState<Sound | null>(null);
  const [deletingSound, setDeletingSound] = useState<Sound | null>(null);
  const [activeModal, setActiveModal] = useState<SoundsActiveModal>(null);

  useEffect(() => {
    log.info('mount', 'fetching sounds');
    fetchSounds();
  }, [fetchSounds]);

  const availableTags = useMemo(() => distinctTags(sounds), [sounds]);
  const durationBounds = useMemo(() => computeDurationBounds(sounds), [sounds]);
  const filtered = useMemo(() => applyFilters(sounds, filters), [sounds, filters]);

  const handlePlay = useCallback(
    (soundId: string) => {
      const sound = sounds.find((s) => s.id === soundId);
      if (!sound) {
        log.warn('handlePlay', 'sound not found', { soundId });
        return;
      }
      log.debug('handlePlay', 'play sound', {
        soundId,
        loop: sound.loop,
      });
      play(sound.id, sound.mediaUrl, sound.loop);
    },
    [sounds, play]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleEdit = useCallback((sound: Sound) => {
    log.debug('handleEdit', 'open edit', { id: sound.id });
    setEditingSound(sound);
  }, []);

  const handleDelete = useCallback((sound: Sound) => {
    log.debug('handleDelete', 'open delete', { id: sound.id });
    setDeletingSound(sound);
  }, []);

  const handleOpenUpload = useCallback(() => {
    setActiveModal('upload');
  }, []);

  const handleOpenGenerate = useCallback(() => {
    setActiveModal('generate');
  }, []);

  // Phase 03+ replaces these placeholders with real modals/dialogs.
  const renderActiveModal = () => {
    if (activeModal === 'generate') {
      return (
        <GenerateSoundModal
          onClose={() => setActiveModal(null)}
          onSaved={(sound) => {
            log.info('renderActiveModal', 'generate saved', { id: sound.id });
            upsertLocal(sound);
            toast.success(`Sound "${sound.name}" generated`);
            setActiveModal(null);
          }}
        />
      );
    }
    if (activeModal === 'upload') {
      return (
        <UploadSoundModal
          onClose={() => setActiveModal(null)}
          onSaved={(sound) => {
            log.info('renderActiveModal', 'upload saved', { id: sound.id });
            upsertLocal(sound);
          }}
        />
      );
    }
    return null;
  };

  return (
    <main
      aria-labelledby="sounds-heading"
      className="mx-auto w-full max-w-7xl space-y-4"
    >
      <SoundsHeader
        onOpenUpload={handleOpenUpload}
        onOpenGenerate={handleOpenGenerate}
      />
      <SoundsToolbar
        filters={filters}
        count={filtered.length}
        availableTags={availableTags}
        durationBounds={durationBounds}
        onChange={setFilters}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : (
        <SoundsList
          sounds={filtered}
          isLibraryEmpty={sounds.length === 0}
          playingId={playingId}
          onPlay={handlePlay}
          onStop={handleStop}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenUpload={handleOpenUpload}
          onOpenGenerate={handleOpenGenerate}
        />
      )}

      {renderActiveModal()}
      {editingSound ? (
        <EditSoundModal
          sound={editingSound}
          onClose={() => setEditingSound(null)}
        />
      ) : null}
      {deletingSound ? (
        <DeleteSoundDialog
          sound={deletingSound}
          onClose={() => setDeletingSound(null)}
          onDeleted={(id) => {
            if (playingId === id) stop();
          }}
        />
      ) : null}
    </main>
  );
}
