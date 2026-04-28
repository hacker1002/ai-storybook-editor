// combine-error-messages.ts — User-facing Vietnamese strings for
// combine-audio-chunks API error codes. Kept separate from
// narration-error-messages.ts because the error code sets diverge.

import type { CombineAudioChunksErrorCode } from '@/apis/combine-audio-chunks-api';

const API_MESSAGES: Record<CombineAudioChunksErrorCode, string> = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.',
  // Defensive — FE phải shortcut khi length === 1; thấy mã này là bug FE.
  INSUFFICIENT_CHUNKS: 'Cần ít nhất 2 chunk để combine.',
  SCRIPT_TOO_LONG: 'Script vượt quá giới hạn ký tự.',
  WORD_TIMING_INVALID: 'Word timing không hợp lệ — vui lòng regenerate chunk.',
  INVALID_API_KEY: 'Sai cấu hình API key, liên hệ hỗ trợ.',
  CHUNK_FETCH_FAILED: 'Không tải được audio chunk. Thử lại.',
  CHUNK_FETCH_FORBIDDEN: 'Audio source không hợp lệ.',
  AUDIO_DECODE_ERROR:
    'Audio chunk bị hỏng — vui lòng regenerate chunk trước khi combine.',
  FFMPEG_ERROR: 'Combine thất bại. Vui lòng thử lại.',
  STORAGE_UPLOAD_ERROR: 'Không lưu được audio combined, vui lòng thử lại.',
  TIMEOUT: 'Combine quá lâu, vui lòng thử lại.',
  CONNECTION_ERROR: 'Mất kết nối, kiểm tra mạng.',
  ABORT: 'Đã huỷ yêu cầu.',
  INTERNAL_ERROR: 'Lỗi hệ thống, vui lòng thử lại.',
  UNKNOWN: 'Combine thất bại. Thử lại hoặc kiểm tra kết nối.',
};

/** Map a combine-audio-chunks API error code to a Vietnamese message. */
export function combineErrorMessageFor(input: {
  errorCode: CombineAudioChunksErrorCode;
}): string {
  return API_MESSAGES[input.errorCode] ?? API_MESSAGES.UNKNOWN;
}
