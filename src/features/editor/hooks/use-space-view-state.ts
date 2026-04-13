// use-space-view-state.ts - Hook for per-space view state (ADR-021)
// Reads bookId from route params internally; consumer only needs to pass the space name.

import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  useEditorSpaceViewStore,
  useSpaceViewSlot,
  EMPTY_SLOT,
} from '@/stores/editor-space-view-store';
import type { SpaceViewState } from '@/stores/editor-space-view-store';
import type { CreativeSpaceType } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useSpaceViewState');

// Stable noop for the no-bookId fallback path — avoids creating new fn refs each render.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (_: Partial<SpaceViewState>) => {};

// === Primary hook ===

/**
 * Returns the persisted view state for `space` in the current book,
 * plus a `patch` function to update it.
 *
 * @example
 *   const { activeSpreadId, zoomLevel, viewMode, columnsPerRow, patch } =
 *     useSpaceViewState('spread');
 *   patch({ zoomLevel: 150 });
 */
export function useSpaceViewState(space: CreativeSpaceType): SpaceViewState & {
  patch: (partial: Partial<SpaceViewState>) => void;
} {
  const { bookId } = useParams<{ bookId: string }>();
  // When bookId is undefined, slot resolves to EMPTY_SLOT via the '' key guard in useSpaceViewSlot.
  const slot = useSpaceViewSlot(bookId, space);
  const patchSpace = useEditorSpaceViewStore((s) => s.patchSpace);

  const patch = useCallback(
    (partial: Partial<SpaceViewState>) => {
      if (!bookId) {
        log.warn('patch', 'called outside editor route — patch ignored', { space });
        return;
      }
      patchSpace(bookId, space, partial);
    },
    [bookId, space, patchSpace]
  );

  if (!bookId) {
    log.warn('useSpaceViewState', 'no bookId in route params — returning empty slot', { space });
    return { ...EMPTY_SLOT, patch: noop };
  }

  return { ...slot, patch };
}

// === Helper hook ===

/**
 * Resolves the effective spread ID from persisted store + available list.
 * Returns `storedId` if it is still in the list, otherwise `spreadIds[0] ?? null`.
 *
 * @example
 *   const effectiveId = useEffectiveSpreadId(activeSpreadId, illustrationSpreadIds);
 */
export function useEffectiveSpreadId(
  storedId: string | null | undefined,
  spreadIds: readonly string[]
): string | null {
  return useMemo(
    () =>
      storedId && spreadIds.includes(storedId)
        ? storedId
        : (spreadIds[0] ?? null),
    [storedId, spreadIds]
  );
}
