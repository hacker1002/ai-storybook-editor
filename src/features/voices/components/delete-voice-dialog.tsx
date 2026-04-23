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
import { useVoicesActions } from '@/stores/voices-store';
import type { Voice } from '@/types/voice';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'DeleteVoiceDialog');

interface DeleteVoiceDialogProps {
  voice: Voice;
  onClose: () => void;
  onDeleted?: (voiceId: string) => void;
}

type Step = 'confirm' | 'deleting';

export function DeleteVoiceDialog({
  voice,
  onClose,
  onDeleted,
}: DeleteVoiceDialogProps) {
  const { deleteVoice } = useVoicesActions();
  const [step, setStep] = useState<Step>('confirm');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    log.info('handleConfirm', 'start', { voiceId: voice.id, name: voice.name });
    setStep('deleting');
    setError(null);

    const ok = await deleteVoice(voice.id);
    if (ok) {
      log.info('handleConfirm', 'success', { voiceId: voice.id });
      toast.success('Voice deleted');
      onDeleted?.(voice.id);
      onClose();
      return;
    }

    log.warn('handleConfirm', 'failed', { voiceId: voice.id });
    setError('Failed to delete voice. Please try again.');
    setStep('confirm');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && step === 'deleting') return;
    if (!open) onClose();
  };

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete voice?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="font-medium text-foreground">
              &ldquo;{voice.name}&rdquo;
            </strong>{' '}
            will be permanently removed. This action cannot be undone.
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
