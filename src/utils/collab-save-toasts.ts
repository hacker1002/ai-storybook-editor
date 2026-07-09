// collab-save-toasts.ts — Shared toast UX for per-resource collab saves (ADR-044).
//
// The collab save helper (`collab-image-save-helper.ts`) is toast-FREE by design: the caller owns
// the UX on a non-'saved' outcome. These helpers centralize the shared wording so the illustration
// image-task path AND the retouch modal render the SAME message for the SAME outcome (DRY).

import { toast } from 'sonner';

/** A save was SKIPPED because another editor holds the lock (acquire 409). `holder` = the other
 *  editor's display name (from `resolveLockHolderName`). */
export function toastLockedByOther(holder: string): void {
  toast.info(`${holder} is editing — your change was not saved.`);
}

/** A save was FORBIDDEN (gateway 403): a retouch-only collaborator lacks illustration access, so a
 *  step=2 illustration/retouch node save is denied. Graceful — no permission detail is exposed. */
export function toastForbiddenIllustration(): void {
  toast.error('Bạn cần quyền chỉnh sửa illustration để lưu thay đổi này.');
}
