// committed-tag-row.tsx - A persisted tag row with object + variant dropdowns and remove button

import { X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ObjectDropdown } from './object-dropdown';
import { VariantDropdown } from './variant-dropdown';
import type { ObjectOption, VariantOption } from './tag-utils';
import type { SpreadTag, SpreadTagType } from '@/types/spread-types';

interface CommittedTagRowProps {
  tag: SpreadTag;
  index: number;
  objectOptions: ObjectOption[];
  variants: VariantOption[];
  takenVariants: Set<string>;
  isDangling: boolean;
  onPickObject: (index: number, opt: ObjectOption) => void;
  onPickVariant: (index: number, variantKey: string) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

export function CommittedTagRow({
  tag,
  index,
  objectOptions,
  variants,
  takenVariants,
  isDangling,
  onPickObject,
  onPickVariant,
  onRemove,
  disabled,
}: CommittedTagRowProps) {
  return (
    <li role="listitem" className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <ObjectDropdown
              options={objectOptions}
              value={{ type: tag.type as SpreadTagType, object_key: tag.object_key }}
              onChange={(opt) => onPickObject(index, opt)}
              disabled={disabled}
              ariaLabel={`Tag ${index + 1} subject`}
            />
            {tag.type !== 'other' && (
              <VariantDropdown
                variants={variants}
                value={tag.variant_key ?? ''}
                taken={takenVariants}
                onChange={(vk) => onPickVariant(index, vk)}
                disabled={disabled}
                ariaLabel={`Tag ${index + 1} variant`}
              />
            )}
          </div>
        </TooltipTrigger>
        {isDangling && (
          <TooltipContent side="top" className="text-xs max-w-48">
            Subject no longer exists. Re-pick or remove this tag.
          </TooltipContent>
        )}
      </Tooltip>
      <button
        type="button"
        aria-label="Remove tag"
        onClick={() => onRemove(index)}
        disabled={disabled}
        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
