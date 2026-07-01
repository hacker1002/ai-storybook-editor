// sketch-entity-content-area.tsx — right pane: toolbar (heading + Generate stub) and
// the entity sheet preview. Generate is a visible NO-OP this pass (endpoint TBD); its
// label reflects the bulk selection (`Generate` / `Generate (N)`).

import { Sparkles, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSketchEntityByKey } from '@/stores/snapshot-store/selectors';
import type { SketchEntityKind } from '@/types/sketch';
import { titleCase, type KindConfig } from './sketch-variants-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchEntityContentArea');

interface SketchEntityContentAreaProps {
  kind: SketchEntityKind;
  cfg: KindConfig;
  selectedEntityKey: string;
  checkedKeys: string[];
}

export function SketchEntityContentArea({
  kind,
  cfg,
  selectedEntityKey,
  checkedKeys,
}: SketchEntityContentAreaProps) {
  const entity = useSketchEntityByKey(kind, selectedEntityKey);
  const name = titleCase(selectedEntityKey);
  const checkedCount = checkedKeys.length;
  const generateLabel = checkedCount > 0 ? `Generate (${checkedCount})` : 'Generate';

  // Stub: generate sheet flow is out of scope (endpoint TBD). Button is disabled.
  const handleGenerate = () => {
    log.debug('handleGenerate', 'stub no-op', { kind, selectedEntityKey, checkedCount });
  };

  return (
    <div className="flex flex-col h-full" role="region" aria-label={`${cfg.noun} content`}>
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Button size="sm" onClick={handleGenerate} disabled aria-label={generateLabel}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          {generateLabel}
        </Button>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
        {entity?.media_url ? (
          <img
            src={entity.media_url}
            alt={`${name} sheet`}
            className="max-h-full max-w-full object-contain rounded-md"
          />
        ) : (
          <div className="flex flex-col items-center text-center text-muted-foreground">
            <ImageOff className="h-10 w-10 mb-3 opacity-60" aria-hidden="true" />
            <p className="text-sm">No sheet generated yet</p>
            <p className="text-xs mt-1">
              Generate a {cfg.noun} sheet to preview it here (coming soon).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
