// sketch-entity-sidebar.tsx — left sidebar: header (check-all + title + count + import)
// and the entity list. `＋` opens a hidden file picker → onImport(file) (Excel import,
// NOT manual add). Two distinct selections: row select (focus) vs checkbox (bulk).

import { useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { SketchEntityListItem } from './sketch-entity-list-item';
import type { KindConfig } from './sketch-variants-constants';
import type { SketchEntityKind } from '@/types/sketch';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchEntitySidebar');

interface SketchEntitySidebarProps {
  kind: SketchEntityKind;
  cfg: KindConfig;
  entityKeys: string[];
  selectedEntityKey: string | null;
  checkedKeys: string[];
  onSelect: (k: string) => void;
  onCheck: (k: string, next: boolean) => void;
  onCheckAll: (next: boolean) => void;
  onEdit: (k: string) => void;
  onDelete: (k: string) => void;
  onImport: (f: File) => void;
  isImporting: boolean;
}

export function SketchEntitySidebar({
  kind,
  cfg,
  entityKeys,
  selectedEntityKey,
  checkedKeys,
  onSelect,
  onCheck,
  onCheckAll,
  onEdit,
  onDelete,
  onImport,
  isImporting,
}: SketchEntitySidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Checkbox primitive is boolean-only (no native indeterminate). Check-all reflects
  // "all selected"; clicking it selects all / clears all.
  const allChecked = entityKeys.length > 0 && checkedKeys.length === entityKeys.length;

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-selecting the SAME file still fires onChange.
    e.target.value = '';
    if (!file) return;
    log.info('handleFileChange', 'file selected', { kind, fileName: file.name });
    onImport(file);
  };

  return (
    <aside
      className="flex flex-col h-full border-r min-w-[240px] max-w-[320px] w-1/4"
      role="navigation"
      aria-label={`${cfg.title} sidebar`}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-11 px-3 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox
            checked={allChecked}
            disabled={entityKeys.length === 0}
            onCheckedChange={onCheckAll}
            aria-label={`Select all ${cfg.title.toLowerCase()}`}
          />
          <span className="text-sm font-semibold truncate">{cfg.title}</span>
          <span className="text-xs text-muted-foreground">{entityKeys.length}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleImportClick}
          disabled={isImporting}
          aria-label={`Import ${cfg.title.toLowerCase()} from Excel`}
        >
          {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* List */}
      <div
        className={cn('flex-1 overflow-y-auto p-2 space-y-1', isImporting && 'opacity-50 pointer-events-none')}
        role="list"
        aria-label={`${cfg.title} list`}
      >
        {entityKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-sm text-muted-foreground mb-2">No {cfg.title.toLowerCase()} yet</p>
            <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting}>
              <Upload className="h-3 w-3 mr-1" /> Import Excel
            </Button>
          </div>
        ) : (
          entityKeys.map((key) => (
            <SketchEntityListItem
              key={key}
              kind={kind}
              entityKey={key}
              noun={cfg.noun}
              isSelected={key === selectedEntityKey}
              isChecked={checkedKeys.includes(key)}
              onSelect={() => onSelect(key)}
              onCheck={(next) => onCheck(key, next)}
              onEdit={() => onEdit(key)}
              onDelete={() => onDelete(key)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
