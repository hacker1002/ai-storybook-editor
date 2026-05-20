// use-collapse-state.ts — Local collapse state for 3-level sidebar tree.
// Two parallel sets: collapsed entities (variant group hidden) and collapsed
// variants (sheet group hidden). Variant key is composite `${entityKey}:${variantKey}`
// so a single Set can store all variant collapse flags across every entity.
//
// KISS: default all expanded. Re-mount (e.g. tab change) resets — acceptable per
// plan §risk. Persist later if user complains.

import { useState, useCallback } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useSidebarCollapseState');

export interface CollapseState {
  /** entityKeys whose variant group is collapsed (char/prop only). */
  entities: Set<string>;
  /** Composite keys `${entityKey}:${variantKey}` whose sheet group is collapsed. */
  variants: Set<string>;
}

function variantCompositeKey(entityKey: string, variantKey: string): string {
  return `${entityKey}:${variantKey}`;
}

export interface CollapseApi {
  isEntityCollapsed: (entityKey: string) => boolean;
  isVariantCollapsed: (entityKey: string, variantKey: string) => boolean;
  toggleEntity: (entityKey: string) => void;
  toggleVariant: (entityKey: string, variantKey: string) => void;
}

export function useSidebarCollapseState(): CollapseApi {
  const [state, setState] = useState<CollapseState>(() => ({
    entities: new Set<string>(),
    variants: new Set<string>(),
  }));

  const isEntityCollapsed = useCallback(
    (entityKey: string) => state.entities.has(entityKey),
    [state.entities],
  );

  const isVariantCollapsed = useCallback(
    (entityKey: string, variantKey: string) =>
      state.variants.has(variantCompositeKey(entityKey, variantKey)),
    [state.variants],
  );

  const toggleEntity = useCallback((entityKey: string) => {
    setState((prev) => {
      const next = new Set(prev.entities);
      if (next.has(entityKey)) {
        next.delete(entityKey);
        log.debug('toggleEntity', 'expand', { entityKey });
      } else {
        next.add(entityKey);
        log.debug('toggleEntity', 'collapse', { entityKey });
      }
      return { ...prev, entities: next };
    });
  }, []);

  const toggleVariant = useCallback(
    (entityKey: string, variantKey: string) => {
      const k = variantCompositeKey(entityKey, variantKey);
      setState((prev) => {
        const next = new Set(prev.variants);
        if (next.has(k)) {
          next.delete(k);
          log.debug('toggleVariant', 'expand', { entityKey, variantKey });
        } else {
          next.add(k);
          log.debug('toggleVariant', 'collapse', { entityKey, variantKey });
        }
        return { ...prev, variants: next };
      });
    },
    [],
  );

  return { isEntityCollapsed, isVariantCollapsed, toggleEntity, toggleVariant };
}
