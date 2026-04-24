// narration-error-messages.ts — User-facing Vietnamese strings for both client
// resolve errors (ResolveError) and server-returned narrate-script error codes
// (NarrateScriptErrorCode).

import type { NarrateScriptErrorCode } from '@/apis/narrate-script-api';
import type { ResolveError, ResolveReason } from './script-resolver';

/** Union accepted by `errorMessageFor`. */
export type NarrationErrorInput =
  | ResolveError
  | { errorCode: NarrateScriptErrorCode; speakerKey?: never };

function isResolveError(err: NarrationErrorInput): err is ResolveError {
  return 'reason' in err && typeof err.reason === 'string';
}

const RESOLVE_MESSAGES: Record<ResolveReason, (speakerKey: string) => string> = {
  unknown_key: (key) =>
    `Speaker '@${key}' không tồn tại. Dùng @narrator hoặc một character key.`,
  narrator_no_voice_for_lang: () =>
    `Narrator chưa gán giọng cho ngôn ngữ hiện tại. Vào Narrator Settings để cấu hình.`,
  character_no_voice_setting: (key) =>
    `Character '@${key}' chưa có giọng. Mở character để set voice.`,
  voice_deleted: (key) =>
    `Giọng của '@${key}' đã bị xóa. Gán lại voice.`,
};

const API_MESSAGES: Record<NarrateScriptErrorCode, string> = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.',
  SCRIPT_PARSE_ERROR: 'Không đọc được script, vui lòng thử lại.',
  SCRIPT_TOO_LONG: 'Script vượt quá 2000 ký tự sau khi resolve.',
  INVALID_VOICE_ID: 'Mã giọng đọc không hợp lệ.',
  INVALID_API_KEY: 'Sai cấu hình API key, liên hệ hỗ trợ.',
  ELEVEN_VOICE_NOT_FOUND: 'Giọng đọc không tồn tại, vui lòng chọn giọng khác.',
  ELEVEN_CONTENT_REJECTED:
    'Nội dung bị từ chối bởi bộ lọc an toàn, vui lòng thử nội dung khác.',
  ELEVEN_RATE_LIMITED: 'ElevenLabs quá tải. Thử lại sau ít phút.',
  ELEVEN_UPSTREAM_ERROR: 'Dịch vụ giọng đọc đang lỗi, vui lòng thử lại.',
  ELEVEN_AUTH_FAILED: 'Lỗi xác thực dịch vụ giọng đọc, liên hệ hỗ trợ.',
  STORAGE_UPLOAD_ERROR: 'Không lưu được audio, vui lòng thử lại.',
  TIMEOUT: 'Quá thời gian xử lý, vui lòng thử lại.',
  CONNECTION_ERROR: 'Mất kết nối, kiểm tra mạng.',
  ABORT: 'Đã huỷ yêu cầu.',
  INTERNAL_ERROR: 'Lỗi hệ thống, vui lòng thử lại.',
  UNKNOWN: 'Generate thất bại. Thử lại hoặc kiểm tra kết nối.',
};

/** Map either a resolve error or an API error code to a Vietnamese message. */
export function errorMessageFor(err: NarrationErrorInput): string {
  if (isResolveError(err)) {
    const builder = RESOLVE_MESSAGES[err.reason];
    return builder(err.speakerKey);
  }
  return API_MESSAGES[err.errorCode] ?? API_MESSAGES.UNKNOWN;
}
