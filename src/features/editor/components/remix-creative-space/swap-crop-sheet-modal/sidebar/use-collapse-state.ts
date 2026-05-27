// use-collapse-state.ts — Generic collapse-set hook (rev2, Phase 08).
//
// A single reusable `Set<string>` toggle hook. The rev2 sidebar is a Batch→Sheet
// tree whose only collapse axis is the batch row, so the previous 3-level
// entity/variant collapse API is gone. Kept generic (any string key) so it can
// back any single-axis collapse tree (DRY) — BatchesSidebar uses it for
// `collapsedBatches` keyed by `batch.id`.
//
// KISS: default all expanded (empty set). Re-mount (e.g. tab change) resets —
// acceptable per plan §risk. Persist later if user complains.

import { useState, useCallback } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useCollapseState');

export interface CollapseSetApi {
  /** True when `key` is currently collapsed. */
  isCollapsed: (key: string) => boolean;
  /** Flip the collapse flag for `key`. */
  toggle: (key: string) => void;
}

/** Single-axis collapse state backed by one `Set<string>`. */
export function useCollapseState(): CollapseSetApi {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const isCollapsed = useCallback(
    (key: string) => collapsed.has(key),
    [collapsed],
  );

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        log.debug('toggle', 'expand', { key });
      } else {
        next.add(key);
        log.debug('toggle', 'collapse', { key });
      }
      return next;
    });
  }, []);

  return { isCollapsed, toggle };
}
