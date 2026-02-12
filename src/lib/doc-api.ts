import type { DocType, AttachedFile } from '@/types/editor';
import { fileToBase64 } from './file-utils';

// API attachment format (matches edge function types)
export interface Attachment {
  filename: string;
  mimeType: string;
  base64Data: string;
}

// Request/Response types matching edge functions
export interface LLMContext {
  targetAudience: 1 | 2 | 3 | 4;
  targetCoreValue: number;
  formatGenre: 1 | 2 | 3 | 4 | 5 | 6;
  contentGenre: number;
  era?: { id: string; name: string; description: string };
  location?: { id: string; name: string; description: string };
}

export interface GenerateDocResult {
  success: boolean;
  data?: string;
  error?: string;
  meta?: { processingTime?: number; tokenUsage?: number };
}

interface GenerateBriefParams {
  prompt: string;
  currentBrief?: string;
  attachments?: Attachment[];
  llmContext: LLMContext;
}

interface GenerateDraftParams {
  brief: string;
  prompt: string;
  currentDraft?: string;
  attachments?: Attachment[];
  llmContext: LLMContext;
}

interface GenerateScriptParams {
  draft: string;
  prompt: string;
  currentScript?: string;
  attachments?: Attachment[];
  llmContext: LLMContext;
}

type GenerateParams = GenerateBriefParams | GenerateDraftParams | GenerateScriptParams;

const FUNCTION_MAP: Record<Exclude<DocType, 'other'>, string> = {
  brief: 'doc-generate-brief',
  draft: 'doc-generate-draft',
  script: 'doc-generate-script',
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_API_KEY = import.meta.env.VITE_SUPABASE_API_ANON_KEY;

// Function overloads for type-safe parameter matching
export async function generateDoc(docType: 'brief', params: GenerateBriefParams): Promise<GenerateDocResult>;
export async function generateDoc(docType: 'draft', params: GenerateDraftParams): Promise<GenerateDocResult>;
export async function generateDoc(docType: 'script', params: GenerateScriptParams): Promise<GenerateDocResult>;
export async function generateDoc(
  docType: Exclude<DocType, 'other'>,
  params: GenerateParams
): Promise<GenerateDocResult> {
  const functionName = FUNCTION_MAP[docType];
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_API_KEY}`,
      },
      body: JSON.stringify(params),
    });

    const data = await response.json() as GenerateDocResult;

    if (!response.ok) {
      console.error(`[doc-api] ${functionName} error:`, data);
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    console.error(`[doc-api] ${functionName} fetch error:`, error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Convert frontend AttachedFile[] to API Attachment[]
 */
export async function prepareAttachments(
  files: AttachedFile[]
): Promise<Attachment[]> {
  if (!files.length) return [];

  return Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      mimeType: f.type,
      base64Data: await fileToBase64(f.file),
    }))
  );
}

// Helper to build LLMContext from Book fields
export function buildLLMContext(book: {
  target_audience: number | null;
  target_core_value: number | null;
  format_genre: number | null;
  content_genre: number | null;
  era_id?: string | null;
  location_id?: string | null;
}): LLMContext | null {
  const { target_audience, target_core_value, format_genre, content_genre } = book;

  // Validate required fields
  if (
    target_audience == null ||
    target_core_value == null ||
    format_genre == null ||
    content_genre == null
  ) {
    return null;
  }

  return {
    targetAudience: target_audience as 1 | 2 | 3 | 4,
    targetCoreValue: target_core_value,
    formatGenre: format_genre as 1 | 2 | 3 | 4 | 5 | 6,
    contentGenre: content_genre,
  };
}
