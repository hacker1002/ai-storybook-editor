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
import { normalizeTags } from '@/features/sounds/utils/sound-filters';
import { useSoundsActions } from '@/stores/sounds-store';
import type { Sound } from '@/types/sound';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'EditSoundModal');

interface EditSoundModalProps {
  sound: Sound;
  onClose: () => void;
  onSaved?: (sound: Sound) => void;
}

type Step = 'form' | 'saving';

export function EditSoundModal({ sound, onClose, onSaved }: EditSoundModalProps) {
  const { updateSound } = useSoundsActions();

  const initForm = {
    name: sound.name,
    tags: sound.tags ?? '',
    description: sound.description ?? '',
  };
  const [form, setForm] = useState(initForm);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    form.name !== initForm.name ||
    form.tags !== initForm.tags ||
    form.description !== initForm.description;
  const trimmedName = form.name.trim();
  const isValid = trimmedName.length >= 1 && trimmedName.length <= 255;

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async () => {
    if (!isDirty || !isValid) {
      log.debug('handleSave', 'guard blocked', { isDirty, isValid });
      return;
    }

    log.info('handleSave', 'start', { soundId: sound.id });
    setStep('saving');
    setError(null);

    const patch = {
      name: trimmedName,
      tags: normalizeTags(form.tags) || null,
      description: form.description.trim() || null,
    };

    const updated = await updateSound(sound.id, patch);
    if (updated) {
      log.info('handleSave', 'success', { soundId: sound.id });
      toast.success('Sound updated');
      onSaved?.(updated);
      onClose();
      return;
    }

    log.warn('handleSave', 'failed', { soundId: sound.id });
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
          <DialogTitle>Edit Sound</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="sound-name">NAME</Label>
            <Input
              id="sound-name"
              autoFocus
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              aria-invalid={!isValid}
              aria-describedby={!isValid ? 'sound-name-error' : undefined}
            />
            {!isValid ? (
              <p
                id="sound-name-error"
                className="text-xs text-destructive mt-1"
              >
                Name is required (1-255 characters).
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="sound-tags">TAGS (COMMA-SEPARATED)</Label>
            <Input
              id="sound-tags"
              placeholder="ambient, nature, forest"
              value={form.tags}
              onChange={(e) => handleFieldChange('tags', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="sound-description">DESCRIPTION</Label>
            <Textarea
              id="sound-description"
              rows={3}
              value={form.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
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
