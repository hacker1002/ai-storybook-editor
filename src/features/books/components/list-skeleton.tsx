// list-skeleton.tsx — Loading placeholder rows for the /books list (mirrors the
// musics-page ListSkeleton pattern). Presentational; no store access.

import { createLogger } from '@/utils/logger';

const log = createLogger('Books', 'ListSkeleton');

interface ListSkeletonProps {
  rows?: number;
}

export function ListSkeleton({ rows = 6 }: ListSkeletonProps) {
  log.debug('render', 'render skeleton', { rows });
  return (
    <div
      role="status"
      aria-label="Loading books"
      className="flex flex-col gap-3 px-6 py-4"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}
