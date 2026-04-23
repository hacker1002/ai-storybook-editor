import type { GenerateFromPromptErrorCode, SavePreviewErrorCode } from '@/apis/voice-api';

type AnyVoiceErrorCode = GenerateFromPromptErrorCode | SavePreviewErrorCode;

export const VOICE_ERROR_MESSAGES: Record<AnyVoiceErrorCode, string> = {
  // Shared / generate
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  INVALID_API_KEY: 'Lỗi xác thực dịch vụ. Liên hệ admin.',
  UNSUPPORTED_LANGUAGE:
    'Ngôn ngữ chưa hỗ trợ. Vui lòng chọn English / Tiếng Việt / 日本語 / 한국어 / 中文.',
  ELEVEN_DESIGN_FAILED: 'Không tạo được voice. Hãy thử mô tả khác.',
  ELEVEN_RATE_LIMITED: 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút.',
  ELEVEN_UPSTREAM_ERROR: 'Dịch vụ giọng nói tạm thời lỗi. Vui lòng thử lại.',
  TIMEOUT: 'Tạo voice mất quá lâu. Vui lòng thử lại.',
  CONNECTION_ERROR: 'Không kết nối được máy chủ.',
  ABORT: 'Đã huỷ yêu cầu.',
  UNKNOWN: 'Có lỗi xảy ra. Vui lòng thử lại.',
  // Save-specific
  ELEVEN_PREVIEW_EXPIRED: 'Preview đã hết hạn. Vui lòng nhấn "Regenerate".',
  ELEVEN_VOICE_LIMIT: 'Thư viện voice đã đầy. Hãy xoá voice cũ để tiếp tục.',
  AUDIO_TOO_LARGE: 'File audio quá lớn. Vui lòng generate lại.',
  ELEVEN_SAVE_FAILED: 'Không lưu được voice. Vui lòng thử lại.',
  ELEVEN_AUTH_FAILED: 'Lỗi xác thực dịch vụ. Liên hệ admin.',
  STORAGE_UPLOAD_ERROR: 'Lỗi lưu file. Vui lòng thử lại.',
  DB_INSERT_ERROR: 'Lỗi ghi cơ sở dữ liệu. Vui lòng thử lại.',
  INTERNAL_ERROR: 'Lỗi nội bộ. Vui lòng thử lại.',
};

export function mapVoiceErrorMessage(code: AnyVoiceErrorCode, fallback: string): string {
  return VOICE_ERROR_MESSAGES[code] ?? fallback;
}
