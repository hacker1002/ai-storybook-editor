import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { normalizeTags } from '@/features/voices/utils/voice-filters';
import { useVoicesActions } from '@/stores/voices-store';
import type { Voice } from '@/types/voice';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'EditVoiceModal');

interface EditVoiceModalProps {
  voice: Voice;
  onClose: () => void;
  onSaved?: (voice: Voice) => void;
}

type Step = 'form' | 'saving';

export function EditVoiceModal({ voice, onClose, onSaved }: EditVoiceModalProps) {
  const { updateVoice } = useVoicesActions();

  const initForm = {
    name: voice.name,
    description: voice.description ?? '',
    tags: voice.tags ?? '',
  };
  const [form, setForm] = useState(initForm);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    form.name !== initForm.name ||
    form.description !== initForm.description ||
    form.tags !== initForm.tags;
  const isValid = form.name.trim().length >= 1;

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async () => {
    if (!isDirty || !isValid) return;

    log.info('handleSave', 'start', { voiceId: voice.id });
    setStep('saving');
    setError(null);

    const patch = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      tags: normalizeTags(form.tags) || null,
    };

    const updated = await updateVoice(voice.id, patch);
    if (updated) {
      log.info('handleSave', 'success', { voiceId: voice.id });
      toast.success('Voice updated');
      onSaved?.(updated);
      onClose();
      return;
    }

    log.warn('handleSave', 'failed', { voiceId: voice.id });
    setError('Failed to save. Please try again.');
    setStep('form');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && step !== 'saving') onClose();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Voice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="voice-name">NAME</Label>
            <Input
              id="voice-name"
              autoFocus
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              aria-invalid={!isValid}
              aria-describedby={!isValid ? 'name-error' : undefined}
            />
            {!isValid ? (
              <p id="name-error" className="text-xs text-destructive mt-1">
                Name is required.
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="voice-description">DESCRIPTION</Label>
            <Textarea
              id="voice-description"
              rows={3}
              value={form.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="voice-tags">TAGS (COMMA-SEPARATED)</Label>
            <Input
              id="voice-tags"
              placeholder="narration, warm"
              value={form.tags}
              onChange={(e) => handleFieldChange('tags', e.target.value)}
            />
          </div>

          {error ? (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={step === 'saving'}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || !isValid || step === 'saving'}
          >
            {step === 'saving' ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
