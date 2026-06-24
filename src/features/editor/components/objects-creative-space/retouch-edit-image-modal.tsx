// retouch-edit-image-modal.tsx — Store-binding connector for the controlled EditImageModal
// in the Objects/retouch space. The modal is store-agnostic (design §2.2 "parent owns
// binding"); this thin wrapper resolves the retouch image from the snapshot store and feeds
// `illustrations` + `onUpdateIllustrations` (+ pathPrefix). Mounted only while a target image
// is selected, so the store hooks run unconditionally.

import { useCallback } from "react";
import { EditImageModal } from "@/features/editor/components/shared-components/edit-image-modal";
import type { EditToolKey } from "@/features/editor/components/shared-components/edit-image-modal";
import { useRetouchImageById, useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { Illustration } from "@/types/prop-types";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "RetouchEditImageModal");

interface RetouchEditImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spreadId: string;
  imageId: string;
  /** Per-space edit-tool availability (matrix gate). Forwarded to EditImageModal. */
  enabledTools?: EditToolKey[];
}

export function RetouchEditImageModal({
  open,
  onOpenChange,
  spreadId,
  imageId,
  enabledTools,
}: RetouchEditImageModalProps) {
  const image = useRetouchImageById(spreadId, imageId);
  const { updateRetouchImage } = useSnapshotActions();

  const handleUpdate = useCallback(
    (next: Illustration[]) => {
      log.debug("handleUpdate", "persist illustrations", { spreadId, imageId, count: next.length });
      updateRetouchImage(spreadId, imageId, { illustrations: next });
    },
    [spreadId, imageId, updateRetouchImage],
  );

  // Image deleted while modal open → parent ILS force-pop will close; render nothing meanwhile.
  if (!image) return null;

  return (
    <EditImageModal
      open={open}
      onOpenChange={onOpenChange}
      imageTitle={image.title ?? ""}
      illustrations={image.illustrations ?? []}
      mediaUrl={image.media_url ?? ""}
      onUpdateIllustrations={handleUpdate}
      pathPrefix={`retouch/${imageId}/erased`}
      enabledTools={enabledTools}
    />
  );
}
