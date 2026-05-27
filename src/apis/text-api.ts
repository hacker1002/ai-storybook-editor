import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'TextApi');

const imageApiBaseUrl = import.meta.env.VITE_IMAGE_API_BASE_URL as string;
const imageApiKey = import.meta.env.VITE_IMAGE_API_KEY as string;

export interface TranslateContentParams {
  content: string[];
  sourceLanguage: string;
  targetLanguage: string;
  prompt?: string;
  context?: string;
}

export interface TranslateContentMeta {
  sourceLanguage?: string;
  targetLanguage?: string;
  processingTime?: number;
  tokenUsage?: number;
}

export interface TranslateContentSuccess {
  success: true;
  data: { translations: string[] };
  meta?: TranslateContentMeta;
}

export type TranslateContentErrorCode =
  | 'VALIDATION'
  | 'SAME_LANGUAGE'
  | 'LLM_ERROR'
  | 'LENGTH_MISMATCH'
  | 'INTERNAL'
  | 'CONNECTION_ERROR'
  | 'ABORT'
  | 'UNKNOWN';

export interface TranslateContentFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode: TranslateContentErrorCode;
}

export type TranslateContentResult = TranslateContentSuccess | TranslateContentFailure;

export interface CallOptions {
  signal?: AbortSignal;
}

function failure(
  errorCode: TranslateContentErrorCode,
  error: string,
  httpStatus = 0
): TranslateContentFailure {
  return { success: false, error, httpStatus, errorCode };
}

export async function callTranslateContent(
  params: TranslateContentParams,
  options?: CallOptions
): Promise<TranslateContentResult> {
  if (!params.content || params.content.length === 0) {
    return failure('VALIDATION', 'content empty');
  }
  if (params.content.some(s => !s || !s.trim())) {
    return failure('VALIDATION', 'content contains empty item');
  }
  if (params.sourceLanguage === params.targetLanguage) {
    return failure('SAME_LANGUAGE', 'sourceLanguage must differ from targetLanguage');
  }

  const path = '/api/text/translate-content';
  const url = `${imageApiBaseUrl}${path}`;

  log.info('callTranslateContent', 'start', {
    count: params.content.length,
    src: params.sourceLanguage,
    tgt: params.targetLanguage,
    hasPrompt: Boolean(params.prompt),
    hasContext: Boolean(params.context),
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
      return failure('ABORT', 'Request aborted', 0);
    }

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(response);
      log.error('callTranslateContent', 'http error', {
        httpStatus: response.status,
        errorCode,
        msg: message.slice(0, 100),
      });
      return {
        success: false,
        error: message,
        httpStatus: response.status,
        errorCode: mapServerErrorCode(errorCode),
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: { translations?: string[] };
      meta?: TranslateContentMeta;
      error?: string;
    };

    if (data.success === false) {
      log.error('callTranslateContent', 'server returned success=false', {
        error: data.error,
      });
      return failure('INTERNAL', data.error || 'Server returned success=false', response.status);
    }

    const translations = data.data?.translations;
    if (!Array.isArray(translations)) {
      return failure('INTERNAL', 'Malformed response: translations missing', response.status);
    }

    if (translations.length !== params.content.length) {
      log.error('callTranslateContent', 'length mismatch', {
        expected: params.content.length,
        got: translations.length,
      });
      return failure(
        'LENGTH_MISMATCH',
        `Expected ${params.content.length} translations, got ${translations.length}`,
        response.status
      );
    }

    log.info('callTranslateContent', 'success', {
      count: translations.length,
      processingTime: data.meta?.processingTime,
      tokenUsage: data.meta?.tokenUsage,
    });

    return {
      success: true,
      data: { translations },
      meta: data.meta,
    };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || options?.signal?.aborted) {
      log.info('callTranslateContent', 'aborted');
      return failure('ABORT', 'Request aborted', 0);
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError) {
      log.error('callTranslateContent', 'connection error', { msg: rawMessage.slice(0, 100) });
      return failure(
        'CONNECTION_ERROR',
        `Không kết nối được máy chủ (${rawMessage}). Vui lòng thử lại.`,
        0
      );
    }
    log.error('callTranslateContent', 'unknown error', { name, msg: rawMessage.slice(0, 100) });
    return failure('UNKNOWN', rawMessage || 'Unknown error', 0);
  }
}

function mapServerErrorCode(code: string | undefined): TranslateContentErrorCode {
  switch (code) {
    case 'VALIDATION':
    case 'SAME_LANGUAGE':
    case 'LLM_ERROR':
    case 'LENGTH_MISMATCH':
    case 'INTERNAL':
      return code;
    default:
      return 'UNKNOWN';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhance Narration
// ─────────────────────────────────────────────────────────────────────────────

export const NARRATOR_KEY = 'narrator';
export const MAX_NARRATIONS_PER_BATCH = 50;
export const MAX_NARRATION_CHARS = 2000;
export const READER_KEY_REGEX = /^[a-z][a-z0-9_]{0,39}$/;

export interface Reader {
  key: string;
  name?: string;
  description?: string;
}

export interface EnhanceNarrationParams {
  narrations: string[];
  readers: Reader[];
  language: string;
  prompt?: string;
  context?: string;
}

export interface EnhanceNarrationMeta {
  language?: string;
  readerCount?: number;
  multiTurnCount?: number;
  processingTimeMs?: number;
  tokenUsage?: number;
}

export interface EnhanceNarrationSuccess {
  success: true;
  data: { scripts: string[] };
  meta?: EnhanceNarrationMeta;
}

export type EnhanceNarrationErrorCode =
  | 'VALIDATION'
  | 'MISSING_NARRATOR'
  | 'DUPLICATE_READER_KEY'
  | 'LLM_ERROR'
  | 'LENGTH_MISMATCH'
  | 'UNKNOWN_READER'
  | 'MALFORMED_SCRIPT'
  | 'INTERNAL'
  | 'CONNECTION_ERROR'
  | 'ABORT'
  | 'UNKNOWN';

export interface EnhanceNarrationFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode: EnhanceNarrationErrorCode;
}

export type EnhanceNarrationResult =
  | EnhanceNarrationSuccess
  | EnhanceNarrationFailure;

function enhanceFailure(
  errorCode: EnhanceNarrationErrorCode,
  error: string,
  httpStatus = 0
): EnhanceNarrationFailure {
  return { success: false, error, httpStatus, errorCode };
}

function mapEnhanceServerErrorCode(
  code: string | undefined
): EnhanceNarrationErrorCode {
  switch (code) {
    case 'VALIDATION':
    case 'MISSING_NARRATOR':
    case 'DUPLICATE_READER_KEY':
    case 'LLM_ERROR':
    case 'LENGTH_MISMATCH':
    case 'UNKNOWN_READER':
    case 'MALFORMED_SCRIPT':
    case 'INTERNAL':
      return code;
    default:
      return 'UNKNOWN';
  }
}

export async function callEnhanceNarration(
  params: EnhanceNarrationParams,
  options?: CallOptions
): Promise<EnhanceNarrationResult> {
  const { narrations, readers, language } = params;

  if (!Array.isArray(narrations) || narrations.length === 0) {
    return enhanceFailure('VALIDATION', 'narrations empty');
  }
  if (narrations.length > MAX_NARRATIONS_PER_BATCH) {
    return enhanceFailure(
      'VALIDATION',
      `narrations exceeds ${MAX_NARRATIONS_PER_BATCH}`
    );
  }
  for (const item of narrations) {
    const trimmed = (item ?? '').trim();
    if (trimmed.length === 0) {
      return enhanceFailure('VALIDATION', 'narrations contains empty item');
    }
    if (trimmed.length > MAX_NARRATION_CHARS) {
      return enhanceFailure(
        'VALIDATION',
        `narration exceeds ${MAX_NARRATION_CHARS} chars`
      );
    }
  }
  if (!Array.isArray(readers) || readers.length === 0) {
    return enhanceFailure('VALIDATION', 'readers empty');
  }
  const narratorCount = readers.filter(r => r.key === NARRATOR_KEY).length;
  if (narratorCount !== 1) {
    return enhanceFailure(
      'MISSING_NARRATOR',
      'readers must contain exactly one narrator'
    );
  }
  const seenKeys = new Set<string>();
  for (const r of readers) {
    if (seenKeys.has(r.key)) {
      return enhanceFailure(
        'DUPLICATE_READER_KEY',
        `duplicate reader key: ${r.key}`
      );
    }
    seenKeys.add(r.key);
    if (!READER_KEY_REGEX.test(r.key)) {
      return enhanceFailure('VALIDATION', `invalid reader key: ${r.key}`);
    }
  }
  if (!language) {
    return enhanceFailure('VALIDATION', 'language required');
  }

  const path = '/api/text/enhance-narration';
  const url = `${imageApiBaseUrl}${path}`;

  log.info('callEnhanceNarration', 'start', {
    count: narrations.length,
    language,
    readerCount: readers.length,
    hasPrompt: Boolean(params.prompt),
    hasContext: Boolean(params.context),
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
      return enhanceFailure('ABORT', 'Request aborted', 0);
    }

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(response);
      log.error('callEnhanceNarration', 'http error', {
        httpStatus: response.status,
        errorCode,
        msg: message.slice(0, 100),
      });
      return {
        success: false,
        error: message,
        httpStatus: response.status,
        errorCode: mapEnhanceServerErrorCode(errorCode),
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: { scripts?: string[] };
      meta?: EnhanceNarrationMeta;
      error?: string;
    };

    if (data.success === false) {
      log.error('callEnhanceNarration', 'server returned success=false', {
        error: data.error,
      });
      return enhanceFailure(
        'INTERNAL',
        data.error || 'Server returned success=false',
        response.status
      );
    }

    const scripts = data.data?.scripts;
    if (!Array.isArray(scripts)) {
      return enhanceFailure(
        'INTERNAL',
        'Malformed response: scripts missing',
        response.status
      );
    }

    if (scripts.length !== narrations.length) {
      log.error('callEnhanceNarration', 'length mismatch', {
        expected: narrations.length,
        got: scripts.length,
      });
      return enhanceFailure(
        'LENGTH_MISMATCH',
        `Expected ${narrations.length} scripts, got ${scripts.length}`,
        response.status
      );
    }

    log.info('callEnhanceNarration', 'success', {
      count: scripts.length,
      processingTimeMs: data.meta?.processingTimeMs,
      tokenUsage: data.meta?.tokenUsage,
      multiTurnCount: data.meta?.multiTurnCount,
    });

    return {
      success: true,
      data: { scripts },
      meta: data.meta,
    };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || options?.signal?.aborted) {
      log.info('callEnhanceNarration', 'aborted');
      return enhanceFailure('ABORT', 'Request aborted', 0);
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError) {
      log.error('callEnhanceNarration', 'connection error', {
        msg: rawMessage.slice(0, 100),
      });
      return enhanceFailure(
        'CONNECTION_ERROR',
        `Không kết nối được máy chủ (${rawMessage}). Vui lòng thử lại.`,
        0
      );
    }
    log.error('callEnhanceNarration', 'unknown error', {
      name,
      msg: rawMessage.slice(0, 100),
    });
    return enhanceFailure('UNKNOWN', rawMessage || 'Unknown error', 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhance Image Annotation (multimodal vision — image-IN/text-OUT)
// Spec: ai-storybook-design/api/text-generation/07-enhance-annotation.md
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ANNOTATION_IMAGES_PER_BATCH = 12;
export const MAX_ANNOTATION_SUBJECTS_PER_IMAGE = 20;

export interface AnnotationSubjectPayload {
  key: string;
  type: 'character' | 'prop';
  variant_key: string | null;
  name?: string;
  visual_description?: string;
}

export interface AnnotationImagePayload {
  index: number;
  media_url: string;
  subjects: AnnotationSubjectPayload[];
}

export interface EnhanceImageAnnotationParams {
  images: AnnotationImagePayload[]; // 1..12
  language: string;
  art_style?: string;
  prompt?: string; // v1 not sent
  context?: string;
}

export interface AnnotationItem {
  index: number;
  description: string;
}

export type SkippedImageReason =
  | 'FETCH_ERROR'
  | 'SSRF_BLOCKED'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE';

export interface SkippedImage {
  index: number;
  reason: SkippedImageReason;
}

export interface EnhanceImageAnnotationMeta {
  imageCount?: number;
  annotatedCount?: number;
  language?: string;
  skipped?: SkippedImage[];
  processingTimeMs?: number;
  tokenUsage?: number;
}

export interface EnhanceImageAnnotationSuccess {
  success: true;
  data: { annotations: AnnotationItem[] };
  meta?: EnhanceImageAnnotationMeta;
}

export type EnhanceImageAnnotationErrorCode =
  | 'VALIDATION'
  | 'IMAGE_FETCH_ERROR'
  | 'LLM_ERROR'
  | 'LENGTH_MISMATCH'
  | 'INTERNAL'
  | 'CONNECTION_ERROR'
  | 'ABORT'
  | 'UNKNOWN';

export interface EnhanceImageAnnotationFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode: EnhanceImageAnnotationErrorCode;
}

export type EnhanceImageAnnotationResult =
  | EnhanceImageAnnotationSuccess
  | EnhanceImageAnnotationFailure;

function annotationFailure(
  errorCode: EnhanceImageAnnotationErrorCode,
  error: string,
  httpStatus = 0
): EnhanceImageAnnotationFailure {
  return { success: false, error, httpStatus, errorCode };
}

function mapAnnotationServerErrorCode(
  code: string | undefined
): EnhanceImageAnnotationErrorCode {
  switch (code) {
    // Body-validation errors come from the global RequestValidationError
    // handler as "VALIDATION_ERROR" (HTTP 400); normalize to internal 'VALIDATION'.
    case 'VALIDATION_ERROR':
    case 'VALIDATION':
      return 'VALIDATION';
    case 'IMAGE_FETCH_ERROR':
    case 'LLM_ERROR':
    case 'LENGTH_MISMATCH':
    case 'INTERNAL':
      return code;
    default:
      return 'UNKNOWN';
  }
}

export async function callEnhanceImageAnnotation(
  params: EnhanceImageAnnotationParams,
  options?: CallOptions
): Promise<EnhanceImageAnnotationResult> {
  const { images, language } = params;

  if (!Array.isArray(images) || images.length === 0) {
    return annotationFailure('VALIDATION', 'images empty');
  }
  if (images.length > MAX_ANNOTATION_IMAGES_PER_BATCH) {
    return annotationFailure(
      'VALIDATION',
      `images exceeds ${MAX_ANNOTATION_IMAGES_PER_BATCH}`
    );
  }
  if (images.some(img => !img.media_url || !img.media_url.trim())) {
    return annotationFailure('VALIDATION', 'image media_url missing');
  }
  if (!language) {
    return annotationFailure('VALIDATION', 'language required');
  }

  const path = '/api/text/enhance-annotation';
  const url = `${imageApiBaseUrl}${path}`;

  log.info('callEnhanceImageAnnotation', 'start', {
    count: images.length,
    language,
    hasArtStyle: Boolean(params.art_style),
    hasContext: Boolean(params.context),
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
      return annotationFailure('ABORT', 'Request aborted', 0);
    }

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(response);
      log.error('callEnhanceImageAnnotation', 'http error', {
        httpStatus: response.status,
        errorCode,
        msg: message.slice(0, 100),
      });
      return {
        success: false,
        error: message,
        httpStatus: response.status,
        errorCode: mapAnnotationServerErrorCode(errorCode),
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: { annotations?: AnnotationItem[] };
      meta?: EnhanceImageAnnotationMeta;
      error?: string;
    };

    if (data.success === false) {
      log.error('callEnhanceImageAnnotation', 'server returned success=false', {
        error: data.error,
      });
      return annotationFailure(
        'INTERNAL',
        data.error || 'Server returned success=false',
        response.status
      );
    }

    const annotations = data.data?.annotations;
    if (!Array.isArray(annotations)) {
      return annotationFailure(
        'INTERNAL',
        'Malformed response: annotations missing',
        response.status
      );
    }

    log.info('callEnhanceImageAnnotation', 'success', {
      annotatedCount: annotations.length,
      skippedCount: data.meta?.skipped?.length ?? 0,
      processingTimeMs: data.meta?.processingTimeMs,
      tokenUsage: data.meta?.tokenUsage,
    });

    return {
      success: true,
      data: { annotations },
      meta: data.meta,
    };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || options?.signal?.aborted) {
      log.info('callEnhanceImageAnnotation', 'aborted');
      return annotationFailure('ABORT', 'Request aborted', 0);
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError) {
      log.error('callEnhanceImageAnnotation', 'connection error', {
        msg: rawMessage.slice(0, 100),
      });
      return annotationFailure(
        'CONNECTION_ERROR',
        `Không kết nối được máy chủ (${rawMessage}). Vui lòng thử lại.`,
        0
      );
    }
    log.error('callEnhanceImageAnnotation', 'unknown error', {
      name,
      msg: rawMessage.slice(0, 100),
    });
    return annotationFailure('UNKNOWN', rawMessage || 'Unknown error', 0);
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
      (typeof detailError === 'object' && detailError !== null && typeof detailError.message === 'string'
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
