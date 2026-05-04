import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/apis/supabase';
import { parseStoragePathFromUrl } from '@/features/sounds/utils/storage-path-parser';
import { useSoundsActions } from '@/stores/sounds-store';
import type { Sound } from '@/types/sound';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'DeleteSoundDialog');

const STORAGE_BUCKET = 'storybook-assets';

interface DeleteSoundDialogProps {
  sound: Sound;
  onClose: () => void;
  onDeleted?: (soundId: string) => void;
}

type Step = 'confirm' | 'deleting';

export function DeleteSoundDialog({
  sound,
  onClose,
  onDeleted,
}: DeleteSoundDialogProps) {
  const { deleteSound } = useSoundsActions();
  const [step, setStep] = useState<Step>('confirm');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    log.info('handleConfirm', 'start', { soundId: sound.id, name: sound.name });
    setStep('deleting');
    setError(null);

    const ok = await deleteSound(sound.id);
    if (!ok) {
      log.warn('handleConfirm', 'db delete failed', { soundId: sound.id });
      setError('Failed to delete sound. Please try again.');
      setStep('confirm');
      return;
    }

    // Best-effort Storage cleanup. DB row is already gone — never throw here.
    const path = parseStoragePathFromUrl(sound.mediaUrl);
    if (path) {
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([path]);
      if (rmErr) {
        log.warn('handleConfirm', 'storage cleanup failed', {
          path,
          err: rmErr.message,
        });
      } else {
        log.debug('handleConfirm', 'storage cleanup ok', { path });
      }
    } else {
      log.warn('handleConfirm', 'cannot parse storage path, skipping cleanup', {
        url: (sound.mediaUrl ?? '').slice(0, 60),
      });
    }

    log.info('handleConfirm', 'success', { soundId: sound.id });
    toast.success('Sound deleted');
    onDeleted?.(sound.id);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && step === 'deleting') return;
    if (!open) onClose();
  };

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete sound?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="font-medium text-foreground">
              &ldquo;{sound.name}&rdquo;
            </strong>{' '}
            will be permanently deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? (
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={step === 'deleting'}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={step === 'deleting'}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {step === 'deleting' ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
