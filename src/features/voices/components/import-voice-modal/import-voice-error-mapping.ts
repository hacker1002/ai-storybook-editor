import type { GetFromElevenIdErrorCode } from '@/apis/voice-api';

// Fetch-phase errors (API GET /api/voice/get-from-eleven-id)
// Messages kept in English verbatim per design spec 06-import-voice-modal.md.
export const IMPORT_FETCH_ERROR_MESSAGES: Record<GetFromElevenIdErrorCode, string> = {
  VALIDATION_ERROR:       'Invalid ID format.',
  INVALID_API_KEY:        'Service authentication error. Contact admin.',
  ELEVEN_VOICE_NOT_FOUND: 'Voice not found on ElevenLabs. Check the ID.',
  ELEVEN_AUTH_FAILED:     'Configuration issue. Contact admin.',
  ELEVEN_RATE_LIMITED:    'Too many requests. Try again shortly.',
  ELEVEN_UPSTREAM_ERROR:  'ElevenLabs temporarily unavailable. Try again.',
  TIMEOUT:                'Request timed out. Try again.',
  CONNECTION_ERROR:       'Unable to reach the server. Please try again.',
  ABORT:                  '',
  UNKNOWN:                'Something went wrong. Please try again.',
};

export function mapGetFromElevenIdMessage(
  code: GetFromElevenIdErrorCode,
  fallback: string
): string {
  return IMPORT_FETCH_ERROR_MESSAGES[code] || fallback;
}

// Insert-phase messages — generic only (no duplicate detection per Validation S1).
export const IMPORT_INSERT_ERROR_MESSAGES = {
  GENERIC_FAILURE:  'Failed to import voice. Please try again.',
  LANGUAGE_MISSING: 'Please select a language before importing.',
} as const;
