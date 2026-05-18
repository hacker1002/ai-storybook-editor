// swap-crop-sheet-modal.tsx — Preview/refine modal for a single remix entity's
// crop-sheet swap results. One tab per crop_sheets[] entry; each tab compares
// the original vs the selected swap result via SwapComparePanel.
//
// DEFERRED boundary: `startCropSheetSwap` is a guarded no-op until the swap API
// ships (design §5 open item). The [⇄ Swap] button is therefore hard-disabled
// with an explanatory tooltip; refine submit is wired but also a no-op. Every
// trigger path is kept live so a future phase only fills in the POST branch.

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowLeftRight, FileQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/features/editor/components/canvas-spread-view/empty-state';
import { EditImagePopover } from '@/features/editor/components/shared-components';
import {
  useCropSheetSwapTask,
  useRemixActions,
  useRemixEntity,
} from '@/stores/remix-store';
import { useReferenceImagePicker } from '@/features/editor/hooks/use-reference-image-picker';
import { createLogger } from '@/utils/logger';
import type { SwapCropSheetTarget } from '@/types/remix';
import { CropSheetTabs } from './crop-sheet-tabs';
import { SwapComparePanel } from './swap-compare-panel';

const log = createLogger('Editor', 'SwapCropSheetModal');

// DEFERRED — swap API endpoint not yet implemented (see file header + Phase 01).
const SWAP_DISABLED_REASON = 'Swap API not yet available';

interface Props {
  target: SwapCropSheetTarget;
  onClose: () => void;
}

export function SwapCropSheetModal({ target, onClose }: Props) {
  const entity = useRemixEntity(target.remixId, target.type, target.key);
  const { startCropSheetSwap } = useRemixActions();
  // Destructured at call site so the `react-hooks/refs` rule analyses each
  // binding on its own (a bare `picker.x` taints the whole object via inputRef).
  const {
    images,
    inputRef,
    openPicker,
    handleFilesSelected,
    removeImage,
    clearImages,
  } = useReferenceImagePicker(5);

  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [dividerPosition, setDividerPosition] = useState(50);
  const [isEditOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');

  // Focus-restore: modal is mounted off `swapTarget` state (no DialogTrigger),
  // and the parent unmounts it abruptly on close — Radix's own focus restore
  // is unreliable here. Capture the opener ([👁]) on mount, restore on unmount.
  const triggerElRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    triggerElRef.current = document.activeElement as HTMLElement | null;
    return () => triggerElRef.current?.focus();
  }, []);

  // Entity removed (e.g. realtime delete) → close + notify.
  useEffect(() => {
    if (entity === null) {
      log.warn('render', 'entity resolved null — closing', {
        type: target.type,
        key: target.key,
      });
      toast.info('Entity was deleted');
      onClose();
    }
  }, [entity, onClose, target.type, target.key]);

  const sheets = entity?.crop_sheets ?? [];
  const safeIndex = Math.min(
    Math.max(activeSheetIndex, 0),
    Math.max(0, sheets.length - 1),
  );
  const activeSheet = sheets[safeIndex] ?? null;
  const swapTask = useCropSheetSwapTask(
    target.remixId,
    target.type,
    target.key,
    safeIndex,
  );

  const selectedSwap = activeSheet
    ? (activeSheet.swap_results.find((r) => r.is_selected) ??
      activeSheet.swap_results.at(-1) ??
      null)
    : null;

  const isBusy = swapTask.state === 'running'; // no-op deferred → always false
  const busyLabel =
    swapTask.state === 'running' && swapTask.mode === 'refine'
      ? 'Refining…'
      : 'Swapping…';
  const errorMsg = swapTask.state === 'error' ? swapTask.message : null;

  const handleSelectTab = (index: number) => {
    log.debug('handleSelectTab', 'switch tab', { from: safeIndex, to: index });
    setActiveSheetIndex(index);
    setDividerPosition(50);
    setEditOpen(false);
  };

  const handleSwap = () => {
    log.debug('handleSwap', 'trigger swap', { sheetIndex: safeIndex });
    void startCropSheetSwap({
      remixId: target.remixId,
      type: target.type,
      key: target.key,
      cropSheetIndex: safeIndex,
      mode: 'swap',
    });
  };

  const handleRefineSubmit = () => {
    const refs = images.map((i) => ({
      label: i.label,
      base64Data: i.base64Data,
      mimeType: i.mimeType,
    }));
    log.debug('handleRefineSubmit', 'trigger refine', {
      sheetIndex: safeIndex,
      refCount: refs.length,
    });
    setEditOpen(false);
    void startCropSheetSwap({
      remixId: target.remixId,
      type: target.type,
      key: target.key,
      cropSheetIndex: safeIndex,
      mode: 'refine',
      prompt: editPrompt,
      referenceImages: refs,
    });
    setEditPrompt('');
    clearImages();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview — {entity?.name ?? '…'}</DialogTitle>
          <DialogDescription className="sr-only">
            Compare and refine the AI swap result for each of the entity's crop
            sheets.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden file input — MUST live outside EditImagePopover's
            PopoverContent (its subtree unmounts on popover close). */}
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFilesSelected}
        />

        {sheets.length === 0 ? (
          <EmptyState
            icon={<FileQuestion className="h-12 w-12" />}
            title="This entity has no crop sheets yet"
            description="Crop sheets are generated automatically from layers tagged to this entity."
          />
        ) : (
          <>
            <CropSheetTabs
              sheets={sheets}
              activeIndex={safeIndex}
              onSelect={handleSelectTab}
            />

            {activeSheet && (
              <SwapComparePanel
                // Key by sheet index so a tab switch always remounts the panel
                // (resets divider + image state). Crop sheets seed image_url='',
                // so a URL-only key collides across non-swapped sheets.
                key={safeIndex}
                originalUrl={activeSheet.image_url}
                swappedUrl={selectedSwap?.media_url ?? null}
                dividerPosition={dividerPosition}
                onDividerChange={setDividerPosition}
                busy={isBusy}
                busyLabel={busyLabel}
                errorMsg={errorMsg}
                editSlot={
                  <EditImagePopover
                    open={isEditOpen}
                    onOpenChange={setEditOpen}
                    promptValue={editPrompt}
                    onPromptChange={setEditPrompt}
                    onSubmit={handleRefineSubmit}
                    referenceImages={images.map((i) => ({
                      label: i.label,
                    }))}
                    onAttachClick={openPicker}
                    onRemoveReference={removeImage}
                    disabled={isBusy || selectedSwap === null}
                    triggerAriaLabel="Refine swap image"
                  />
                }
              />
            )}

            <DialogFooter>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span wrapper — a disabled button swallows hover events,
                        so the tooltip anchors to the span. No tabIndex/role:
                        a focusable element with no role would mislead SR users;
                        the disabled reason is folded into the button aria-label. */}
                    <span>
                      <Button
                        aria-label={`Swap crop sheet — ${SWAP_DISABLED_REASON}`}
                        aria-busy={isBusy}
                        // DEFERRED: hard-disabled until the swap API ships.
                        // Future phase → `disabled={isBusy}` + drop the tooltip.
                        disabled
                        onClick={handleSwap}
                        className="gap-1.5"
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                        {isBusy ? 'Swapping…' : 'Swap'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{SWAP_DISABLED_REASON}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
