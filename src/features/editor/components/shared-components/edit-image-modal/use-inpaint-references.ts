// use-inpaint-references.ts — The Inpaint tab's reference-image concern, split out of inpaint-tab.tsx
// to keep it under the size cap AND to keep the reference logic cohesive. Wraps
// useReferenceImagePicker (upload path, cap = INPAINT_REF_MAX) and adds `onPick` — convert-on-add for
// a picked prop-variant (fetch its Storage URL → base64 → append). Returns the full picker API + onPick.

import { useCallback } from 'react';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';
import { useReferenceImagePicker } from '@/features/editor/hooks/use-reference-image-picker';
import { INPAINT_REF_MAX, INPAINT_REF_DESC_MAX } from './edit-image-modal-constants';
import { urlToBase64, type ReferenceImageCandidate } from './edit-image-modal-utils';

const log = createLogger('Editor', 'InpaintReferences');

export function useInpaintReferences() {
  const refs = useReferenceImagePicker(INPAINT_REF_MAX);
  const { images, addReferenceImages } = refs;

  // Pick a prop-variant → fetch its URL → base64 → append (design §8.3 convert-on-add). Guards cap +
  // dedupe up front; a fetch/CORS failure surfaces a generic toast and NEVER blocks the commit
  // (refs are optional). description = clipped candidate.description, else the short ref.
  const onPick = useCallback(
    async (candidate: ReferenceImageCandidate) => {
      if (images.length >= INPAINT_REF_MAX) {
        toast.warning(`Tối đa ${INPAINT_REF_MAX} ảnh tham khảo`);
        return;
      }
      if (images.some((i) => i.id === `prop:${candidate.id}`)) return; // already picked
      try {
        const { base64Data, mimeType } = await urlToBase64(candidate.media_url);
        const description = candidate.description.slice(0, INPAINT_REF_DESC_MAX) || candidate.ref;
        addReferenceImages([
          {
            id: `prop:${candidate.id}`,
            label: candidate.ref,
            thumbUrl: candidate.media_url,
            base64Data,
            mimeType,
            description,
            source: 'prop',
          },
        ]);
      } catch (err) {
        log.warn('onPick', 'reference fetch failed', { id: candidate.id, error: String(err) });
        toast.error('Không tải được ảnh tham khảo');
      }
    },
    [images, addReferenceImages],
  );

  return { ...refs, onPick };
}
