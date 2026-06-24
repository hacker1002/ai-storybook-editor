// illustration-edit-image-modal.tsx — Store-binding connector for the controlled
// EditImageModal in the Spreads/illustration space. Illustration spread images live in
// `illustration.spreads[].raw_images[]`; this thin wrapper resolves the raw image and feeds
// `illustrations` + `onUpdateIllustrations` (+ mediaUrl seed + pathPrefix), mirroring
// RetouchEditImageModal. Mounted only while a target image is selected, so the store hooks
// run unconditionally.

import { useCallback } from "react";
import { EditImageModal } from "@/features/editor/components/shared-components/edit-image-modal";
import type { EditToolKey } from "@/features/editor/components/shared-components/edit-image-modal";
import { useRawImageById, useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { Illustration } from "@/types/prop-types";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "IllustrationEditImageModal");

interface IllustrationEditImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spreadId: string;
  imageId: string;
  /** Per-space edit-tool availability (matrix gate). Forwarded to EditImageModal. */
  enabledTools?: EditToolKey[];
}

export function IllustrationEditImageModal({
  open,
  onOpenChange,
  spreadId,
  imageId,
  enabledTools,
}: IllustrationEditImageModalProps) {
  const image = useRawImageById(spreadId, imageId);
  const { updateRawImage } = useSnapshotActions();

  const handleUpdate = useCallback(
    (next: Illustration[]) => {
      log.debug("handleUpdate", "persist illustrations", { spreadId, imageId, count: next.length });
      updateRawImage(spreadId, imageId, { illustrations: next });
    },
    [spreadId, imageId, updateRawImage],
  );

  // Image deleted while modal open → parent ILS force-pop closes; render nothing meanwhile.
  if (!image) return null;

  // Seed fallback (display-only) when illustrations[] is empty: final hi-res → selected → first.
  const seedUrl =
    image.final_hires_media_url ??
    image.illustrations?.find((v) => v.is_selected)?.media_url ??
    image.illustrations?.[0]?.media_url ??
    image.media_url ??
    "";

  return (
    <EditImageModal
      open={open}
      onOpenChange={onOpenChange}
      imageTitle={image.title ?? ""}
      illustrations={image.illustrations ?? []}
      mediaUrl={seedUrl}
      onUpdateIllustrations={handleUpdate}
      pathPrefix={`illustrations/${imageId}/erased`}
      enabledTools={enabledTools}
    />
  );
}
