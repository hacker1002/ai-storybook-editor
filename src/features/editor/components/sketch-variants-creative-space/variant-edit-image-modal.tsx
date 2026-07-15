// variant-edit-image-modal.tsx — store-binding connector for the shared, store-agnostic
// EditImageModal in the Variant space (design README §3.4). Mirrors SketchBaseEditImageModal:
// resolves `illustrations` + `onUpdateIllustrations` + `pathPrefix` + `mediaUrl` + `imageTitle`
// from the CROP `EditImageTarget` (raw sheet is never shown/edited), then feeds the controlled modal.
// Mounted only while a target is set, so the store hooks run unconditionally.
//
// Tool availability = SPACE_TOOL_MATRIX['sketch-variant'].edit (inpaint + erasor). Landing = inpaint.

import { useCallback } from 'react';
import { EditImageModal } from '@/features/editor/components/shared-components/edit-image-modal';
import { SPACE_TOOL_MATRIX } from '@/features/editor/components/shared-components/image-tools-space-matrix';
import { useSketchVariantByKey, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import type { Illustration } from '@/types/prop-types';
import { createLogger } from '@/utils/logger';
import type { EditImageTarget } from './sketch-variants-constants';

const log = createLogger('Editor', 'VariantEditImageModal');

/** Effective url for the display-only seed: selected version → newest → ''. */
function effectiveUrl(illustrations: Illustration[]): string {
  return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? '';
}

export interface VariantEditImageModalProps {
  target: EditImageTarget;
  onClose: () => void;
}

export function VariantEditImageModal({ target, onClose }: VariantEditImageModalProps) {
  const variant = useSketchVariantByKey(target.kind, target.entityKey, target.variantKey);
  const { setSketchVariantCropIllustrations } = useSnapshotActions();

  const crop = variant?.raw_sheet?.crops[target.cropIndex];
  const illustrations: Illustration[] = crop?.illustrations ?? [];

  const handleUpdate = useCallback(
    (next: Illustration[]) => {
      log.debug('handleUpdate', 'persist crop illustrations', {
        kind: target.kind,
        entityKey: target.entityKey,
        variantKey: target.variantKey,
        cropIndex: target.cropIndex,
        count: next.length,
      });
      setSketchVariantCropIllustrations(
        target.kind,
        target.entityKey,
        target.variantKey,
        target.cropIndex,
        next,
      );
    },
    [target, setSketchVariantCropIllustrations],
  );

  // Crop gone (regenerate/re-cut shifted indices) while the modal was open → nothing to bind.
  if (!crop) return null;

  const pathPrefix = `sketch/variant/${target.kind}/${target.entityKey}/${target.variantKey}/crop/${target.cropIndex}`;
  const imageTitle = `Variant crop ${target.cropIndex + 1} — @${target.entityKey}/${target.variantKey}`;

  return (
    <EditImageModal
      open
      onOpenChange={(open) => !open && onClose()}
      imageTitle={imageTitle}
      illustrations={illustrations}
      mediaUrl={effectiveUrl(illustrations)}
      onUpdateIllustrations={handleUpdate}
      pathPrefix={pathPrefix}
      enabledTools={SPACE_TOOL_MATRIX['sketch-variant'].edit}
      initialTool="inpaint"
    />
  );
}
