// image-task-slice.ts - Manages ephemeral background image generation/editing tasks
// Tasks live in store memory only (not persisted to DB), decoupled from component lifecycle.
// Supports multiple entity types: props→states, characters→variants, stages→settings.

import type { StateCreator } from 'zustand';
import type { SnapshotStore, ImageTaskSlice, ImageTaskEntityType } from '../types';
import type { Illustration } from '@/types/prop-types';
import { callGenerateFromDescription } from '@/apis/image-api';
import { callEditObjectImage } from '@/apis/retouch-api';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ImageTaskSlice');

/**
 * Finds the illustrations array for the given entity type + keys.
 * Returns the mutable illustrations array (Immer draft), or undefined if entity/child not found.
 */
function findIllustrations(
  state: SnapshotStore,
  entityType: ImageTaskEntityType,
  entityKey: string,
  childKey: string,
): Illustration[] | undefined {
  switch (entityType) {
    case 'prop': {
      const prop = state.props.find((p) => p.key === entityKey);
      return prop?.states.find((s) => s.key === childKey)?.illustrations;
    }
    case 'character': {
      const character = state.characters.find((c) => c.key === entityKey);
      return character?.variants.find((v) => v.key === childKey)?.illustrations;
    }
    case 'stage': {
      const stage = state.stages.find((s) => s.key === entityKey);
      return stage?.settings.find((st) => st.key === childKey)?.illustrations;
    }
    case 'spread_image': {
      const spread = state.retouch.spreads.find((s) => s.id === entityKey);
      return spread?.images.find((img) => img.id === childKey)?.illustrations;
    }
    default:
      log.warn('findIllustrations', `unsupported entity type: ${entityType}`);
      return undefined;
  }
}

/**
 * Prepends a new illustration (selected) to the target, deselecting all existing ones.
 */
function prependIllustration(illustrations: Illustration[], imageUrl: string): void {
  for (const ill of illustrations) {
    ill.is_selected = false;
  }
  illustrations.unshift({
    media_url: imageUrl,
    created_time: new Date().toISOString(),
    is_selected: true,
  });
}

export const createImageTaskSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  ImageTaskSlice
> = (set, get) => ({
  imageTasks: [],

  startGenerateTask: (params) => {
    const { entityType, entityKey, entityName, childKey, childName, description, referenceImages } = params;

    // Block concurrent: 1 task per entity+child at a time
    const existing = get().imageTasks.find(
      (t) => t.entityKey === entityKey && t.childKey === childKey && t.status === 'pending'
    );
    if (existing) {
      log.warn('startGenerateTask', 'blocked — pending task exists', { entityType, entityKey, childKey, existingId: existing.id });
      return;
    }

    const taskId = crypto.randomUUID();
    log.info('startGenerateTask', 'create task', { taskId, entityType, entityKey, childKey });

    // Push task entry
    set((state) => {
      state.imageTasks.push({
        id: taskId,
        entityType,
        entityKey,
        entityName,
        childKey,
        childName,
        taskType: 'generate',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    });

    // Fire API call (fire-and-forget from action perspective)
    callGenerateFromDescription({ description, referenceImages })
      .then((result) => {
        // Guard: check task still exists (may have been cleared by resetSnapshot)
        const taskStillExists = get().imageTasks.some((t) => t.id === taskId);
        if (!taskStillExists) {
          log.warn('startGenerateTask', 'task cancelled — no longer in store', { taskId });
          return;
        }

        if (!result.success || !result.data) {
          throw new Error(result.error ?? 'Generation failed');
        }

        const imageUrl = result.data.imageUrl;
        log.info('startGenerateTask', 'success', { taskId, imageUrl });

        set((state) => {
          // Find target illustrations — entity/child may have been deleted while task was running
          const illustrations = findIllustrations(state, entityType, entityKey, childKey);
          if (illustrations) {
            prependIllustration(illustrations, imageUrl);
            state.sync.isDirty = true;
          }

          // Mark task completed
          const task = state.imageTasks.find((t) => t.id === taskId);
          if (task) {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
          }
        });
      })
      .catch((err) => {
        const taskStillExists = get().imageTasks.some((t) => t.id === taskId);
        if (!taskStillExists) return;

        const msg = err instanceof Error ? err.message : 'Generation failed';
        log.error('startGenerateTask', 'failed', { taskId, error: msg });

        set((state) => {
          const task = state.imageTasks.find((t) => t.id === taskId);
          if (task) {
            task.status = 'error';
            task.error = msg;
            task.completedAt = new Date().toISOString();
          }
        });
      });
  },

  startEditTask: (params) => {
    const { entityType, entityKey, entityName, childKey, childName, prompt, imageUrl, referenceImages, aspectRatio } = params;

    // Block concurrent: 1 task per entity+child at a time
    const existing = get().imageTasks.find(
      (t) => t.entityKey === entityKey && t.childKey === childKey && t.status === 'pending'
    );
    if (existing) {
      log.warn('startEditTask', 'blocked — pending task exists', { entityType, entityKey, childKey, existingId: existing.id });
      return;
    }

    const taskId = crypto.randomUUID();
    log.info('startEditTask', 'create task', { taskId, entityType, entityKey, childKey });

    set((state) => {
      state.imageTasks.push({
        id: taskId,
        entityType,
        entityKey,
        entityName,
        childKey,
        childName,
        taskType: 'edit',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    });

    callEditObjectImage({ prompt, imageUrl, referenceImages, aspectRatio })
      .then((result) => {
        const taskStillExists = get().imageTasks.some((t) => t.id === taskId);
        if (!taskStillExists) {
          log.warn('startEditTask', 'task cancelled — no longer in store', { taskId });
          return;
        }

        if (!result.success || !result.data) {
          throw new Error(result.error ?? 'Edit failed');
        }

        const editedImageUrl = result.data.imageUrl;
        log.info('startEditTask', 'success', { taskId, imageUrl: editedImageUrl });

        set((state) => {
          const illustrations = findIllustrations(state, entityType, entityKey, childKey);
          if (illustrations) {
            prependIllustration(illustrations, editedImageUrl);
            state.sync.isDirty = true;
          }

          const task = state.imageTasks.find((t) => t.id === taskId);
          if (task) {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
          }
        });
      })
      .catch((err) => {
        const taskStillExists = get().imageTasks.some((t) => t.id === taskId);
        if (!taskStillExists) return;

        const msg = err instanceof Error ? err.message : 'Edit failed';
        log.error('startEditTask', 'failed', { taskId, error: msg });

        set((state) => {
          const task = state.imageTasks.find((t) => t.id === taskId);
          if (task) {
            task.status = 'error';
            task.error = msg;
            task.completedAt = new Date().toISOString();
          }
        });
      });
  },

  dismissTask: (taskId) =>
    set((state) => {
      log.debug('dismissTask', 'dismiss', { taskId });
      state.imageTasks = state.imageTasks.filter((t) => t.id !== taskId);
    }),

  clearAllTasks: () =>
    set((state) => {
      log.debug('clearAllTasks', 'clear all');
      state.imageTasks = [];
    }),
});
