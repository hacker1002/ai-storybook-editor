import type { GenerateMusicErrorCode } from '@/apis/music-api';

const MESSAGES: Record<GenerateMusicErrorCode, string> = {
  VALIDATION_ERROR: 'Invalid input.',
  INVALID_API_KEY: 'Service unavailable. Please try later.',
  ELEVEN_CONTENT_REJECTED: "Couldn't generate music. Try a different prompt.",
  ELEVEN_DURATION_OUT_OF_RANGE: 'Duration must be 3-600 seconds.',
  ELEVEN_PAYMENT_REQUIRED: 'Service quota exhausted. Please try later.',
  ELEVEN_GENERATE_FAILED: 'Generation failed. Try again.',
  ELEVEN_RATE_LIMITED: 'Too many requests. Wait a minute.',
  ELEVEN_AUTH_FAILED: 'Service unavailable. Please try later.',
  STORAGE_UPLOAD_ERROR: "Couldn't save music. Try again.",
  TIMEOUT: 'Generation took too long. Try again.',
  CONNECTION_ERROR: 'Connection error. Check your network.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export function mapGenerateMusicErrorMessage(
  code: GenerateMusicErrorCode,
  fallback?: string,
): string {
  if (code === 'VALIDATION_ERROR' && fallback) return fallback;
  return MESSAGES[code] ?? fallback ?? MESSAGES.UNKNOWN;
}
