// use-selected-swap-crops.tsx — Selection state for swap-crop checkboxes in the
// Batches tab (rev6 selective Add Batch).
//
// State lives in a `SelectionProvider` that the modal wraps around `BatchesTab`
// with a composite `key` derived from `${activeBatchId}::${totalSwapResultsCount}`.
// When the key changes (batch switch OR new swap_results pushed to the active
// batch), React unmounts the provider — re-mounting initialises fresh local
// state. This eliminates the React 19 lint trap of `useEffect` + `setState`
// reset pairs (memory: feedback_react19_set_state_in_effect).
//
// Switching SHEETS within the same batch keeps the key stable → selection
// persists, matching design 05-08-batches-tab.md §3.2 (selection survives
// intra-batch sheet navigation; resets on swap completion / batch switch).
//
// SECURITY: never log media_url / crop content — only `cropKey` (UUID, no PII)
// and `selectionSize`.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SelectionProvider');

interface SelectionContextValue {
  keys: ReadonlySet<string>;
  toggle: (cropKey: string) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/** Wraps consumers (`BatchesTab` + its descendants) in a fresh-`Set` selection
 *  scope. Remount via `key` prop on the parent is the ONLY reset mechanism —
 *  there is no internal effect-driven reset, so React 19's set-state-in-effect
 *  lint stays clean by construction. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((cropKey: string) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(cropKey)) next.delete(cropKey);
      else next.add(cropKey);
      log.debug('toggle', 'toggle swap-crop selection', {
        cropKey,
        nextSize: next.size,
      });
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    log.debug('clear', 'clear all swap-crop selections', {});
    setKeys(new Set());
  }, []);

  const value = useMemo<SelectionContextValue>(
    () => ({ keys, toggle, clear }),
    [keys, toggle, clear],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** Read selection state from the nearest `SelectionProvider`. Throws when used
 *  outside the provider — the modal always wraps `BatchesTab`, so a thrown
 *  error here is a structural bug, not a runtime fallback. */
// eslint-disable-next-line react-refresh/only-export-components
export function useSelectedSwapCrops(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error(
      'useSelectedSwapCrops must be used inside <SelectionProvider>',
    );
  }
  return ctx;
}
