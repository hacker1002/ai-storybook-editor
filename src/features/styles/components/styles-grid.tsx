// styles-grid.tsx — Body of the /styles page. Renders a responsive StyleCard grid or one of
// two empty states (filtered-empty vs library-empty). Presentational — all data filtered upstream.

import { StyleCard } from './style-card';
import { LibraryEmptyState } from './library-empty-state';
import { FilteredEmptyState } from './filtered-empty-state';
import type { ArtStyle } from '@/types/art-style';
import { createLogger } from '@/utils/logger';

const log = createLogger('Styles', 'StylesGrid');

interface StylesGridProps {
  styles: ArtStyle[]; // already filtered
  isLibraryEmpty: boolean; // unfiltered library length === 0
  onEdit: (style: ArtStyle) => void;
  onDelete: (style: ArtStyle) => void;
  onOpenNew?: () => void; // for LibraryEmptyState CTA
}

export function StylesGrid({
  styles,
  isLibraryEmpty,
  onEdit,
  onDelete,
  onOpenNew,
}: StylesGridProps) {
  if (styles.length === 0) {
    if (isLibraryEmpty) {
      log.debug('render', 'empty-state: library');
      return <LibraryEmptyState onOpenNew={onOpenNew} />;
    }
    log.debug('render', 'empty-state: filtered');
    return <FilteredEmptyState />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 px-6 py-3 sm:grid-cols-2 xl:grid-cols-3">
      {styles.map((style) => (
        <StyleCardItem
          key={style.id}
          style={style}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface StyleCardItemProps {
  style: ArtStyle;
  onEdit: (style: ArtStyle) => void;
  onDelete: (style: ArtStyle) => void;
}

// Thin wrapper so React.memo on StyleCard stays effective with stable parent callbacks.
function StyleCardItem({ style, onEdit, onDelete }: StyleCardItemProps) {
  return <StyleCard style={style} onEdit={onEdit} onDelete={onDelete} />;
}
