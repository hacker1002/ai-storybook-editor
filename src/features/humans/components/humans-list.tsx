// humans-list.tsx — Renders rows or empty states (library vs filtered).

import { HumanRow } from './human-row';
import { LibraryEmptyState } from './library-empty-state';
import { FilteredEmptyState } from './filtered-empty-state';
import type { Human } from '@/types/human';

interface HumansListProps {
  humans: Human[];
  isLibraryEmpty: boolean;
  onOpenDetail: (humanId: string) => void;
  onDelete: (human: Human) => void;
  onOpenCreate: () => void;
}

export function HumansList({
  humans,
  isLibraryEmpty,
  onOpenDetail,
  onDelete,
  onOpenCreate,
}: HumansListProps) {
  if (humans.length === 0) {
    return isLibraryEmpty ? (
      <LibraryEmptyState onOpenCreate={onOpenCreate} />
    ) : (
      <FilteredEmptyState />
    );
  }

  return (
    <ul role="list" className="space-y-1 px-6 py-3">
      {humans.map((h) => (
        <li key={h.id}>
          <HumanRow human={h} onOpenDetail={onOpenDetail} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
