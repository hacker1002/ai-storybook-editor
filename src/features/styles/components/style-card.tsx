// style-card.tsx — One art-style card in StylesGrid. Visual-first: reference thumbnails +
// metadata; hover/focus-within reveals edit/delete actions (pure CSS, no JS state — avoids
// set-state-in-effect per memory rule). Wrapped in React.memo (stable callbacks from parent).

import { memo } from 'react';
import type { MouseEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { parseTags } from '@/features/styles/utils/style-filters';
import { MAX_TAG_CHIPS, CARD_REF_THUMBS } from '@/features/styles/constants/constants';
import type { ArtStyle, StyleImageReference } from '@/types/art-style';

/** type (0=sketch, 1=illustration) → card badge label. */
const STYLE_TYPE_BADGE: Record<number, string> = { 0: 'Sketch', 1: 'Illustration' };

interface StyleThumbStripProps {
  thumbs: StyleImageReference[];
  styleName: string;
}

// Full-bleed top header: CARD_REF_THUMBS fixed portrait columns (preview strip —
// a style may hold more refs than shown). Each slot is a gray (bg-muted) cell;
// present refs overlay an <img>. Empty refs — or images that fail to load
// (deleted/dangling Storage object) — fall back to the gray cell (onError hides
// the img imperatively, no React state → no re-render loop).
function StyleThumbStrip({ thumbs, styleName }: StyleThumbStripProps) {
  const slots = Array.from({ length: CARD_REF_THUMBS }, (_, i) => thumbs[i]);
  return (
    // bg-muted on the container fills the gap-0.5 hairlines AND any empty/broken
    // slot (img absolute over a transparent cell → container gray shows through).
    // grid-rows-1 forces the single row to fill aspect-video height (our imgs are
    // absolute, so the auto row would otherwise collapse to 0).
    <div className="grid aspect-video grid-cols-3 grid-rows-1 gap-0.5 bg-muted">
      {slots.map((ref, i) => (
        <div key={ref ? `${ref.mediaUrl}-${i}` : `empty-${i}`} className="relative overflow-hidden">
          {ref ? (
            <img
              src={ref.mediaUrl}
              alt={ref.title || styleName}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

interface StyleCardProps {
  style: ArtStyle;
  onEdit: (style: ArtStyle) => void;
  onDelete: (style: ArtStyle) => void;
}

function StyleCardInner({ style, onEdit, onDelete }: StyleCardProps) {
  const tags = parseTags(style.tags);
  const visibleTags = tags.slice(0, MAX_TAG_CHIPS);
  const overflowCount = tags.length - visibleTags.length;
  const refCount = style.imageReferences.length;
  const thumbs: StyleImageReference[] = style.imageReferences;

  const handleEditClick = (e: MouseEvent) => {
    e.stopPropagation();
    onEdit(style);
  };
  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(style);
  };

  return (
    <article
      aria-label={style.name}
      className="group relative overflow-hidden rounded-lg border border-border transition-shadow hover:border-foreground/20 hover:shadow-sm"
    >
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Edit style ${style.name}`}
          onClick={handleEditClick}
          className="inline-flex size-7 items-center justify-center rounded bg-background/80 backdrop-blur hover:bg-background"
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          aria-label={`Delete style ${style.name}`}
          onClick={handleDeleteClick}
          className="inline-flex size-7 items-center justify-center rounded bg-background/80 backdrop-blur hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <StyleThumbStrip thumbs={thumbs} styleName={style.name} />

      <div className="p-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-medium">{style.name}</h3>
          <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {STYLE_TYPE_BADGE[style.type] ?? 'Illustration'}
          </span>
        </div>

        {style.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {style.description}
          </p>
        ) : null}

        {visibleTags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {visibleTags.map((t) => (
              <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">
                #{t}
              </span>
            ))}
            {overflowCount > 0 ? (
              <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                +{overflowCount}
              </span>
            ) : null}
          </div>
        ) : null}

        <span className="mt-3 block text-xs text-muted-foreground">
          {refCount} {refCount === 1 ? 'reference' : 'references'}
        </span>
      </div>
    </article>
  );
}

export const StyleCard = memo(StyleCardInner);
