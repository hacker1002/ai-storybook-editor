import type { AttachedFile } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import { prepareAttachments, type Attachment, type LLMContext } from './doc-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_API_KEY = import.meta.env.VITE_SUPABASE_API_ANON_KEY;

export interface GenerateDummyRequest {
  script: string;
  prompt: string;
  language_key: string;
  attachments?: Attachment[];
  llmContext: LLMContext;
}

export interface GenerateDummyResult {
  success: boolean;
  data?: {
    id: string;
    title: string;
    type: 'prose' | 'verse' | 'poetry';
    spreads: DummySpread[];
  };
  error?: string;
  meta?: {
    total_pages?: number;
    processingTime?: number;
    tokenUsage?: number;
  };
}

export async function generateDummy(
  params: GenerateDummyRequest
): Promise<GenerateDummyResult> {
  const url = `${SUPABASE_URL}/functions/v1/dummy-generate-dummy`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
      },
      body: JSON.stringify(params),
    });

    const data = (await response.json()) as GenerateDummyResult;

    if (!response.ok) {
      console.error('[dummy-api] generate-dummy error:', data);
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    console.error('[dummy-api] generate-dummy fetch error:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export interface GenerateDummyParams {
  script: string;
  prompt: string;
  languageKey: string;
  attachments: AttachedFile[];
  llmContext: LLMContext;
}

export async function callGenerateDummy(
  params: GenerateDummyParams
): Promise<GenerateDummyResult> {
  const apiAttachments = await prepareAttachments(params.attachments);

  return generateDummy({
    script: params.script,
    prompt: params.prompt,
    language_key: params.languageKey,
    attachments: apiAttachments.length > 0 ? apiAttachments : undefined,
    llmContext: params.llmContext,
  });
}

export function applyDummyResult(
  existingDummy: ManuscriptDummy,
  result: NonNullable<GenerateDummyResult['data']>
): ManuscriptDummy {
  return {
    ...existingDummy,
    title: result.title,
    type: result.type,
    spreads: result.spreads,
  };
}
