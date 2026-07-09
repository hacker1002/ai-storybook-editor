// retouch-edit-image-modal.tsx — Store-binding connector for the controlled EditImageModal
// in the Objects/retouch space. The modal is store-agnostic (design §2.2 "parent owns
// binding"); this thin wrapper resolves the retouch image from the snapshot store and feeds
// `illustrations` + `onUpdateIllustrations` (+ pathPrefix). Mounted only while a target image
// is selected, so the store hooks run unconditionally.
//
// Collab (ADR-044): `onUpdateIllustrations` is the SINGLE seam for BOTH a commit (new edited
// version prepended) AND a version-switch (is_selected flip) — the modal routes both through this
// one prop. So wiring the per-resource gateway save in `handleUpdate` covers every retouch write.

import { useCallback } from "react";
import { EditImageModal } from "@/features/editor/components/shared-components/edit-image-modal";
import type { EditToolKey } from "@/features/editor/components/shared-components/edit-image-modal";
import { useRetouchImageById, useSnapshotActions, findRetouchImageNode } from "@/stores/snapshot-store/selectors";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { useResourceLockStore } from "@/stores/resource-lock-store";
import {
  saveImageResourceUnderLock,
  resolveImageLockTarget,
  resolveLockHolderName,
} from "@/stores/snapshot-store/slices/collab-image-save-helper";
import { toastLockedByOther, toastForbiddenIllustration } from "@/utils/collab-save-toasts";
import type { Illustration } from "@/types/prop-types";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "RetouchEditImageModal");

// crud audit enum (SavePayload.action_type): a retouch commit / version-switch is an EDIT (3).
const ACTION_TYPE_EDIT = 3 as const;

/**
 * collab per-resource save (ADR-044): AFTER the local optimistic `updateRetouchImage` (isDirty),
 * patch the SAME retouch image node through the gateway under a PER-COMMIT lock (acquire → save →
 * release each commit; NOT held across the modal session). NO-OP under the solo path
 * (collabPersist=false) — the whole-doc autosave owns persistence there, so the solo path stays
 * byte-identical.
 *
 * Module-level (not a hook) so the `handleUpdate` callback stays stable. Fire-and-forget from the
 * caller (`void …`); never throws (the helper is self-guarded). The node is read FRESH via
 * `useSnapshotStore.getState()` at call time (never a render-time closure var) to avoid a
 * stale-closure write. DORMANT until the objects space is flipped collab-on (P04 defer).
 */
async function persistRetouchCollab(spreadId: string, imageId: string): Promise<void> {
  const collab = useResourceLockStore.getState().collabPersist;
  if (!collab) {
    log.debug("persistRetouchCollab", "solo path — whole-doc autosave owns persistence", { imageId });
    return; // solo path UNCHANGED
  }

  const imageNode = findRetouchImageNode(useSnapshotStore.getState(), spreadId, imageId) ?? null;
  if (!imageNode) {
    log.warn("persistRetouchCollab", "node missing at save time — skip gateway save", { imageId });
    return; // deleted mid-flight → bail
  }

  const target = resolveImageLockTarget("retouch_image", spreadId, imageId); // { step:2, rtype:1, id:imageId }
  log.info("persistRetouchCollab", "collab save", { imageId, resourceType: target.resource_type });
  const outcome = await saveImageResourceUnderLock(target, imageNode, ACTION_TYPE_EDIT, {
    spread_id: spreadId,
    kind: "image",
  });

  if (outcome === "skipped") {
    log.info("persistRetouchCollab", "skipped — locked by another editor", { imageId });
    toastLockedByOther(resolveLockHolderName(target));
  } else if (outcome === "forbidden") {
    // Retouch-only collaborator lacks illustration access (step=2 access-gate) — surface, don't crash.
    log.warn("persistRetouchCollab", "forbidden — missing illustration access", { imageId, outcome });
    toastForbiddenIllustration();
  } else if (outcome === "failed") {
    log.warn("persistRetouchCollab", "collab save failed", { imageId, outcome });
  }
}

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
      // collab: persist the freshly-mutated node under a per-commit lock (no-op solo). Covers BOTH
      // commit and version-switch — the modal routes both through onUpdateIllustrations.
      void persistRetouchCollab(spreadId, imageId);
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
