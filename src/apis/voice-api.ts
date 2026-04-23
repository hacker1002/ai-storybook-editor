import { createLogger } from '@/utils/logger';

const logGenerate = createLogger('VoiceApi', 'callGenerateFromPrompt');
const logSave = createLogger('VoiceApi', 'callSavePreview');
const logGet = createLogger('VoiceApi', 'callGetFromElevenId');

const imageApiBaseUrl = import.meta.env.VITE_IMAGE_API_BASE_URL as string;
const imageApiKey = import.meta.env.VITE_IMAGE_API_KEY as string;

// ───────────────────────── Generate from prompt ─────────────────────────

export interface GenerateFromPromptParams {
  description: string;
  gender: 0 | 1;
  age: 0 | 1 | 2;
  language: string;
  accent: string;
  loudness?: number;
  guidance?: number;
  seed?: number;
}

export interface PreviewCandidate {
  generatedVoiceId: string;
  audioBase64: string;
  mediaType: 'audio/mpeg';
  durationSecs: number;
}

export interface GenerateFromPromptMeta {
  processingTimeMs?: number;
  elevenDesignMs?: number;
  modelId?: string;
  seed?: number;
}

export interface GenerateFromPromptSuccess {
  success: true;
  data: { previewText: string; previews: PreviewCandidate[] };
  meta?: GenerateFromPromptMeta;
}

export type GenerateFromPromptErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_API_KEY'
  | 'UNSUPPORTED_LANGUAGE'
  | 'ELEVEN_DESIGN_FAILED'
  | 'ELEVEN_RATE_LIMITED'
  | 'ELEVEN_UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'ABORT'
  | 'UNKNOWN';

export interface GenerateFromPromptFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode: GenerateFromPromptErrorCode;
}

export type GenerateFromPromptResult = GenerateFromPromptSuccess | GenerateFromPromptFailure;

// ───────────────────────── Save preview ─────────────────────────

export interface SavePreviewParams {
  generatedVoiceId: string;
  audioBase64: string;
  rejectedGeneratedVoiceIds?: string[];
  name: string;
  description: string;
  gender: 0 | 1;
  age: 0 | 1 | 2;
  language: string;
  accent: string;
  tags?: string;
  loudness?: number;
  guidance?: number;
}

// Full voice DTO returned from BE. camelCase per API 03 spec; snake_case fallback handled at modal layer.
export interface SavePreviewVoiceDTO {
  id: string;
  name: string;
  gender: 0 | 1;
  age: 0 | 1 | 2;
  language: string;
  accent: string;
  description: string | null;
  model: string;
  elevenId: string;
  tags: string | null;
  type: 0;
  previewAudioUrl: string;
  sampleAudioUrl: string | null;
  loudness: number | null;
  guidance: number | null;
  createdAt?: string; // BE prerequisite — may be absent; fallback at modal layer
}

export interface SavePreviewSuccess {
  success: true;
  data: {
    voiceId: string;
    elevenId: string;
    previewAudioUrl: string;
    voice: SavePreviewVoiceDTO;
  };
  meta?: Record<string, number>;
}

export type SavePreviewErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_API_KEY'
  | 'ELEVEN_PREVIEW_EXPIRED'
  | 'ELEVEN_VOICE_LIMIT'
  | 'AUDIO_TOO_LARGE'
  | 'ELEVEN_SAVE_FAILED'
  | 'ELEVEN_RATE_LIMITED'
  | 'ELEVEN_AUTH_FAILED'
  | 'STORAGE_UPLOAD_ERROR'
  | 'DB_INSERT_ERROR'
  | 'INTERNAL_ERROR'
  | 'ELEVEN_UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'ABORT'
  | 'UNKNOWN';

export interface SavePreviewFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode: SavePreviewErrorCode;
}

export type SavePreviewResult = SavePreviewSuccess | SavePreviewFailure;

// ───────────────────────── Get from ElevenLabs voice ID (read-only proxy) ─────────────────────────

export interface GetFromElevenIdData {
  elevenId: string;
  name: string;
  gender: 0 | 1 | null;
  age: 0 | 1 | 2 | null;
  language: string | null;
  accent: string;
  description: string | null;
  tags: string | null;
  previewAudioUrl: string | null;
}

export interface GetFromElevenIdMeta {
  processingTimeMs?: number;
  elevenFetchMs?: number;
  cacheHit?: boolean;
}

export interface GetFromElevenIdSuccess {
  success: true;
  data: GetFromElevenIdData;
  meta?: GetFromElevenIdMeta;
}

export type GetFromElevenIdErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_API_KEY'
  | 'ELEVEN_VOICE_NOT_FOUND'
  | 'ELEVEN_AUTH_FAILED'
  | 'ELEVEN_RATE_LIMITED'
  | 'ELEVEN_UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'ABORT'
  | 'UNKNOWN';

export interface GetFromElevenIdFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode: GetFromElevenIdErrorCode;
}

export type GetFromElevenIdResult = GetFromElevenIdSuccess | GetFromElevenIdFailure;

export interface VoiceApiCallOptions {
  signal?: AbortSignal;
}

// ───────────────────────── helpers ─────────────────────────

function generateFailure(
  errorCode: GenerateFromPromptErrorCode,
  error: string,
  httpStatus = 0
): GenerateFromPromptFailure {
  return { success: false, error, httpStatus, errorCode };
}

function saveFailure(
  errorCode: SavePreviewErrorCode,
  error: string,
  httpStatus = 0
): SavePreviewFailure {
  return { success: false, error, httpStatus, errorCode };
}

function mapGenerateErrorCode(code: string | undefined): GenerateFromPromptErrorCode {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_API_KEY':
    case 'UNSUPPORTED_LANGUAGE':
    case 'ELEVEN_DESIGN_FAILED':
    case 'ELEVEN_RATE_LIMITED':
    case 'ELEVEN_UPSTREAM_ERROR':
    case 'TIMEOUT':
      return code;
    default:
      return 'UNKNOWN';
  }
}

function mapSaveErrorCode(code: string | undefined): SavePreviewErrorCode {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_API_KEY':
    case 'ELEVEN_PREVIEW_EXPIRED':
    case 'ELEVEN_VOICE_LIMIT':
    case 'AUDIO_TOO_LARGE':
    case 'ELEVEN_SAVE_FAILED':
    case 'ELEVEN_RATE_LIMITED':
    case 'ELEVEN_AUTH_FAILED':
    case 'STORAGE_UPLOAD_ERROR':
    case 'DB_INSERT_ERROR':
    case 'INTERNAL_ERROR':
    case 'ELEVEN_UPSTREAM_ERROR':
    case 'TIMEOUT':
      return code;
    default:
      return 'UNKNOWN';
  }
}

async function extractErrorInfo(
  response: Response
): Promise<{ message: string; errorCode?: string }> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    const detailError = typeof detail === 'object' && detail !== null ? detail.error : undefined;

    const errorCode: string | undefined =
      (typeof detailError === 'object' && detailError !== null ? detailError.code : undefined) ??
      (typeof body?.error === 'object' && body.error !== null ? body.error.code : undefined);

    const message: string =
      (typeof detailError === 'object' &&
      detailError !== null &&
      typeof detailError.message === 'string'
        ? detailError.message
        : null) ??
      (typeof detail === 'string' ? detail : null) ??
      (typeof body?.error === 'object' && body.error !== null
        ? (body.error.message ?? JSON.stringify(body.error))
        : null) ??
      (typeof body?.error === 'string' ? body.error : null) ??
      body?.message ??
      `HTTP ${response.status}`;

    return { message: String(message), errorCode };
  } catch {
    return { message: `HTTP ${response.status} ${response.statusText}` };
  }
}

// ───────────────────────── callGenerateFromPrompt ─────────────────────────

const GENERATE_PATH = '/api/voice/generate-from-prompt';

export async function callGenerateFromPrompt(
  params: GenerateFromPromptParams,
  options?: VoiceApiCallOptions
): Promise<GenerateFromPromptResult> {
  if (!params.description || params.description.length < 20) {
    return generateFailure('VALIDATION_ERROR', 'Mô tả phải ≥ 20 ký tự');
  }
  if (!params.language) {
    return generateFailure('VALIDATION_ERROR', 'Thiếu language');
  }
  if (!params.accent) {
    return generateFailure('VALIDATION_ERROR', 'Thiếu accent');
  }

  const url = `${imageApiBaseUrl}${GENERATE_PATH}`;

  logGenerate.info('callGenerateFromPrompt', 'start', {
    descriptionLength: params.description.length,
    language: params.language,
    gender: params.gender,
    age: params.age,
    hasSeed: params.seed !== undefined,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': imageApiKey,
      },
      body: JSON.stringify(params),
      signal: options?.signal,
    });

    if (options?.signal?.aborted) {
      return generateFailure('ABORT', 'Request aborted', 0);
    }

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(response);
      logGenerate.error('callGenerateFromPrompt', 'http error', {
        httpStatus: response.status,
        errorCode,
      });
      return {
        success: false,
        error: message,
        httpStatus: response.status,
        errorCode: mapGenerateErrorCode(errorCode),
      };
    }

    const body = (await response.json()) as {
      success?: boolean;
      data?: { previewText?: string; previews?: PreviewCandidate[] };
      meta?: GenerateFromPromptMeta;
      error?: string;
    };

    if (body.success === false) {
      logGenerate.error('callGenerateFromPrompt', 'server returned success=false', {
        error: body.error,
      });
      return generateFailure('UNKNOWN', body.error || 'Server returned success=false', response.status);
    }

    const previews = body.data?.previews;
    const previewText = body.data?.previewText ?? '';

    if (!Array.isArray(previews) || previews.length === 0) {
      logGenerate.error('callGenerateFromPrompt', 'malformed response', {});
      return generateFailure('UNKNOWN', 'Response thiếu previews', response.status);
    }

    logGenerate.info('callGenerateFromPrompt', 'success', {
      previewCount: previews.length,
      processingTimeMs: body.meta?.processingTimeMs,
    });

    return {
      success: true,
      data: { previewText, previews },
      meta: body.meta,
    };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || options?.signal?.aborted) {
      logGenerate.info('callGenerateFromPrompt', 'aborted');
      return generateFailure('ABORT', 'Request aborted', 0);
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError) {
      logGenerate.error('callGenerateFromPrompt', 'connection error', {
        msg: rawMessage.slice(0, 100),
      });
      return generateFailure(
        'CONNECTION_ERROR',
        `Không kết nối được máy chủ (${rawMessage}). Vui lòng thử lại.`,
        0
      );
    }
    logGenerate.error('callGenerateFromPrompt', 'unknown error', {
      name,
      msg: rawMessage.slice(0, 100),
    });
    return generateFailure('UNKNOWN', rawMessage || 'Unknown error', 0);
  }
}

// ───────────────────────── callSavePreview ─────────────────────────

const SAVE_PATH = '/api/voice/save-preview';
const GENERATED_ID_PATTERN = /^[A-Za-z0-9_-]{10,80}$/;

export async function callSavePreview(
  params: SavePreviewParams,
  options?: VoiceApiCallOptions
): Promise<SavePreviewResult> {
  if (!GENERATED_ID_PATTERN.test(params.generatedVoiceId)) {
    return saveFailure('VALIDATION_ERROR', 'generatedVoiceId không hợp lệ');
  }
  if (!params.audioBase64) {
    return saveFailure('VALIDATION_ERROR', 'Thiếu audioBase64');
  }
  const trimmedName = params.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    return saveFailure('VALIDATION_ERROR', 'Tên 1-80 ký tự');
  }
  if (!params.language || !params.accent) {
    return saveFailure('VALIDATION_ERROR', 'Thiếu language/accent');
  }

  const url = `${imageApiBaseUrl}${SAVE_PATH}`;

  logSave.info('callSavePreview', 'start', {
    language: params.language,
    gender: params.gender,
    age: params.age,
    audioBase64Length: params.audioBase64.length,
    rejectedCount: params.rejectedGeneratedVoiceIds?.length ?? 0,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': imageApiKey,
      },
      body: JSON.stringify(params),
      signal: options?.signal,
    });

    if (options?.signal?.aborted) {
      return saveFailure('ABORT', 'Request aborted', 0);
    }

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(response);
      logSave.error('callSavePreview', 'http error', {
        httpStatus: response.status,
        errorCode,
      });
      return {
        success: false,
        error: message,
        httpStatus: response.status,
        errorCode: mapSaveErrorCode(errorCode),
      };
    }

    const body = (await response.json()) as {
      success?: boolean;
      data?: SavePreviewSuccess['data'];
      meta?: Record<string, number>;
      error?: string;
    };

    if (body.success === false) {
      logSave.error('callSavePreview', 'server returned success=false', { error: body.error });
      return saveFailure('INTERNAL_ERROR', body.error || 'Server returned success=false', response.status);
    }

    const voice = body.data?.voice;
    if (!voice || !voice.id) {
      logSave.error('callSavePreview', 'malformed response', {});
      return saveFailure('INTERNAL_ERROR', 'Response thiếu voice.id', response.status);
    }

    logSave.info('callSavePreview', 'success', {
      voiceId: voice.id,
      hasCreatedAt: Boolean(voice.createdAt),
    });

    return {
      success: true,
      data: body.data as SavePreviewSuccess['data'],
      meta: body.meta,
    };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || options?.signal?.aborted) {
      logSave.info('callSavePreview', 'aborted');
      return saveFailure('ABORT', 'Request aborted', 0);
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError) {
      logSave.error('callSavePreview', 'connection error', { msg: rawMessage.slice(0, 100) });
      return saveFailure(
        'CONNECTION_ERROR',
        `Không kết nối được máy chủ (${rawMessage}). Vui lòng thử lại.`,
        0
      );
    }
    logSave.error('callSavePreview', 'unknown error', { name, msg: rawMessage.slice(0, 100) });
    return saveFailure('UNKNOWN', rawMessage || 'Unknown error', 0);
  }
}

// ───────────────────────── callGetFromElevenId ─────────────────────────

const GET_FROM_ELEVEN_ID_PATH = '/api/voice/get-from-eleven-id';
const ELEVEN_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;

function getFromElevenIdFailure(
  errorCode: GetFromElevenIdErrorCode,
  error: string,
  httpStatus = 0
): GetFromElevenIdFailure {
  return { success: false, error, httpStatus, errorCode };
}

function mapGetFromElevenIdErrorCode(code: string | undefined): GetFromElevenIdErrorCode {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_API_KEY':
    case 'ELEVEN_VOICE_NOT_FOUND':
    case 'ELEVEN_AUTH_FAILED':
    case 'ELEVEN_RATE_LIMITED':
    case 'ELEVEN_UPSTREAM_ERROR':
    case 'TIMEOUT':
      return code;
    default:
      return 'UNKNOWN';
  }
}

export async function callGetFromElevenId(
  elevenId: string,
  options?: VoiceApiCallOptions
): Promise<GetFromElevenIdResult> {
  const trimmed = elevenId.trim();
  if (!ELEVEN_ID_PATTERN.test(trimmed)) {
    return getFromElevenIdFailure('VALIDATION_ERROR', 'Invalid ID format');
  }

  const url = `${imageApiBaseUrl}${GET_FROM_ELEVEN_ID_PATH}?elevenId=${encodeURIComponent(trimmed)}`;

  logGet.info('callGetFromElevenId', 'start', { elevenIdLength: trimmed.length });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': imageApiKey },
      signal: options?.signal,
    });

    if (options?.signal?.aborted) {
      return getFromElevenIdFailure('ABORT', 'Request aborted', 0);
    }

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(response);
      logGet.error('callGetFromElevenId', 'http error', {
        httpStatus: response.status,
        errorCode,
      });
      return {
        success: false,
        error: message,
        httpStatus: response.status,
        errorCode: mapGetFromElevenIdErrorCode(errorCode),
      };
    }

    const body = (await response.json()) as {
      success?: boolean;
      data?: GetFromElevenIdData;
      meta?: GetFromElevenIdMeta;
      error?: string;
    };

    if (body.success === false) {
      logGet.error('callGetFromElevenId', 'server returned success=false', {
        error: body.error,
      });
      return getFromElevenIdFailure(
        'UNKNOWN',
        body.error || 'Server returned success=false',
        response.status
      );
    }

    const data = body.data;
    if (!data || data.elevenId !== trimmed) {
      logGet.error('callGetFromElevenId', 'malformed response', {
        hasData: Boolean(data),
        echoMatches: data?.elevenId === trimmed,
      });
      return getFromElevenIdFailure(
        'UNKNOWN',
        'Response missing elevenId or mismatched echo',
        response.status
      );
    }

    logGet.info('callGetFromElevenId', 'success', {
      cacheHit: body.meta?.cacheHit,
      elevenFetchMs: body.meta?.elevenFetchMs,
      mappedLanguage: data.language,
      hasPreview: Boolean(data.previewAudioUrl),
    });

    return { success: true, data, meta: body.meta };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || options?.signal?.aborted) {
      logGet.info('callGetFromElevenId', 'aborted');
      return getFromElevenIdFailure('ABORT', 'Request aborted', 0);
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError) {
      logGet.error('callGetFromElevenId', 'connection error', {
        msg: rawMessage.slice(0, 100),
      });
      return getFromElevenIdFailure(
        'CONNECTION_ERROR',
        `Không kết nối được máy chủ (${rawMessage}). Vui lòng thử lại.`,
        0
      );
    }
    logGet.error('callGetFromElevenId', 'unknown error', {
      name,
      msg: rawMessage.slice(0, 100),
    });
    return getFromElevenIdFailure('UNKNOWN', rawMessage || 'Unknown error', 0);
  }
}

