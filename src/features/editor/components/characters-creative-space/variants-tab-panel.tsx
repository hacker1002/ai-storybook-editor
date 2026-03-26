// variants-tab-panel.tsx - Lists all character variants as collapsible accordion items

import { useState } from 'react';
import type { CharacterVariant } from '@/types/character-types';
import { VariantItem } from './variant-item';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'VariantsTabPanel');

interface VariantsTabPanelProps {
  characterKey: string;
  variants: CharacterVariant[];
}

// Parent renders with key={characterKey} so this component remounts on character change,
// resetting expandedVariantKey to the first variant automatically via initial state.
export function VariantsTabPanel({ characterKey, variants }: VariantsTabPanelProps) {
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(
    variants.length > 0 ? variants[0].key : null
  );

  const handleToggle = (variantKey: string) => {
    setExpandedVariantKey((prev) => {
      const next = prev === variantKey ? null : variantKey;
      log.debug('handleToggle', 'toggle variant', { variantKey, next });
      return next;
    });
  };

  if (variants.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No variants yet. Click + to add one.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-100px)]">
      {variants.map((variant) => (
        <VariantItem
          key={variant.key}
          characterKey={characterKey}
          variantData={variant}
          isExpanded={expandedVariantKey === variant.key}
          onToggle={() => handleToggle(variant.key)}
        />
      ))}
    </div>
  );
}
