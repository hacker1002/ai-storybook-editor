import type { AttachedFile } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import { prepareAttachments, type Attachment, type LLMContext } from './doc-api';
import { callEdgeFunction } from './edge-function-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'DummyApi');

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
  log.info('generateDummy', 'start', { languageKey: params.language_key, hasAttachments: !!params.attachments?.length });
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
  log.info('callGenerateDummy', 'start', { languageKey: params.languageKey, attachmentCount: params.attachments.length });
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
  log.info('applyDummyResult', 'apply', { dummyId: existingDummy.id, spreadCount: result.spreads.length, type: result.type });
  return {
    ...existingDummy,
    title: result.title,
    type: result.type,
    spreads: result.spreads,
  };
}
