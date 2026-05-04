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
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { normalizeTags } from '../utils/audio-filters';
import { mapAudioRow } from '../utils/audio-mapper';
import type { AudioResource, AudioRow, AudioTableName } from '../types';

const log = createLogger('AudioLibrary', 'EditAudioModal');

export interface EditAudioModalProps {
  tableName: AudioTableName;
  resourceTitle: string;
  item: AudioResource;
  tagsPlaceholder?: string;
  onClose: () => void;
  onSaved?: (item: AudioResource) => void;
}

type Step = 'form' | 'saving';

export function EditAudioModal({
  tableName,
  resourceTitle,
  item,
  tagsPlaceholder = 'ambient, nature, forest',
  onClose,
  onSaved,
}: EditAudioModalProps) {
  const initForm = {
    name: item.name,
    tags: item.tags ?? '',
    description: item.description ?? '',
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

    log.info('handleSave', 'start', { id: item.id, tableName });
    setStep('saving');
    setError(null);

    const tagsNorm = normalizeTags(form.tags);
    const dbPatch: Record<string, unknown> = {
      name: trimmedName,
      tags: tagsNorm.length > 0 ? tagsNorm : null,
      description: form.description.trim() || null,
    };

    const { data, error: dbErr } = await supabase
      .from(tableName)
      .update(dbPatch)
      .eq('id', item.id)
      .select('*')
      .single();

    if (dbErr || !data) {
      log.warn('handleSave', 'failed', { id: item.id, code: dbErr?.code });
      setError('Failed to save. Please try again.');
      setStep('form');
      return;
    }

    const updated = mapAudioRow(data as AudioRow);
    log.info('handleSave', 'success', { id: item.id });
    toast.success(`${resourceTitle} updated`);
    onSaved?.(updated);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && step !== 'saving') onClose();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {resourceTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="audio-name">NAME</Label>
            <Input
              id="audio-name"
              autoFocus
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              aria-invalid={!isValid}
              aria-describedby={!isValid ? 'audio-name-error' : undefined}
            />
            {!isValid ? (
              <p id="audio-name-error" className="text-xs text-destructive mt-1">
                Name is required (1-255 characters).
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="audio-tags">TAGS (COMMA-SEPARATED)</Label>
            <Input
              id="audio-tags"
              placeholder={tagsPlaceholder}
              value={form.tags}
              onChange={(e) => handleFieldChange('tags', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="audio-description">DESCRIPTION</Label>
            <Textarea
              id="audio-description"
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
          <Button variant="ghost" onClick={onClose} disabled={step === 'saving'}>
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
