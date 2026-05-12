import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { VoicesHeader } from '@/features/voices/components/voices-header';
import { VoicesToolbar } from '@/features/voices/components/voices-toolbar';
import { VoicesGrid } from '@/features/voices/components/voices-grid';
import { EditVoiceModal } from '@/features/voices/components/edit-voice-modal';
import { DeleteVoiceDialog } from '@/features/voices/components/delete-voice-dialog';
import { PromptVoiceModal } from '@/features/voices/components/prompt-voice-modal/prompt-voice-modal';
import { ImportVoiceModal } from '@/features/voices/components/import-voice-modal/import-voice-modal';
import { CloneVoiceModal } from '@/features/voices/components/clone-voice-modal/clone-voice-modal';
import { useVoiceAudioPlayer } from '@/features/voices/hooks/use-voice-audio-player';
import {
  applyFilters,
  distinctLanguages,
  distinctTags,
} from '@/features/voices/utils/voice-filters';
import { DEFAULT_VOICES_FILTERS } from '@/features/voices/constants';
import {
  useVoices,
  useVoicesActions,
  useVoicesLoading,
} from '@/stores/voices-store';
import type { Voice, VoicesActiveModal, VoicesFilterState } from '@/types/voice';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'VoicesPage');

function GridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading voices"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-6 py-4"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

export function VoicesPage() {
  const voices = useVoices();
  const isLoading = useVoicesLoading();
  const { fetchVoices, upsertLocal } = useVoicesActions();
  const { playingId, play, stop } = useVoiceAudioPlayer();

  const [filters, setFilters] = useState<VoicesFilterState>(DEFAULT_VOICES_FILTERS);
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [deletingVoice, setDeletingVoice] = useState<Voice | null>(null);
  const [activeModal, setActiveModal] = useState<VoicesActiveModal>(null);

  useEffect(() => {
    log.info('mount', 'fetching voices');
    fetchVoices();
  }, [fetchVoices]);

  const availableLanguages = useMemo(() => distinctLanguages(voices), [voices]);
  const availableTags = useMemo(() => distinctTags(voices), [voices]);
  const filtered = useMemo(() => applyFilters(voices, filters), [voices, filters]);

  const handlePlay = useCallback(
    (voiceId: string) => {
      const voice = voices.find((v) => v.id === voiceId);
      if (!voice) {
        log.warn('handlePlay', 'voice not found', { voiceId });
        return;
      }
      play(voiceId, voice.previewAudioUrl);
    },
    [voices, play]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleEdit = useCallback((voice: Voice) => {
    setEditingVoice(voice);
  }, []);

  const handleDelete = useCallback((voice: Voice) => {
    setDeletingVoice(voice);
  }, []);

  const handleDeleted = useCallback(
    (id: string) => {
      if (playingId === id) stop();
    },
    [playingId, stop]
  );

  const handlePromptSaved = useCallback(
    (voice: Voice) => {
      log.info('handlePromptSaved', 'voice created', { voiceId: voice.id });
      upsertLocal(voice);
      toast.success(`Voice "${voice.name}" đã được tạo`);
      setActiveModal(null);
    },
    [upsertLocal]
  );

  const handleCloneSaved = useCallback(
    (voice: Voice) => {
      log.info('handleCloneSaved', 'voice cloned', { voiceId: voice.id });
      upsertLocal(voice);
      toast.success(`Voice "${voice.name}" cloned`);
      setActiveModal(null);
    },
    [upsertLocal]
  );

  const handleImportImported = useCallback(
    (voice: Voice) => {
      log.info('handleImportImported', 'voice imported', { voiceId: voice.id });
      upsertLocal(voice);
      toast.success(`Voice "${voice.name}" imported`);
      setActiveModal(null);
    },
    [upsertLocal]
  );

  return (
    <main
      aria-labelledby="voices-heading"
      className="w-full"
    >
      <VoicesHeader
        onPromptClick={() => setActiveModal('prompt')}
        onCloneClick={() => setActiveModal('clone')}
        onImportClick={() => setActiveModal('import')}
      />
      <VoicesToolbar
        filters={filters}
        count={filtered.length}
        availableLanguages={availableLanguages}
        availableTags={availableTags}
        onChange={setFilters}
      />
      {isLoading ? (
        <GridSkeleton />
      ) : (
        <VoicesGrid
          voices={filtered}
          isLibraryEmpty={voices.length === 0}
          playingId={playingId}
          onPlay={handlePlay}
          onStop={handleStop}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {editingVoice ? (
        <EditVoiceModal
          voice={editingVoice}
          onClose={() => setEditingVoice(null)}
        />
      ) : null}

      {deletingVoice ? (
        <DeleteVoiceDialog
          voice={deletingVoice}
          onClose={() => setDeletingVoice(null)}
          onDeleted={handleDeleted}
        />
      ) : null}

      {activeModal === 'prompt' ? (
        <PromptVoiceModal
          onClose={() => setActiveModal(null)}
          onSaved={handlePromptSaved}
        />
      ) : null}

      {activeModal === 'clone' ? (
        <CloneVoiceModal
          onClose={() => setActiveModal(null)}
          onCloned={handleCloneSaved}
        />
      ) : null}

      {activeModal === 'import' ? (
        <ImportVoiceModal
          onClose={() => setActiveModal(null)}
          onImported={handleImportImported}
        />
      ) : null}
    </main>
  );
}
