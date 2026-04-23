import { Mic } from 'lucide-react';
import { VoiceCard } from './voice-card';
import type { Voice } from '@/types/voice';

function FilteredEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <Mic className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No voices found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Try adjusting your search or filters.
      </p>
    </div>
  );
}

function LibraryEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <Mic className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No voices yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Voices will appear here once added.
      </p>
    </div>
  );
}

interface VoicesGridProps {
  voices: Voice[];
  isLibraryEmpty: boolean;
  playingId: string | null;
  onPlay: (voiceId: string) => void;
  onStop: () => void;
  onEdit: (voice: Voice) => void;
  onDelete: (voice: Voice) => void;
}

export function VoicesGrid({
  voices,
  isLibraryEmpty,
  playingId,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: VoicesGridProps) {
  if (voices.length === 0) {
    return isLibraryEmpty ? <LibraryEmptyState /> : <FilteredEmptyState />;
  }

  return (
    <div
      role="list"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-6 py-4"
    >
      {voices.map((voice) => (
        <VoiceCardItem
          key={voice.id}
          voice={voice}
          isPlaying={playingId === voice.id}
          onPlay={onPlay}
          onStop={onStop}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface VoiceCardItemProps {
  voice: Voice;
  isPlaying: boolean;
  onPlay: (voiceId: string) => void;
  onStop: () => void;
  onEdit: (voice: Voice) => void;
  onDelete: (voice: Voice) => void;
}

// Wrapper so React.memo equality works with stable parent callbacks.
function VoiceCardItem({
  voice,
  isPlaying,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: VoiceCardItemProps) {
  return (
    <VoiceCard
      voice={voice}
      isPlaying={isPlaying}
      onPlay={() => onPlay(voice.id)}
      onStop={onStop}
      onEdit={() => onEdit(voice)}
      onDelete={() => onDelete(voice)}
    />
  );
}
