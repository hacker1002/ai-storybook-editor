// use-image-task-notifications.ts - Watches store image tasks and fires toasts on completion/error.
// Mount at editor page level so notifications appear regardless of which tab the user is on.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { ImageTask } from '@/stores/snapshot-store/types';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ImageTaskNotifications');

/**
 * Side-effect-only hook: subscribes to imageTasks changes and fires toast
 * notifications when tasks transition to completed or error status.
 */
export function useImageTaskNotifications(): void {
  const prevTasksRef = useRef<ImageTask[]>([]);
  const imageTasks = useSnapshotStore((s) => s.imageTasks);

  useEffect(() => {
    const prev = prevTasksRef.current;

    // Detect tasks that just transitioned to completed or error
    const newlyFinished = imageTasks.filter(
      (t) =>
        (t.status === 'completed' || t.status === 'error') &&
        !prev.find((p) => p.id === t.id && p.status === t.status)
    );

    for (const task of newlyFinished) {
      if (task.status === 'completed') {
        const action = task.taskType === 'generate' ? 'generated' : 'edited';
        log.info('toast', 'task completed', { taskId: task.id, taskType: task.taskType, entityName: task.entityName, childName: task.childName });
        toast.success(`Image ${action} for "${task.entityName} / ${task.childName}"`);
      } else if (task.status === 'error') {
        log.warn('toast', 'task failed', { taskId: task.id, error: task.error });
        toast.error(task.error || 'Image operation failed');
      }
    }

    // Batch dismiss all finished tasks in a single store update
    if (newlyFinished.length > 0) {
      const idsToRemove = new Set(newlyFinished.map((t) => t.id));
      useSnapshotStore.setState((state) => {
        state.imageTasks = state.imageTasks.filter((t) => !idsToRemove.has(t.id));
      });
    }

    prevTasksRef.current = imageTasks;
  }, [imageTasks]);
}
