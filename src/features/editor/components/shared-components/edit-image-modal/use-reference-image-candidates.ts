// use-reference-image-candidates.ts — Parent-side resolvers that project the snapshot store's props
// (illustration pipeline) OR sketch prop entities into ReferenceImageCandidate[] for the Inpaint
// tab's reference picker (design 04-inpaint-tab.md §8.4). Two hooks keep the 7 connector modals DRY:
// illus/retouch/remix share the illustration-props resolver; the 4 sketch spaces share the
// sketch-props resolver. v1 scope = PROPS ONLY (characters/stages defer — same shape).
//
// Ref-stability (memory: zustand useShallow nested-array footgun): each hook subscribes the STABLE
// raw store ref via a plain selector (Object.is) then projects with useMemo keyed on that ref —
// NEVER returns a freshly-.map()-ed array straight from a useShallow selector (that render-loops).

import { useMemo } from 'react';
import { useProps, useSketchEntities, effectiveCropUrl } from '@/stores/snapshot-store/selectors';
import { buildPropRefDescription, type ReferenceImageCandidate } from './edit-image-modal-utils';

/** illus/retouch/remix: every prop variant with a resolvable illustration → a candidate. Effective
 *  URL = selected illustration → newest. Variants with no image are filtered out (flatMap → []). */
export function useIllustrationPropRefCandidates(): ReferenceImageCandidate[] {
  const props = useProps(); // stable store ref
  return useMemo(
    () =>
      props.flatMap((p) =>
        p.variants.flatMap((v) => {
          const media =
            v.illustrations.find((i) => i.is_selected)?.media_url ?? v.illustrations[0]?.media_url;
          if (!media) return [];
          return [
            {
              id: `${p.key}/${v.key}`,
              media_url: media,
              ref: `@${p.key}/${v.key}`,
              description: buildPropRefDescription(p.name, p.key, v.key),
            },
          ];
        }),
      ),
    [props],
  );
}

/** sketch spaces: every sketch prop variant with a LOCKED crop → a candidate. `SketchEntity` has no
 *  name → borrow the book prop of the same key (falls back to the key). Variants with no locked crop
 *  (effectiveCropUrl null) are filtered out (flatMap → []). */
export function useSketchPropRefCandidates(): ReferenceImageCandidate[] {
  const entities = useSketchEntities('props'); // stable store ref
  const props = useProps(); // for name lookup (stable ref)
  return useMemo(
    () =>
      entities.flatMap((e) => {
        const name = props.find((p) => p.key === e.key)?.name ?? e.key;
        return e.variants.flatMap((v) => {
          const media = effectiveCropUrl(v);
          if (!media) return [];
          return [
            {
              id: `${e.key}/${v.key}`,
              media_url: media,
              ref: `@${e.key}/${v.key}`,
              description: buildPropRefDescription(name, e.key, v.key),
            },
          ];
        });
      }),
    [entities, props],
  );
}
