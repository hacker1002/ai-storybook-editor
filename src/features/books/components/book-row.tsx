// book-row.tsx — One book line in BooksList: cover + title + description +
// StepBadge + updated-ago + 3 action icons (View / Edit / Delete).
// Row body click → onOpenDetails (low-commitment quick view); ✎ → editor.
// Every action stops propagation so it never re-triggers the row-body handler.
// Wrapped in React.memo (key = book.id) — list rows are otherwise pure.

import { memo } from 'react';
import { BookOpen, Clock, Eye, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { StepBadge } from '@/features/books/components/step-badge';
import type { BookStep } from '@/features/books/types';
import { formatRelativeTime } from '@/utils/format-relative-time';
import type { BookListItem } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Books', 'BookRow');

interface BookRowProps {
  book: BookListItem;
  onOpenDetails: (book: BookListItem) => void;
  onEdit: (book: BookListItem) => void;
  onDelete: (book: BookListItem) => void;
}

/** Inline cover thumbnail: lazy <img> from cover.thumbnail_url, else placeholder. */
function CoverThumb({
  cover,
  title,
}: {
  cover: BookListItem['cover'];
  title: string;
}) {
  const url = cover?.thumbnail_url ?? cover?.normal_url;
  if (url) {
    return (
      <img
        src={url}
        alt={title}
        loading="lazy"
        className="h-12 w-12 shrink-0 rounded-md object-cover"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
      <BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function BookRowImpl({ book, onOpenDetails, onEdit, onDelete }: BookRowProps) {
  const openDetails = () => {
    log.debug('openDetails', 'row open', { id: book.id });
    onOpenDetails(book);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetails();
    }
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    openDetails();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.debug('handleEdit', 'edit clicked', { id: book.id });
    onEdit(book);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.debug('handleDelete', 'delete clicked', { id: book.id });
    onDelete(book);
  };

  const updatedLabel = formatRelativeTime(book.updated_at);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${book.title} details`}
      onClick={openDetails}
      onKeyDown={handleKeyDown}
      className="group flex cursor-pointer items-center gap-4 py-4 hover:bg-accent/40"
    >
      <CoverThumb cover={book.cover} title={book.title} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{book.title}</p>
        {book.description ? (
          <p className="truncate text-sm text-muted-foreground">
            {book.description}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-xs">
          <StepBadge step={book.step as BookStep} />
        </div>
      </div>

      <div className="flex items-center gap-3 text-muted-foreground">
        <span
          className="flex items-center gap-1 text-xs"
          title={new Date(book.updated_at).toLocaleString()}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {updatedLabel}
        </span>
        <button
          type="button"
          aria-label="View details"
          onClick={handleView}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Edit"
          onClick={handleEdit}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Delete"
          onClick={handleDelete}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent',
            'hover:text-destructive',
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export const BookRow = memo(BookRowImpl);
