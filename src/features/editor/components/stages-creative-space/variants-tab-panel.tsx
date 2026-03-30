// variants-tab-panel.tsx - Lists all stage variants as collapsible accordion items

import { useState } from 'react';
import type { StageVariant } from '@/types/stage-types';
import { VariantItem } from './variant-item';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'VariantsTabPanel');

interface VariantsTabPanelProps {
  stageKey: string;
  variants: StageVariant[];
}

// NOTE: Parent must render with key={stageKey} so this component remounts on stage change,
// resetting expandedVariantKey to the first variant automatically.
export function VariantsTabPanel({ stageKey, variants }: VariantsTabPanelProps) {
  const firstKey = variants.length > 0 ? variants[0].key : null;
  log.debug('mount/render', 'init', { stageKey, firstKey });
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(firstKey);

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
          stageKey={stageKey}
          variantData={variant}
          isExpanded={expandedVariantKey === variant.key}
          onToggle={() => handleToggle(variant.key)}
        />
      ))}
    </div>
  );
}
