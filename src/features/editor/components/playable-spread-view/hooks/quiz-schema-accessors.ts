// quiz-schema-accessors.ts
// Pure accessors that isolate volatile SpreadQuiz schema surface so the rest
// of the codebase only depends on stable function signatures. When quiz schema
// shape changes (e.g. nested `languages: { [code]: ... }`), only this file
// updates.
//
// Source-of-truth types: src/types/spread-types.ts
// Spec: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-11-spread-media-preload.md §11

import type {
  SpreadQuiz,
  QuizItem,
  SpreadQuizLocalized,
  QuizItemContent,
} from '@/types/spread-types';

/** Quiz-level localized content (question + audio_url) for given language code. */
export function getQuizLangContent(
  quiz: SpreadQuiz,
  langCode: string,
): SpreadQuizLocalized | undefined {
  const v = quiz[langCode];
  if (v && typeof v === 'object' && 'question' in v) {
    return v as SpreadQuizLocalized;
  }
  return undefined;
}

/** Items array (types 0, 1, 2, 3). Empty for type 4. */
export function getQuizItems(quiz: SpreadQuiz): QuizItem[] {
  return quiz.elements?.items ?? [];
}

/** Per-item image URL (always present on QuizItem when item has visual). */
export function getQuizItemImage(item: QuizItem): string | undefined {
  return item.image_url || undefined;
}

/** Per-item localized content (text + audio_url) for given language code. */
export function getQuizItemLangContent(
  item: QuizItem,
  langCode: string,
): QuizItemContent | undefined {
  const v = item[langCode];
  if (v && typeof v === 'object' && ('text' in v || 'audio_url' in v)) {
    return v as QuizItemContent;
  }
  return undefined;
}

/** Decor images on quiz canvas (types 3, 4 use these). */
export function getQuizDecorImages(quiz: SpreadQuiz): string[] {
  const imgs = quiz.elements?.images ?? [];
  return imgs
    .map((d) => d.image_url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

/** Optional quiz container background image (frame backdrop). */
export function getQuizBackgroundImage(quiz: SpreadQuiz): string | undefined {
  return quiz.quiz_container?.background?.image_url || undefined;
}
