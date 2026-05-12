// delete-human-dialog.tsx — AlertDialog confirming destructive human delete.

import { useState } from 'react';
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
import { useCurrentLocale } from '@/hooks/use-current-locale';
import { resolveDisplayName } from '@/features/humans/utils/display-name-helpers';
import { formatProfileSummary } from '@/features/humans/utils/profile-summary';
import { useHumansActions } from '@/stores/humans-store';
import type { Human } from '@/types/human';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'DeleteHumanDialog');

type Step = 'confirm' | 'deleting';

interface DeleteHumanDialogProps {
  human: Human;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteHumanDialog({ human, onClose, onDeleted }: DeleteHumanDialogProps) {
  const { deleteHuman } = useHumansActions();
  const locale = useCurrentLocale();
  const displayName = resolveDisplayName(human, locale);
  const summary = formatProfileSummary(
    human.visualProfiles.length,
    human.voiceProfiles.length,
  );

  const [step, setStep] = useState<Step>('confirm');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    log.info('handleConfirm', 'start', { id: human.id });
    setStep('deleting');
    setError(null);
    const ok = await deleteHuman(human.id);
    if (ok) {
      log.info('handleConfirm', 'done', { id: human.id });
      onDeleted();
      onClose();
      return;
    }
    log.warn('handleConfirm', 'failed', { id: human.id });
    setError('Failed to delete human. Please try again.');
    setStep('confirm');
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (step === 'deleting') return;
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[460px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete human?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="font-medium text-foreground">
              &ldquo;{displayName}&rdquo;
            </strong>{' '}
            will be permanently removed — including {summary}. This action cannot
            be undone.
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
            {step === 'deleting' ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
