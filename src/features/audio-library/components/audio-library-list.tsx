import type { ComponentType } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioLibraryRow } from './audio-library-row';
import type { AudioResource } from '../types';

interface IconProps {
  className?: string;
}

interface FilteredEmptyStateProps {
  emptyIcon: ComponentType<IconProps>;
  heading: string;
}

function FilteredEmptyState({ emptyIcon: Icon, heading }: FilteredEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <Icon className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">{heading}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Try adjusting your search or filters.
      </p>
    </div>
  );
}

interface LibraryEmptyStateProps {
  emptyIcon: ComponentType<IconProps>;
  heading: string;
  hint: string;
  uploadCtaLabel: string;
  generateCtaLabel: string;
  onOpenUpload: () => void;
  onOpenGenerate: () => void;
}

function LibraryEmptyState({
  emptyIcon: Icon,
  heading,
  hint,
  uploadCtaLabel,
  generateCtaLabel,
  onOpenUpload,
  onOpenGenerate,
}: LibraryEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      <Icon className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">{heading}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="gap-2" onClick={onOpenUpload}>
          <Upload className="h-4 w-4" />
          {uploadCtaLabel}
        </Button>
        <Button variant="default" className="gap-2" onClick={onOpenGenerate}>
          <Sparkles className="h-4 w-4" />
          {generateCtaLabel}
        </Button>
      </div>
    </div>
  );
}

export interface AudioLibraryListProps {
  items: AudioResource[];
  isLibraryEmpty: boolean;
  resourceLabel: string;
  emptyIcon: ComponentType<IconProps>;
  emptyHeadingNoYet: string;
  emptyHeadingNoMatch: string;
  emptyHint: string;
  uploadCtaLabel: string;
  generateCtaLabel: string;
  playingId: string | null;
  onPlay: (itemId: string) => void;
  onStop: () => void;
  onEdit: (item: AudioResource) => void;
  onDelete: (item: AudioResource) => void;
  onOpenUpload: () => void;
  onOpenGenerate: () => void;
}

export function AudioLibraryList({
  items,
  isLibraryEmpty,
  resourceLabel,
  emptyIcon,
  emptyHeadingNoYet,
  emptyHeadingNoMatch,
  emptyHint,
  uploadCtaLabel,
  generateCtaLabel,
  playingId,
  onPlay,
  onStop,
  onEdit,
  onDelete,
  onOpenUpload,
  onOpenGenerate,
}: AudioLibraryListProps) {
  if (items.length === 0) {
    return isLibraryEmpty ? (
      <LibraryEmptyState
        emptyIcon={emptyIcon}
        heading={emptyHeadingNoYet}
        hint={emptyHint}
        uploadCtaLabel={uploadCtaLabel}
        generateCtaLabel={generateCtaLabel}
        onOpenUpload={onOpenUpload}
        onOpenGenerate={onOpenGenerate}
      />
    ) : (
      <FilteredEmptyState emptyIcon={emptyIcon} heading={emptyHeadingNoMatch} />
    );
  }

  return (
    <div role="list" className="flex flex-col gap-3 px-6 py-4">
      {items.map((item) => (
        <AudioLibraryRowItem
          key={item.id}
          item={item}
          isPlaying={playingId === item.id}
          resourceLabel={resourceLabel}
          onPlay={onPlay}
          onStop={onStop}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface AudioLibraryRowItemProps {
  item: AudioResource;
  isPlaying: boolean;
  resourceLabel: string;
  onPlay: (itemId: string) => void;
  onStop: () => void;
  onEdit: (item: AudioResource) => void;
  onDelete: (item: AudioResource) => void;
}

function AudioLibraryRowItem({
  item,
  isPlaying,
  resourceLabel,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: AudioLibraryRowItemProps) {
  return (
    <AudioLibraryRow
      item={item}
      isPlaying={isPlaying}
      resourceLabel={resourceLabel}
      onPlay={() => onPlay(item.id)}
      onStop={onStop}
      onEdit={() => onEdit(item)}
      onDelete={() => onDelete(item)}
    />
  );
}
