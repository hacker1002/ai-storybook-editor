// create-asset-dialog.tsx - Reusable modal for creating named assets with auto-derived key and collision detection.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nameToKey, isKeyTaken } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'CreateAssetDialog');

export interface CreateAssetDialogProps {
  /** Controls modal visibility — parent owns this state */
  open: boolean;
  /** Fires when modal should close (Cancel, Escape, click outside, or after Create) */
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. "Create Character", "Create Variant" */
  title: string;
  /** Dialog description shown under title */
  description: string;
  /** Placeholder for the Name input, e.g. "e.g. Hero" */
  namePlaceholder: string;
  /** Existing keys in scope — used for collision detection */
  existingKeys: string[];
  /** Called when user confirms with a valid name + unique key */
  onCreate: (name: string, key: string) => void;
}

export function CreateAssetDialog({
  open,
  onOpenChange,
  title,
  description,
  namePlaceholder,
  existingKeys,
  onCreate,
}: CreateAssetDialogProps) {
  const [name, setName] = useState('');

  // Reset state each time modal opens
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const trimmedName = name.trim();
  const key = trimmedName === '' ? '' : nameToKey(trimmedName);

  const error: string | null =
    trimmedName === ''
      ? null
      : key === ''
        ? 'Invalid name'
        : isKeyTaken(key, existingKeys)
          ? 'Name already exists'
          : null;

  const isValid = trimmedName !== '' && key !== '' && error === null;

  const handleCreate = () => {
    if (!isValid) return;
    log.info('handleCreate', 'submitting', { keyLength: key.length, existingKeysCount: existingKeys.length });
    onCreate(trimmedName, key);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                log.debug('name changed', 'input', { nameLength: e.target.value.length });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder={namePlaceholder}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Key</label>
            <Input
              value={key}
              readOnly
              className="bg-muted text-muted-foreground"
              placeholder="Auto-generated from name"
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!isValid}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
