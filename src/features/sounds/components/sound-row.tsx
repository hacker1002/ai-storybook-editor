import { memo } from 'react';
import type { MouseEvent } from 'react';
import {
  Clock,
  Pencil,
  Play,
  Repeat,
  Sparkles,
  Square,
  Trash,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/utils';
import {
  SOURCE_BADGE,
  formatDurationMs,
} from '@/features/sounds/utils/sound-labels';
import { soundTags } from '@/features/sounds/utils/sound-filters';
import type { Sound, SoundSource } from '@/types/sound';

interface PlayButtonProps {
  isPlaying: boolean;
  soundName: string;
  onClick: () => void;
}

function PlayButton({ isPlaying, soundName, onClick }: PlayButtonProps) {
  const label = isPlaying ? 'Stop' : `Play ${soundName}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isPlaying}
      className={cn(
        'h-10 w-10 shrink-0 rounded-full inline-flex items-center justify-center',
        'text-primary transition-colors',
        isPlaying ? 'bg-primary/15' : 'bg-primary/10',
        'hover:bg-primary/20'
      )}
    >
      {isPlaying ? (
        <Square className="h-4 w-4 fill-current" />
      ) : (
        <Play className="h-4 w-4 fill-current" />
      )}
    </button>
  );
}

function SourceBadge({ source }: { source: SoundSource }) {
  const meta = SOURCE_BADGE[source];
  const Icon = meta.iconName === 'Upload' ? Upload : Sparkles;
  const ariaLabel = source === 0 ? 'Source: Uploaded' : 'Source: Generated';
  return (
    <span
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function LoopBadge() {
  return (
    <span
      aria-label="Loops continuously"
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
    >
      <Repeat className="h-3 w-3" />
      Loop
    </span>
  );
}

interface SoundRowProps {
  sound: Sound;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SoundRowInner({
  sound,
  isPlaying,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: SoundRowProps) {
  const tags = soundTags(sound);
  const durationLabel = formatDurationMs(sound.duration);

  const handlePlayClick = () => (isPlaying ? onStop() : onPlay());
  const handleEditClick = (e: MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };
  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <article
      role="listitem"
      aria-labelledby={`sound-name-${sound.id}`}
      className="group relative border rounded-lg p-4 flex gap-3 transition-colors hover:bg-accent/30"
    >
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Edit ${sound.name}`}
          onClick={handleEditClick}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${sound.name}`}
          onClick={handleDeleteClick}
          className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash className="h-3.5 w-3.5" />
        </button>
      </div>

      <PlayButton
        isPlaying={isPlaying}
        soundName={sound.name}
        onClick={handlePlayClick}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 pr-20">
          <span
            id={`sound-name-${sound.id}`}
            className="font-medium truncate"
          >
            {sound.name}
          </span>
          <SourceBadge source={sound.source} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {durationLabel}
          </span>
          {sound.loop ? <LoopBadge /> : null}
        </div>

        {sound.description ? (
          <p className="text-sm text-muted-foreground truncate">
            {sound.description}
          </p>
        ) : null}

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="text-xs bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const SoundRow = memo(SoundRowInner);
