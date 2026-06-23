// edit-image-modal-utils.ts — Pure helpers for the EditImageModal shell, kept separate
// from the component for unit testing (react-refresh/only-export-components) and DRY.
// "version" is purely a UI label over the canonical `Illustration` entry (design §2.2 —
// NO new data type); these helpers operate on `Illustration[]` directly.

import type { Illustration } from '@/types/prop-types';
import type { UpscaleModel, UpscaleImagePayload } from '@/apis/image-api';
import { UPSCALE_MODEL_CAPS } from './edit-image-modal-constants';

/** Carries the API failure's errorCode/httpStatus through a thrown Error so the shell's
 *  catch can map it via `mapEditError` (single mapping surface). Tabs throw this for API
 *  failures; client-side issues (e.g. canvas CORS taint) throw a plain Error. */
export class EditApiError extends Error {
  readonly errorCode?: string;
  readonly httpStatus?: number;

  constructor(message: string, opts?: { errorCode?: string; httpStatus?: number }) {
    super(message);
    this.name = 'EditApiError';
    this.errorCode = opts?.errorCode;
    this.httpStatus = opts?.httpStatus;
  }
}

/** ISO-8601 timestamp for new version entries. Isolated so tests can spy if needed. */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Display-only fallback version when `illustrations[]` is empty (sketch-phase image with
 *  only `media_url`). NOT written to the store on open (design §2.4 override — Validation
 *  S1); the first commit persists a real version. `type='created'` (no edit provenance). */
export function versionFromMediaUrl(mediaUrl: string): Illustration {
  return {
    media_url: mediaUrl,
    created_time: nowISO(),
    is_selected: true,
    type: 'created',
  };
}

/** Single writer of `illustrations[]` (design §2.2). Prepends the committed result as a
 *  new selected `type='edited'` entry carrying `original_url` (the immediate-prior source
 *  → feeds Compare), and deselects every existing entry. Returns a fresh array; the shell
 *  hands it to `onUpdateIllustrations` (parent persists). */
export function prependVersion(
  versions: Illustration[],
  mediaUrl: string,
  originalUrl: string,
): Illustration[] {
  const newEntry: Illustration = {
    type: 'edited',
    original_url: originalUrl,
    media_url: mediaUrl,
    created_time: nowISO(),
    is_selected: true,
  };
  return [newEntry, ...versions.map((v) => ({ ...v, is_selected: false }))];
}

/** Maps a thrown commit error → user-facing toast message (design 01/03 §3 error tables).
 *  Prefers the typed `EditApiError.errorCode`; falls back to CORS detection on plain
 *  Errors, then the raw message, then a generic message. Never surfaces internals.
 *  ⚡ Tab-aware (Validation S1): `opts.actionLabel` (e.g. 'Remove background' / 'Upscale') is
 *  threaded by the shell so the generic REPLICATE_ERROR/TIMEOUT wording names the active tool;
 *  no-arg default = 'Xử lý ảnh'. Shared across all 3 tabs (single mapping surface). */
export function mapEditError(err: unknown, opts?: { actionLabel?: string }): string {
  const code = err instanceof EditApiError ? err.errorCode : undefined;
  if (code) {
    switch (code) {
      case 'UNSUPPORTED_MODEL':
        return 'Model không hỗ trợ.';
      case 'IMAGE_FETCH_ERROR':
        return 'Không tải được ảnh nguồn.';
      case 'INPUT_TOO_LARGE_FOR_MODEL':
        return 'Ảnh quá lớn để upscale — giảm scale hoặc chọn ảnh nhỏ hơn.';
      case 'OUTPUT_FETCH_ERROR':
        return 'Ảnh kết quả quá lớn — giảm scale.';
      case 'REPLICATE_RATE_LIMIT':
        return 'Đang quá tải, thử lại sau ít giây.';
      case 'REPLICATE_ERROR':
      case 'TIMEOUT':
        return `${opts?.actionLabel ?? 'Xử lý ảnh'} thất bại, vui lòng thử lại.`;
      case 'SSRF_BLOCKED':
        return 'URL ảnh không hợp lệ.';
      case 'CONNECTION_ERROR':
        return 'Mất kết nối tới máy chủ — vui lòng thử lại.';
      default:
        break;
    }
  }
  if (err instanceof Error) {
    if (/tainted|CORS/i.test(err.message)) {
      return 'Không export được ảnh (CORS) — kiểm tra cấu hình CORS của bucket.';
    }
    if (err.message) return err.message;
  }
  return 'Đã có lỗi xảy ra, vui lòng thử lại.';
}

/** Pure payload shaper for the upscale commit (Validation S1 — unit-tested in isolation).
 *  ⚡ faceEnhance is sent EXPLICITLY (even false) for models that support it, so the API's
 *  default-TRUE never silently overrides a user OFF. recraft (no face-enhance field) →
 *  `params: {}` to avoid the per-model allowlist clamp (03 §3). */
export function buildUpscalePayload(
  model: UpscaleModel,
  scale: number,
  faceEnhance: boolean,
  imageUrl: string,
): UpscaleImagePayload {
  const caps = UPSCALE_MODEL_CAPS[model];
  const params = caps.supportsFaceEnhance ? { faceEnhance } : {};
  return { imageUrl, scale, modelParams: { model, params } };
}

// NOTE: the design §2.5 ⚡I editable-focus guard for the `c`/`C` Compare hotkey is NOT
// implemented here — the ILS `onHotkey(key)` signature carries no event target, and the
// InteractionLayerProvider already suppresses non-Escape hotkeys while an editable element
// is focused. So no `isEditableTarget` helper is needed.
