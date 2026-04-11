// quiz-slice.ts — Type-discriminated quiz CRUD + validation-as-state
// Data lives in state.illustration.spreads[].quizzes[]; own state = quizValidationErrors
// Quiz `type` is immutable after addQuiz (no changeQuizType action)

import type { StateCreator } from 'zustand';
import type { SnapshotStore, QuizSlice, QuizValidationIssue } from '../types';
import type {
  SpreadQuiz,
  QuizItem,
  QuizPair,
} from '@/types/spread-types';
import type { IllustrationData } from '@/types/illustration-types';
import { QUIZ_TYPE } from '@/types/spread-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'QuizSlice');

// ============================================================================
// Helpers
// ============================================================================

function findQuiz(
  illustration: IllustrationData,
  spreadId: string,
  quizId: string,
): SpreadQuiz | undefined {
  return illustration.spreads
    .find((s) => s.id === spreadId)
    ?.quizzes?.find((q) => q.id === quizId);
}

function issue(
  code: QuizValidationIssue['code'],
  message: string,
  severity: QuizValidationIssue['severity'],
  context?: Record<string, unknown>,
): QuizValidationIssue {
  return { code, message, severity, context };
}

// ============================================================================
// Validators — pure, read-only on draft. Never mutate quiz.
// ============================================================================

function validateSingleSelect(quiz: SpreadQuiz): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  if (!quiz.answer_setting.has_correct_answer) return issues;
  const items = quiz.elements.items ?? [];
  const correctCount = items.filter((i) => i.is_correct === true).length;
  if (correctCount === 0) {
    issues.push(
      issue(
        'correct_answer_count',
        'Quiz chưa có item đúng nào',
        'warning',
        { quizId: quiz.id, count: 0 },
      ),
    );
  } else if (correctCount > 1) {
    issues.push(
      issue(
        'correct_answer_count',
        `Quiz type single_select chỉ được 1 item đúng (hiện có ${correctCount})`,
        'error',
        { quizId: quiz.id, count: correctCount },
      ),
    );
  }
  return issues;
}

function validateMatching(quiz: SpreadQuiz): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  const items = quiz.elements.items ?? [];
  const pairs = quiz.elements.pairs ?? [];

  // All items phải có role source | target
  for (const item of items) {
    if (item.type !== 'source' && item.type !== 'target') {
      issues.push(
        issue(
          'source_target_role',
          `Item "${item.name}" thiếu role source/target`,
          'error',
          { quizId: quiz.id, itemId: item.id },
        ),
      );
    }
  }

  // Pair FK integrity
  const itemMap = new Map(items.map((i) => [i.id, i]));
  for (const pair of pairs) {
    const src = itemMap.get(pair.source_id);
    const tgt = itemMap.get(pair.target_id);
    if (!src || !tgt) {
      issues.push(
        issue(
          'fk_violation',
          'Pair trỏ tới item không tồn tại',
          'error',
          { quizId: quiz.id, pair },
        ),
      );
      continue;
    }
    if (src.type !== 'source' || tgt.type !== 'target') {
      issues.push(
        issue(
          'fk_violation',
          'Pair source_id/target_id sai role',
          'error',
          { quizId: quiz.id, pair },
        ),
      );
    }
  }

  // Relation constraint
  const relation = quiz.answer_setting.relation;
  if (relation) {
    const sourceCounts = new Map<string, number>();
    const targetCounts = new Map<string, number>();
    for (const p of pairs) {
      sourceCounts.set(p.source_id, (sourceCounts.get(p.source_id) ?? 0) + 1);
      targetCounts.set(p.target_id, (targetCounts.get(p.target_id) ?? 0) + 1);
    }
    const sourceDup = [...sourceCounts.values()].some((n) => n > 1);
    const targetDup = [...targetCounts.values()].some((n) => n > 1);
    if (relation === '1:1' && (sourceDup || targetDup)) {
      issues.push(
        issue(
          'relation_violation',
          'Relation 1:1 yêu cầu mỗi source/target duy nhất',
          'error',
          { quizId: quiz.id, relation },
        ),
      );
    } else if (relation === '1:n' && sourceDup) {
      issues.push(
        issue(
          'relation_violation',
          'Relation 1:n yêu cầu mỗi source duy nhất',
          'error',
          { quizId: quiz.id, relation },
        ),
      );
    } else if (relation === 'n:1' && targetDup) {
      issues.push(
        issue(
          'relation_violation',
          'Relation n:1 yêu cầu mỗi target duy nhất',
          'error',
          { quizId: quiz.id, relation },
        ),
      );
    }
  }

  return issues;
}

function validateSequence(quiz: SpreadQuiz): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  const items = quiz.elements.items ?? [];
  const ordered = items
    .filter((i) => typeof i.order === 'number' && i.order !== null)
    .map((i) => i.order as number)
    .sort((a, b) => a - b);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i] !== i + 1) {
      issues.push(
        issue(
          'sequence_gap',
          `Sequence order không liên tục 1..${ordered.length}`,
          'warning',
          { quizId: quiz.id, gapAt: i + 1 },
        ),
      );
      break;
    }
  }
  return issues;
}

function validateDragDrop(quiz: SpreadQuiz): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  const items = quiz.elements.items ?? [];
  const zones = quiz.elements.target_zones ?? [];
  const zoneIds = new Set(zones.map((z) => z.id));
  for (const item of items) {
    if (item.drop_target_id && !zoneIds.has(item.drop_target_id)) {
      issues.push(
        issue(
          'fk_violation',
          `Item "${item.name}" trỏ tới drop_target_id không tồn tại`,
          'error',
          { quizId: quiz.id, itemId: item.id, zoneId: item.drop_target_id },
        ),
      );
    }
  }
  return issues;
}

function validateHotspot(quiz: SpreadQuiz): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  const zones = quiz.elements.target_zones ?? [];
  const images = quiz.elements.images ?? [];
  if (zones.length === 0) {
    issues.push(
      issue(
        'hotspot_no_zones',
        'Hotspot quiz cần ít nhất 1 target zone',
        'warning',
        { quizId: quiz.id },
      ),
    );
  }
  if (images.length === 0) {
    issues.push(
      issue(
        'hotspot_no_images',
        'Hotspot quiz cần ít nhất 1 decor image',
        'warning',
        { quizId: quiz.id },
      ),
    );
  }
  return issues;
}

function runValidatorsFor(quiz: SpreadQuiz): QuizValidationIssue[] {
  switch (quiz.type) {
    case QUIZ_TYPE.SINGLE_SELECT:
      return validateSingleSelect(quiz);
    case QUIZ_TYPE.MATCHING:
      return validateMatching(quiz);
    case QUIZ_TYPE.SEQUENCE:
      return validateSequence(quiz);
    case QUIZ_TYPE.DRAG_DROP:
      return validateDragDrop(quiz);
    case QUIZ_TYPE.HOTSPOT:
      return validateHotspot(quiz);
    default:
      return [];
  }
}

// ============================================================================
// Slice factory
// ============================================================================

export const createQuizSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  QuizSlice
> = (set) => ({
  quizValidationErrors: {},

  // --- Quiz-level CRUD ---

  addQuiz: (spreadId, quiz) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (!spread) {
        log.debug('addQuiz', 'spread not found', { spreadId });
        return;
      }
      log.info('addQuiz', 'add', { spreadId, quizId: quiz.id, type: quiz.type });
      spread.quizzes = spread.quizzes ?? [];
      spread.quizzes.push(quiz);
      state.sync.isDirty = true;
      const issues = runValidatorsFor(quiz);
      state.quizValidationErrors[quiz.id] = issues;
      if (issues.length > 0) {
        log.warn('addQuiz', 'validation issues', { quizId: quiz.id, count: issues.length });
      }
    }),

  updateQuiz: (spreadId, quizId, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) {
        log.debug('updateQuiz', 'quiz not found', { spreadId, quizId });
        return;
      }
      log.info('updateQuiz', 'update', { spreadId, quizId, keys: Object.keys(updates) });
      Object.assign(quiz, updates);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  deleteQuiz: (spreadId, quizId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (!spread) return;
      log.info('deleteQuiz', 'delete', { spreadId, quizId });
      spread.quizzes = spread.quizzes?.filter((q) => q.id !== quizId) ?? [];
      state.sync.isDirty = true;
      delete state.quizValidationErrors[quizId];
    }),

  // --- Quiz-level locale (question + audio_url per language) ---

  upsertQuizLocale: (spreadId, quizId, languageKey, content) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.debug('upsertQuizLocale', 'upsert', { spreadId, quizId, languageKey });
      (quiz as Record<string, unknown>)[languageKey] = content;
      state.sync.isDirty = true;
    }),

  deleteQuizLocale: (spreadId, quizId, languageKey) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.debug('deleteQuizLocale', 'delete', { spreadId, quizId, languageKey });
      delete (quiz as Record<string, unknown>)[languageKey];
      state.sync.isDirty = true;
    }),

  // --- answer_setting / quiz_container ---

  updateQuizAnswerSetting: (spreadId, quizId, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.debug('updateQuizAnswerSetting', 'update', { spreadId, quizId, keys: Object.keys(updates) });
      Object.assign(quiz.answer_setting, updates);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  updateQuizContainer: (spreadId, quizId, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.debug('updateQuizContainer', 'update', { spreadId, quizId, keys: Object.keys(updates) });
      Object.assign(quiz.quiz_container, updates);
      state.sync.isDirty = true;
    }),

  // --- item_container (per-role) ---

  setItemContainerStyle: (spreadId, quizId, role, style) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.debug('setItemContainerStyle', 'set', { spreadId, quizId, role });
      quiz.item_container[role] = style;
      state.sync.isDirty = true;
    }),

  updateItemContainerStyle: (spreadId, quizId, role, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      const existing = quiz.item_container[role];
      if (!existing) {
        log.warn('updateItemContainerStyle', 'role not set', { spreadId, quizId, role });
        return;
      }
      log.debug('updateItemContainerStyle', 'update', { spreadId, quizId, role, keys: Object.keys(updates) });
      Object.assign(existing, updates);
      state.sync.isDirty = true;
    }),

  // --- elements.items[] CRUD ---

  addQuizItem: (spreadId, quizId, item) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.info('addQuizItem', 'add', { spreadId, quizId, itemId: item.id });
      quiz.elements.items = quiz.elements.items ?? [];
      quiz.elements.items.push(item);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  updateQuizItem: (spreadId, quizId, itemId, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz?.elements.items) return;
      const existing = quiz.elements.items.find((i) => i.id === itemId);
      if (!existing) {
        log.debug('updateQuizItem', 'item not found', { spreadId, quizId, itemId });
        return;
      }
      log.debug('updateQuizItem', 'update', { spreadId, quizId, itemId, keys: Object.keys(updates) });
      Object.assign(existing, updates);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  deleteQuizItem: (spreadId, quizId, itemId) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz?.elements.items) return;
      log.info('deleteQuizItem', 'delete', { spreadId, quizId, itemId });
      quiz.elements.items = quiz.elements.items.filter((i) => i.id !== itemId);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  reorderQuizItems: (spreadId, quizId, fromIndex, toIndex) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const items = quiz?.elements.items;
      if (!quiz || !items) return;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= items.length ||
        toIndex >= items.length
      ) {
        log.warn('reorderQuizItems', 'index out of range', { spreadId, quizId, fromIndex, toIndex });
        return;
      }
      log.debug('reorderQuizItems', 'reorder', { spreadId, quizId, fromIndex, toIndex });
      const [removed] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, removed);
      state.sync.isDirty = true;
    }),

  upsertQuizItemLocale: (spreadId, quizId, itemId, languageKey, content) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const item = quiz?.elements.items?.find((i) => i.id === itemId);
      if (!item) return;
      log.debug('upsertQuizItemLocale', 'upsert', { spreadId, quizId, itemId, languageKey });
      (item as Record<string, unknown>)[languageKey] = content;
      state.sync.isDirty = true;
    }),

  deleteQuizItemLocale: (spreadId, quizId, itemId, languageKey) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const item = quiz?.elements.items?.find((i) => i.id === itemId);
      if (!item) return;
      log.debug('deleteQuizItemLocale', 'delete', { spreadId, quizId, itemId, languageKey });
      delete (item as Record<string, unknown>)[languageKey];
      state.sync.isDirty = true;
    }),

  // --- elements.pairs[] (type 1) ---

  addQuizPair: (spreadId, quizId, pair) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.info('addQuizPair', 'add', { spreadId, quizId, pair });
      quiz.elements.pairs = quiz.elements.pairs ?? [];
      quiz.elements.pairs.push(pair);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  deleteQuizPair: (spreadId, quizId, pairIndex) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const pairs = quiz?.elements.pairs;
      if (!quiz || !pairs || pairIndex < 0 || pairIndex >= pairs.length) return;
      log.info('deleteQuizPair', 'delete', { spreadId, quizId, pairIndex });
      pairs.splice(pairIndex, 1);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  clearQuizPairs: (spreadId, quizId) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.info('clearQuizPairs', 'clear', { spreadId, quizId });
      quiz.elements.pairs = [];
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  // --- elements.target_zones[] (type 3, 4) ---

  addQuizTargetZone: (spreadId, quizId, zone) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.info('addQuizTargetZone', 'add', { spreadId, quizId, zoneId: zone.id });
      quiz.elements.target_zones = quiz.elements.target_zones ?? [];
      quiz.elements.target_zones.push(zone);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  updateQuizTargetZone: (spreadId, quizId, zoneId, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const zone = quiz?.elements.target_zones?.find((z) => z.id === zoneId);
      if (!quiz || !zone) return;
      log.debug('updateQuizTargetZone', 'update', { spreadId, quizId, zoneId, keys: Object.keys(updates) });
      Object.assign(zone, updates);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  deleteQuizTargetZone: (spreadId, quizId, zoneId) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz?.elements.target_zones) return;
      log.info('deleteQuizTargetZone', 'delete', { spreadId, quizId, zoneId });
      quiz.elements.target_zones = quiz.elements.target_zones.filter((z) => z.id !== zoneId);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  // --- elements.images[] (type 3, 4) ---

  addQuizDecorImage: (spreadId, quizId, image) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.info('addQuizDecorImage', 'add', { spreadId, quizId, name: image.name });
      quiz.elements.images = quiz.elements.images ?? [];
      quiz.elements.images.push(image);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  updateQuizDecorImage: (spreadId, quizId, imageIndex, updates) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const images = quiz?.elements.images;
      if (!quiz || !images || imageIndex < 0 || imageIndex >= images.length) return;
      log.debug('updateQuizDecorImage', 'update', { spreadId, quizId, imageIndex, keys: Object.keys(updates) });
      Object.assign(images[imageIndex], updates);
      state.sync.isDirty = true;
    }),

  deleteQuizDecorImage: (spreadId, quizId, imageIndex) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      const images = quiz?.elements.images;
      if (!quiz || !images || imageIndex < 0 || imageIndex >= images.length) return;
      log.info('deleteQuizDecorImage', 'delete', { spreadId, quizId, imageIndex });
      images.splice(imageIndex, 1);
      state.sync.isDirty = true;
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  // --- Validation utilities ---

  revalidateQuiz: (spreadId, quizId) =>
    set((state) => {
      const quiz = findQuiz(state.illustration, spreadId, quizId);
      if (!quiz) return;
      log.debug('revalidateQuiz', 'revalidate', { spreadId, quizId });
      state.quizValidationErrors[quizId] = runValidatorsFor(quiz);
    }),

  clearQuizValidation: (quizId) =>
    set((state) => {
      log.debug('clearQuizValidation', 'clear', { quizId });
      delete state.quizValidationErrors[quizId];
    }),
});

// Re-export types consumers might want (avoid circular imports with types.ts)
export type { QuizItem, QuizPair };
