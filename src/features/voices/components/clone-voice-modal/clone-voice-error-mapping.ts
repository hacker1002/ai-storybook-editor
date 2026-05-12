import type { CloneFromHumanErrorCode } from '@/apis/voice-api';

export interface CloneVoiceErrorPresentation {
  message: string;
  linkTo?: string;
  linkLabel?: string;
}

const STATIC_MESSAGES: Record<CloneFromHumanErrorCode, string> = {
  VALIDATION_ERROR: 'Invalid input. Please check the form and retry.',
  INVALID_RECORD_URL: 'Audio source is invalid. Refresh Human library and retry.',
  INVALID_API_KEY: 'Service authentication error. Contact admin.',
  SOURCE_AUDIO_NOT_FOUND: 'Audio source no longer available. Refresh Human library.',
  AUDIO_TOO_LARGE: 'Voice recording too large (>10MB). Use a shorter recording.',
  INVALID_AUDIO_FORMAT: 'Voice recording format not supported. Use MP3, WAV, M4A, or OGG.',
  UNSUPPORTED_LANGUAGE:
    'Language not supported. Try English / Vietnamese / Japanese / Korean / Chinese.',
  ELEVEN_IVC_FAILED:
    "Couldn't clone voice. The recording may be too short, too quiet, or contain no speech.",
  ELEVEN_VOICE_LIMIT: 'Voice library full. Delete an existing voice to continue.',
  ELEVEN_RATE_LIMITED: 'Too many requests. Please wait a minute.',
  ELEVEN_AUTH_FAILED: 'Configuration issue. Contact admin.',
  ELEVEN_TTS_PREVIEW_FAILED: 'Voice cloned but preview render failed. Please retry.',
  ELEVEN_UPSTREAM_ERROR: 'ElevenLabs temporarily unavailable. Try again.',
  STORAGE_UPLOAD_ERROR: 'Failed to save preview. Please try again.',
  DB_INSERT_ERROR: 'Failed to save voice. Please try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  TIMEOUT: 'Cloning took too long. Try again with a shorter recording.',
  CONNECTION_ERROR: 'Could not connect to the server.',
  ABORT: '',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export function mapCloneVoiceError(
  code: CloneFromHumanErrorCode,
  fallback: string,
  context: { humanId: string | null; serverMessage?: string }
): CloneVoiceErrorPresentation {
  let base = STATIC_MESSAGES[code] || fallback;

  // Preserve BE message when ElevenLabs IVC rejects audio (too short / quiet / no speech).
  if (code === 'ELEVEN_IVC_FAILED' && context.serverMessage) {
    base = `Couldn't clone voice — ${context.serverMessage}`;
  }

  if (code === 'SOURCE_AUDIO_NOT_FOUND' && context.humanId) {
    return {
      message: base,
      linkTo: `/humans/${context.humanId}`,
      linkLabel: 'Open Human detail →',
    };
  }

  if (code === 'ELEVEN_VOICE_LIMIT') {
    return {
      message: base,
      linkTo: '/voices',
      linkLabel: 'Manage existing voices →',
    };
  }

  return { message: base };
}
