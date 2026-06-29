// edit-image-modal-utils.ts — Pure helpers for the EditImageModal shell, kept separate
// from the component for unit testing (react-refresh/only-export-components) and DRY.
// "version" is purely a UI label over the canonical `Illustration` entry (design §2.2 —
// NO new data type); these helpers operate on `Illustration[]` directly.

import type { Illustration } from '@/types/prop-types';
import type { UpscaleModel, UpscaleImagePayload } from '@/apis/image-api';
import type { ExpandDirection, OutpaintImageParams } from '@/apis/retouch-api';
import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  type AspectRatio,
} from '@/constants/aspect-ratio-constants';
import {
  UPSCALE_MODEL_CAPS,
  REGION_MAX_DECODED_BYTES,
  OUTPAINT_IMAGE_SIZE,
} from './edit-image-modal-constants';
import { type Stroke, paintStrokesOnCtx } from './erase-stroke-engine';

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
 *  no-arg default = 'Xử lý ảnh'. Shared across all tabs (single mapping surface). */
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
      case 'GEMINI_RATE_LIMIT':
        return 'Đang quá tải, thử lại sau ít giây.';
      case 'REPLICATE_ERROR':
      case 'TIMEOUT':
      case 'NO_IMAGE_RESPONSE':
      case 'GEMINI_ERROR':
        return `${opts?.actionLabel ?? 'Xử lý ảnh'} thất bại, vui lòng thử lại.`;
      case 'SSRF_BLOCKED':
        return 'URL ảnh không hợp lệ.';
      case 'CONNECTION_ERROR':
        return 'Mất kết nối tới máy chủ — vui lòng thử lại.';
      // ── Inpaint / edit-object-image (Gemini) codes (04-inpaint-tab.md §3) ──
      case 'SAFETY_FILTER_BLOCKED':
        return 'Nội dung prompt/ảnh vi phạm policy.';
      case 'REGION_ASPECT_MISMATCH':
        return 'Tỷ lệ vùng khoanh không khớp ảnh nguồn.';
      case 'REGION_TOO_LARGE':
        return 'Ảnh quá lớn để inpaint — chọn version nhỏ hơn.';
      case 'VALIDATION_ERROR':
        return 'Ảnh vùng khoanh không hợp lệ.';
      case 'STORAGE_UPLOAD_ERROR':
        return 'Lưu ảnh thất bại, vui lòng thử lại.';
      // ── Outpaint / outpaint-image source-decode failure (05-outpaint-tab.md §3) ──
      case 'DECODE_ERROR':
        return 'Ảnh nguồn lỗi, không đọc được kích thước.';
      // Map INTERNAL_ERROR to the generic line explicitly so a raw server message never leaks.
      case 'INTERNAL_ERROR':
        return 'Đã có lỗi xảy ra, vui lòng thử lại.';
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

/** Watercolor grain options the upscale commit always sends (Phase 04). `seed` is NOT exposed
 *  in the UI → omitted → API default. The toggle's `enabled:false` turns grain off, but the FE
 *  NEVER omits the object (API omit=off; we send explicit so the contract is unambiguous). */
export interface UpscaleGrainOptions {
  enabled: boolean;
  amp: number;
  blur: number;
}

/** Pure payload shaper for the upscale commit (Validation S1 — unit-tested in isolation).
 *  ⚡ faceEnhance is sent EXPLICITLY (even false) for models that support it, so the API's
 *  default-TRUE never silently overrides a user OFF. recraft (no face-enhance field) →
 *  `params: {}` to avoid the per-model allowlist clamp (03 §3). `grain` is sent as a TOP-LEVEL
 *  explicit object on EVERY call — model-agnostic, never gated by caps (Phase 04). */
export function buildUpscalePayload(
  model: UpscaleModel,
  scale: number,
  faceEnhance: boolean,
  imageUrl: string,
  grain: UpscaleGrainOptions,
): UpscaleImagePayload {
  const caps = UPSCALE_MODEL_CAPS[model];
  const params = caps.supportsFaceEnhance ? { faceEnhance } : {};
  return { imageUrl, scale, modelParams: { model, params }, grain };
}

// ── Outpaint helpers (05-outpaint-tab.md §2/§5) ───────────────────────────────

/** Per-direction edge flags — FE mirror of the backend edge map (design §2). 1 = that edge
 *  expands by `expandRatio`. Used by BOTH the dashed preview frame AND the Compare overlay so
 *  the two never disagree (single geometry source). */
export const DIRECTION_EDGES: Record<ExpandDirection, { t: 0 | 1; r: 0 | 1; b: 0 | 1; l: 0 | 1 }> = {
  all: { t: 1, r: 1, b: 1, l: 1 },
  top: { t: 1, r: 0, b: 0, l: 0 },
  bottom: { t: 0, r: 0, b: 1, l: 0 },
  left: { t: 0, r: 0, b: 0, l: 1 },
  right: { t: 0, r: 1, b: 0, l: 0 },
  horizontal: { t: 0, r: 1, b: 0, l: 1 },
  vertical: { t: 1, r: 0, b: 1, l: 0 },
};

/** Dashed preview-frame inset (design §5.2). `box` = the scaled image box (display px @ zoom —
 *  the canvas owns it). The frame grows OUTWARD from the image on the selected edges, so the
 *  left/top offsets are negative. `expandX = r·box.w` per horizontal edge, `expandY = r·box.h`
 *  per vertical edge (per-edge percent of the ORIGINAL box — matches the backend geometry).
 *  ratio=0 → `{ left:0, top:0, width:box.w, height:box.h }` (frame coincides with the image). */
export function outpaintFrameInset(
  box: { w: number; h: number },
  direction: ExpandDirection,
  ratioPct: number,
): { left: number; top: number; width: number; height: number } {
  const r = ratioPct / 100;
  const s = DIRECTION_EDGES[direction];
  const ex = r * box.w;
  const ey = r * box.h;
  // Guard on the flag AND a non-zero expand so an unexpanded (or ratio-0) edge is a clean +0,
  // never IEEE -0 (`-ex * s.l` / `-0` would leak into style objects + break toEqual).
  return {
    left: s.l && ex ? -ex : 0,
    top: s.t && ey ? -ey : 0,
    width: box.w + ex * (s.l + s.r),
    height: box.h + ey * (s.t + s.b),
  };
}

/** Pure payload shaper for the outpaint commit (parity buildUpscalePayload — unit-tested in
 *  isolation). `imageSize` is sent explicit; `prompt` is trimmed and OMITTED when empty (server
 *  fills its own continuation prompt); `modelParams` carries model-only (omit `params` → server
 *  temperature default). */
export function buildOutpaintPayload(
  model: string,
  direction: ExpandDirection,
  ratioPct: number,
  prompt: string,
  imageUrl: string,
): OutpaintImageParams {
  const payload: OutpaintImageParams = {
    imageUrl,
    expandRatio: ratioPct,
    direction,
    imageSize: OUTPAINT_IMAGE_SIZE,
    modelParams: { model },
  };
  const trimmed = prompt.trim();
  if (trimmed) payload.prompt = trimmed;
  return payload;
}

// ── Inpaint helpers (04-inpaint-tab.md §6) ────────────────────────────────────

/** Picks the aspect-ratio enum closest to the source ratio — FE mirror of the backend
 *  `nearest_aspect_ratio` so a sent `regionAnnotation` never trips the server's
 *  REGION_ASPECT_MISMATCH guard. argmin of relative error `|opt.numeric − src| / src` over
 *  ASPECT_RATIOS (the single ratio table — DRY). Degenerate height → DEFAULT_ASPECT_RATIO. */
export function nearestAspectRatio(naturalW: number, naturalH: number): AspectRatio {
  if (naturalH <= 0 || naturalW <= 0) return DEFAULT_ASPECT_RATIO;
  const src = naturalW / naturalH;
  let best = ASPECT_RATIOS[0];
  let bestErr = Infinity;
  for (const opt of ASPECT_RATIOS) {
    const err = Math.abs(opt.numeric - src) / src;
    if (err < bestErr) {
      bestErr = err;
      best = opt;
    }
  }
  return best.value;
}

/** Pre-flight size guard (Inpaint commit): true when the composite PNG would exceed the API
 *  decoded-byte cap, so the shell aborts BEFORE the call (no 400 round-trip). A base64 string
 *  decodes to ~`length * 0.75` bytes. */
export function exceedsRegionSizeCap(base64: string): boolean {
  return base64.length * 0.75 > REGION_MAX_DECODED_BYTES;
}

/** Composite source + translucent set-of-mark at natural resolution → PNG base64 WITHOUT the
 *  `data:` prefix (the `regionAnnotation.base64Data` the API wants). The mark is rendered to an
 *  OFFSCREEN canvas at FULL alpha then drawn once with `globalAlpha = markAlpha`, so overlapping
 *  strokes don't darken-stack (≠ eraser's direct destination-out). `brushScale` rescales the
 *  display-px brush radius up to natural-res. Throws if the source taints the canvas (CORS) —
 *  the message carries "tainted/CORS" so mapEditError surfaces the right toast.
 *  Manual-smoke only (jsdom has no real 2d context). */
export function compositeMark(
  sourceImg: HTMLImageElement,
  strokes: Stroke[],
  markColor: string,
  markAlpha: number,
  naturalW: number,
  naturalH: number,
  displayW: number,
  displayH: number,
): string {
  const base = document.createElement('canvas');
  base.width = naturalW;
  base.height = naturalH;
  const baseCtx = base.getContext('2d');
  if (!baseCtx) throw new Error('Could not get 2D context');
  baseCtx.drawImage(sourceImg, 0, 0, naturalW, naturalH);

  const mark = document.createElement('canvas');
  mark.width = naturalW;
  mark.height = naturalH;
  const markCtx = mark.getContext('2d');
  if (!markCtx) throw new Error('Could not get 2D context');

  // Force mark color + paint mode regardless of stroke provenance (compositeMark owns the look).
  const markStrokes: Stroke[] = strokes.map((s) => ({ ...s, color: markColor, mode: 'paint' }));
  const brushScale = (naturalW / displayW + naturalH / displayH) / 2;
  paintStrokesOnCtx(markCtx, markStrokes, null, naturalW, naturalH, brushScale, true);

  baseCtx.globalAlpha = markAlpha;
  baseCtx.drawImage(mark, 0, 0);
  baseCtx.globalAlpha = 1;

  // toDataURL throws on a CORS-tainted canvas — surfaced by mapEditError's CORS branch.
  const dataUrl = base.toDataURL('image/png');
  return dataUrl.split(',')[1] ?? '';
}

// NOTE: the design §2.5 ⚡I editable-focus guard for the `c`/`C` Compare hotkey is NOT
// implemented here — the ILS `onHotkey(key)` signature carries no event target, and the
// InteractionLayerProvider already suppresses non-Escape hotkeys while an editable element
// is focused. So no `isEditableTarget` helper is needed.
