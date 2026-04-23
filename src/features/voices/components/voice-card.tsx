import { memo } from 'react';
import type { MouseEvent } from 'react';
import { Pencil, Play, Square, Trash } from 'lucide-react';
import { cn } from '@/utils/utils';
import {
  AGE_LABEL,
  GENDER_LABEL,
  TYPE_LABEL,
  getLanguageName,
  titleCase,
} from '@/features/voices/utils/voice-labels';
import { voiceTags } from '@/features/voices/utils/voice-filters';
import type { Voice } from '@/types/voice';

interface PlayButtonProps {
  isPlaying: boolean;
  disabled: boolean;
  voiceName: string;
  onClick: () => void;
}

function PlayButton({ isPlaying, disabled, voiceName, onClick }: PlayButtonProps) {
  const title = disabled
    ? 'No preview available'
    : isPlaying
      ? 'Stop preview'
      : `Play preview of ${voiceName}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      aria-pressed={isPlaying}
      className={cn(
        'h-10 w-10 shrink-0 rounded-full inline-flex items-center justify-center',
        'text-primary transition-colors',
        isPlaying ? 'bg-primary/10' : 'bg-accent/50',
        'hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed'
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

interface VoiceCardProps {
  voice: Voice;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function VoiceCardInner({
  voice,
  isPlaying,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: VoiceCardProps) {
  const tags = voiceTags(voice);
  const canPlay = voice.previewAudioUrl !== null && voice.previewAudioUrl !== '';

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
      className="group relative border rounded-lg p-4 transition-shadow hover:shadow"
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Edit voice ${voice.name}`}
          onClick={handleEditClick}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          type="button"
          aria-label={`Delete voice ${voice.name}`}
          onClick={handleDeleteClick}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex items-start gap-3">
        <PlayButton
          isPlaying={isPlaying}
          disabled={!canPlay}
          voiceName={voice.name}
          onClick={handlePlayClick}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{voice.name}</span>
            <span className="text-xs bg-muted rounded px-2 py-0.5">
              {TYPE_LABEL[voice.type]}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {GENDER_LABEL[voice.gender]} · {AGE_LABEL[voice.age]} ·{' '}
            {getLanguageName(voice.language)}
          </div>
        </div>
      </div>

      {voice.description ? (
        <p className="mt-3 text-sm line-clamp-2">{voice.description}</p>
      ) : null}

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="text-xs bg-muted/50 rounded-md px-2 py-0.5"
            >
              {titleCase(t)}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export const VoiceCard = memo(VoiceCardInner);
