// narrator-error-messages.ts — Map narrate-script API error codes to
// user-facing Vietnamese strings for the narrator preview UI.

import type { NarrateScriptErrorCode } from '@/apis/narrate-script-api';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'NarratorErrorMessages');

const MESSAGES: Record<NarrateScriptErrorCode, string> = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.',
  SCRIPT_PARSE_ERROR: 'Không đọc được script, vui lòng thử lại.',
  SCRIPT_TOO_LONG: 'Nội dung preview quá dài, vui lòng rút gọn.',
  INVALID_VOICE_ID: 'Mã giọng đọc không hợp lệ.',
  INVALID_API_KEY: 'Sai cấu hình API key, liên hệ hỗ trợ.',
  ELEVEN_VOICE_NOT_FOUND: 'Giọng đọc không tồn tại, vui lòng chọn giọng khác.',
  ELEVEN_CONTENT_REJECTED:
    'Nội dung bị từ chối bởi bộ lọc an toàn, vui lòng thử nội dung khác.',
  ELEVEN_RATE_LIMITED: 'Quá tải, thử lại sau ít phút.',
  ELEVEN_UPSTREAM_ERROR: 'Dịch vụ giọng đọc đang lỗi, vui lòng thử lại.',
  ELEVEN_AUTH_FAILED: 'Lỗi xác thực dịch vụ giọng đọc, liên hệ hỗ trợ.',
  STORAGE_UPLOAD_ERROR: 'Không lưu được audio, vui lòng thử lại.',
  TIMEOUT: 'Quá thời gian xử lý, vui lòng thử lại.',
  CONNECTION_ERROR: 'Mất kết nối, kiểm tra mạng.',
  ABORT: 'Đã huỷ yêu cầu.',
  INTERNAL_ERROR: 'Lỗi hệ thống, vui lòng thử lại.',
  UNKNOWN: 'Không tạo được audio preview, vui lòng thử lại.',
};

export function getNarratorErrorMessage(code: NarrateScriptErrorCode): string {
  const message = MESSAGES[code];
  if (!message) {
    log.warn('getNarratorErrorMessage', 'unknown error code, falling back', { code });
    return MESSAGES.UNKNOWN;
  }
  return message;
}
