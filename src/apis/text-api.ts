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
