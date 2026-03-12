import type { AttachedFile } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import { prepareAttachments, type Attachment, type LLMContext } from './doc-api';
import { callEdgeFunction } from './edge-function-client';

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
  return callEdgeFunction<GenerateDummyResult>(
    'dummy-generate-dummy',
    params
  );
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
