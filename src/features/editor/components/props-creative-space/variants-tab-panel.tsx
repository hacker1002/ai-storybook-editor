// variants-tab-panel.tsx - Lists all prop variants as collapsible accordion items

import { useState } from "react";
import type { PropVariant } from "@/types/prop-types";
import { VariantItem } from "./variant-item";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "VariantsTabPanel");

interface VariantsTabPanelProps {
  propKey: string;
  variants: PropVariant[];
}

// NOTE: Parent must render with key={propKey} so this component remounts on prop change,
// resetting expandedVariantKey to the first variant automatically.
export function VariantsTabPanel({ propKey, variants }: VariantsTabPanelProps) {
  const firstKey = variants.length > 0 ? variants[0].key : null;
  log.debug("mount/render", "init", { propKey, firstKey });
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(
    firstKey
  );

  const handleToggle = (variantKey: string) => {
    setExpandedVariantKey((prev) => {
      const next = prev === variantKey ? null : variantKey;
      log.debug("handleToggle", "toggle variant", { variantKey, next });
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
      {variants.map((v) => (
        <VariantItem
          key={v.key}
          propKey={propKey}
          variantData={v}
          isExpanded={expandedVariantKey === v.key}
          onToggle={() => handleToggle(v.key)}
        />
      ))}
    </div>
  );
}
