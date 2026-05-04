import { Music, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SoundRow } from './sound-row';
import type { Sound } from '@/types/sound';

function FilteredEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <Music className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No sounds found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Try adjusting your search or filters.
      </p>
    </div>
  );
}

interface LibraryEmptyStateProps {
  onOpenUpload: () => void;
  onOpenGenerate: () => void;
}

function LibraryEmptyState({
  onOpenUpload,
  onOpenGenerate,
}: LibraryEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      <Music className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No sounds yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first sound to get started.
      </p>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="gap-2" onClick={onOpenUpload}>
          <Upload className="h-4 w-4" />
          Upload Sound
        </Button>
        <Button variant="default" className="gap-2" onClick={onOpenGenerate}>
          <Sparkles className="h-4 w-4" />
          Generate Sound
        </Button>
      </div>
    </div>
  );
}

interface SoundsListProps {
  sounds: Sound[];
  isLibraryEmpty: boolean;
  playingId: string | null;
  onPlay: (soundId: string) => void;
  onStop: () => void;
  onEdit: (sound: Sound) => void;
  onDelete: (sound: Sound) => void;
  onOpenUpload: () => void;
  onOpenGenerate: () => void;
}

export function SoundsList({
  sounds,
  isLibraryEmpty,
  playingId,
  onPlay,
  onStop,
  onEdit,
  onDelete,
  onOpenUpload,
  onOpenGenerate,
}: SoundsListProps) {
  if (sounds.length === 0) {
    return isLibraryEmpty ? (
      <LibraryEmptyState
        onOpenUpload={onOpenUpload}
        onOpenGenerate={onOpenGenerate}
      />
    ) : (
      <FilteredEmptyState />
    );
  }

  return (
    <div role="list" className="flex flex-col gap-3 px-6 py-4">
      {sounds.map((sound) => (
        <SoundRowItem
          key={sound.id}
          sound={sound}
          isPlaying={playingId === sound.id}
          onPlay={onPlay}
          onStop={onStop}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface SoundRowItemProps {
  sound: Sound;
  isPlaying: boolean;
  onPlay: (soundId: string) => void;
  onStop: () => void;
  onEdit: (sound: Sound) => void;
  onDelete: (sound: Sound) => void;
}

// Wrapper so React.memo equality holds with stable parent callbacks.
function SoundRowItem({
  sound,
  isPlaying,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: SoundRowItemProps) {
  return (
    <SoundRow
      sound={sound}
      isPlaying={isPlaying}
      onPlay={() => onPlay(sound.id)}
      onStop={onStop}
      onEdit={() => onEdit(sound)}
      onDelete={() => onDelete(sound)}
    />
  );
}
