// section-settings-modal.tsx - Modal for configuring section end-spread navigation behavior
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  useSectionById,
  useIllustrationSpreads,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import type { NavigationMode } from './branch-types';

const log = createLogger('Editor', 'SectionSettingsModal');

interface SectionSettingsModalProps {
  sectionId: string;
  onClose: () => void;
}

function deriveInitialState(
  nextId: string | null | undefined,
): { mode: NavigationMode; targetSpreadId: string } {
  if (nextId == null) {
    return { mode: 'next-in-order', targetSpreadId: '' };
  }
  return { mode: 'specific-spread', targetSpreadId: nextId };
}

export function SectionSettingsModal({ sectionId, onClose }: SectionSettingsModalProps) {
  const section = useSectionById(sectionId);
  const spreads = useIllustrationSpreads();
  const { setNextSpreadId, clearNextSpreadId } = useSnapshotActions();

  const initial = deriveInitialState(section?.next_spread_id);

  const [mode, setMode] = useState<NavigationMode>(initial.mode);
  const [targetSpreadId, setTargetSpreadId] = useState(initial.targetSpreadId);

  if (!section) return null;

  const isSaveDisabled = mode === 'specific-spread' && !targetSpreadId;

  const handleSave = () => {
    log.info('handleSave', 'saving section navigation', { sectionId, mode });

    if (mode === 'next-in-order') {
      clearNextSpreadId(sectionId);
    } else {
      setNextSpreadId(sectionId, targetSpreadId);
    }
    onClose();
  };

  const radioOption = (
    value: NavigationMode,
    label: string,
    description: string,
  ) => (
    <label
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer',
        'hover:bg-muted/50 transition-colors',
        '[&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5',
      )}
    >
      <input
        type="radio"
        name="nav-mode"
        value={value}
        checked={mode === value}
        onChange={() => {
          log.debug('radioOption', 'mode changed', { value });
          setMode(value);
        }}
        className="accent-primary"
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt Section</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{section.title}</p>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {radioOption('next-in-order', 'Tiếp tục theo thứ tự', 'Chuyển đến spread tiếp theo trong danh sách')}

          <div className="flex flex-col gap-2">
            {radioOption('specific-spread', 'Đến spread cụ thể', 'Chọn một spread bất kỳ để chuyển đến')}
            {mode === 'specific-spread' && (
              <div className="pl-9">
                <Select value={targetSpreadId} onValueChange={setTargetSpreadId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Chọn spread..." />
                  </SelectTrigger>
                  <SelectContent>
                    {spreads.map((spread) => {
                      const pageLabel = spread.pages.length > 0
                        ? `Page ${spread.pages.map((p) => p.number).join('-')}`
                        : `Spread ${spread.id.slice(0, 6)}`;
                      return (
                        <SelectItem key={spread.id} value={spread.id}>
                          {pageLabel}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button size="sm" disabled={isSaveDisabled} onClick={handleSave}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SectionSettingsModal;
