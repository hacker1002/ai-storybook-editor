// Book enum mappings - aligned with database schema
// Source: ai-storybook-design/api/README.md

export const BOOK_TYPE_MAP = {
  1: 'Picture Book',
  2: 'Illustrated Story',
  3: 'Comic',
  4: 'Manga',
} as const;

export const DIMENSION_MAP = {
  1: 'Square 8.5×8.5 (216×216mm)',
  2: 'Portrait 8×10 (203×254mm)',
  3: 'Portrait 6×9 (152×229mm)',
  4: 'Portrait 8.5×11 (216×279mm)',
  5: 'Portrait A4 (210×297mm)',
  6: 'Square 8.25×8.25 (210×210mm)',
  7: 'Square 8×8 (203×203mm)',
} as const;

export const TARGET_AUDIENCE_MAP = {
  1: 'Kindergarten (2-3)',
  2: 'Preschool (4-5)',
  3: 'Primary (6-8)',
  4: 'Middle Grade (9+)',
} as const;

export const TARGET_CORE_VALUE_MAP = {
  1: 'Dũng cảm',
  2: 'Quan tâm',
  3: 'Trung thực',
  4: 'Kiên trì',
  5: 'Biết ơn',
  6: 'Bản lĩnh',
  7: 'Thấu cảm',
  8: 'Chính trực',
  9: 'Vị tha',
  10: 'Tự thức',
  11: 'Tình bạn',
  12: 'Hợp tác',
  13: 'Chấp nhận sự khác biệt',
  14: 'Tử tế',
  15: 'Tò mò',
  16: 'Tự lập',
  17: 'Xử lý nỗi sợ',
  18: 'Quản lý cảm xúc',
  19: 'Chuyển giao',
  20: 'Bảo vệ môi trường',
  21: 'Trí tưởng tượng',
} as const;

export const FORMAT_GENRE_MAP = {
  1: 'Narrative Picture Books',
  2: 'Lullaby/Bedtime Books',
  3: 'Concept Books',
  4: 'Non-fiction Picture Books',
  5: 'Early Reader',
  6: 'Wordless Picture Books',
} as const;

export const CONTENT_GENRE_MAP = {
  1: 'Mystery',
  2: 'Fantasy',
  3: 'Realistic Fiction',
  4: 'Historical Fiction',
  5: 'Science Fiction',
  6: 'Folklore/Fairy Tales',
  7: 'Humor',
  8: 'Horror/Scary',
  9: 'Biography',
  10: 'Informational',
  11: 'Memoir',
} as const;

export const WRITING_STYLE_MAP = {
  1: 'Narrative',
  2: 'Rhyming',
  3: 'Humorous Fiction',
} as const;

// Pipeline step mapping (book.step field)
export const PIPELINE_STEP_MAP = {
  1: 'manuscript',
  2: 'illustration',
  3: 'retouch',
} as const;

// Type exports for strict typing
export type BookTypeId = keyof typeof BOOK_TYPE_MAP;
export type DimensionId = keyof typeof DIMENSION_MAP;
export type TargetAudienceId = keyof typeof TARGET_AUDIENCE_MAP;
export type TargetCoreValueId = keyof typeof TARGET_CORE_VALUE_MAP;
export type FormatGenreId = keyof typeof FORMAT_GENRE_MAP;
export type ContentGenreId = keyof typeof CONTENT_GENRE_MAP;
export type WritingStyleId = keyof typeof WRITING_STYLE_MAP;
export type PipelineStepId = keyof typeof PIPELINE_STEP_MAP;

// Helper: Convert map to options array for UI selects
type EnumMap = Record<number, string>;

export function enumToOptions<T extends EnumMap>(map: T): { value: number; label: string }[] {
  return Object.entries(map).map(([key, label]) => ({
    value: Number(key),
    label: label as string,
  }));
}

// Pre-built options for UI components
export const BOOK_TYPE_OPTIONS = enumToOptions(BOOK_TYPE_MAP);
export const DIMENSION_OPTIONS = enumToOptions(DIMENSION_MAP);
export const TARGET_AUDIENCE_OPTIONS = enumToOptions(TARGET_AUDIENCE_MAP);
export const TARGET_CORE_VALUE_OPTIONS = enumToOptions(TARGET_CORE_VALUE_MAP);
export const FORMAT_GENRE_OPTIONS = enumToOptions(FORMAT_GENRE_MAP);
export const CONTENT_GENRE_OPTIONS = enumToOptions(CONTENT_GENRE_MAP);
export const WRITING_STYLE_OPTIONS = enumToOptions(WRITING_STYLE_MAP);

// Helper: Get label from enum value
export function getEnumLabel(map: EnumMap, value: number | null | undefined): string {
  if (value == null) return '';
  return map[value] ?? '';
}
