// narration-error-messages.ts — User-facing Vietnamese strings for
// narrate-script API error codes. Resolve-error mapping removed with the
// legacy @key script flow (DB-CHANGELOG §4 2026-04-28).

import type { NarrateScriptErrorCode } from '@/apis/narrate-script-api';

const API_MESSAGES: Record<NarrateScriptErrorCode, string> = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.',
  SCRIPT_PARSE_ERROR: 'Không đọc được script, vui lòng thử lại.',
  SCRIPT_TOO_LONG: 'Script vượt quá giới hạn ký tự.',
  MULTI_TURN_NOT_SUPPORTED: 'Script chỉ được chứa 1 voice.',
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

/** Map an API error code to a Vietnamese message. */
export function errorMessageFor(input: {
  errorCode: NarrateScriptErrorCode;
}): string {
  return API_MESSAGES[input.errorCode] ?? API_MESSAGES.UNKNOWN;
}
