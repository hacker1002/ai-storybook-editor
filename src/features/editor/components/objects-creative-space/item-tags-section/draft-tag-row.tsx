// draft-tag-row.tsx - Local draft row awaiting subject selection before being committed

import { X } from 'lucide-react';
import { ObjectDropdown } from './object-dropdown';
import { VariantDropdown } from './variant-dropdown';
import { BASE_VARIANT_NAME } from '@/constants/variant-constants';
import type { ObjectOption } from './tag-utils';

interface DraftTagRowProps {
  draftId: string;
  objectOptions: ObjectOption[];
  onPickObject: (draftId: string, opt: ObjectOption) => void;
  onRemove: (draftId: string) => void;
  disabled?: boolean;
}

export function DraftTagRow({
  draftId,
  objectOptions,
  onPickObject,
  onRemove,
  disabled,
}: DraftTagRowProps) {
  return (
    <li role="listitem" className="flex items-center gap-1">
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <ObjectDropdown
          options={objectOptions}
          value={null}
          onChange={(opt) => onPickObject(draftId, opt)}
          disabled={disabled}
          placeholder="Pick subject..."
          ariaLabel="New tag subject"
        />
        {/* Variant locked until object is picked (promote to committed on object pick) */}
        <VariantDropdown
          variants={[]}
          value={undefined}
          taken={new Set()}
          onChange={() => undefined}
          disabled
          placeholder={BASE_VARIANT_NAME}
          ariaLabel="New tag variant"
        />
      </div>
      <button
        type="button"
        aria-label="Remove tag"
        onClick={() => onRemove(draftId)}
        disabled={disabled}
        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
