// branch-main-view.tsx - Main grid view for BranchCreativeSpace
"use client";

import { useState, useMemo } from 'react';
import { createLogger } from '@/utils/logger';
import { SpreadViewHeader } from '../canvas-spread-view/spread-view-header';
import { BranchGridBody } from './branch-grid-body';
import { buildGridLayout, computeAdjacentFreeSpreadIds } from './branch-utils';
import { useIllustrationSpreads, useSections } from '@/stores/snapshot-store/selectors';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const log = createLogger('Editor', 'BranchMainView');

interface BranchMainViewProps {
  selectedSpreadId: string | null;
  selectedSectionId: string | null;
  isAddMode: boolean;
  editSectionId: string | null;
  addSectionSelectedIds: string[];
  expandedSectionIds: Set<string>;
  onSpreadSelect: (id: string) => void;
  onSectionSelect: (id: string) => void;
  onSpreadGearClick: (id: string) => void;
  onDeleteSectionRequest: (id: string) => void;
  onAddSectionSpreadToggle: (id: string) => void;
}

export function BranchMainView({
  selectedSpreadId,
  selectedSectionId,
  isAddMode,
  editSectionId,
  addSectionSelectedIds,
  expandedSectionIds,
  onSpreadSelect,
  onSectionSelect,
  onSpreadGearClick,
  onDeleteSectionRequest,
  onAddSectionSpreadToggle,
}: BranchMainViewProps) {
  const spreads = useIllustrationSpreads();
  const sections = useSections();

  const [columnsPerRow, setColumnsPerRow] = useState(4);
  const [confirmDeleteSectionId, setConfirmDeleteSectionId] = useState<string | null>(null);

  const gridItems = useMemo(
    () => buildGridLayout(spreads, sections, expandedSectionIds),
    [spreads, sections, expandedSectionIds],
  );

  const selectableSpreads = useMemo(
    () =>
      isAddMode
        ? computeAdjacentFreeSpreadIds(addSectionSelectedIds, spreads, sections, editSectionId ?? undefined)
        : new Set<string>(),
    [isAddMode, addSectionSelectedIds, spreads, sections, editSectionId],
  );

  const handleDeleteSection = (id: string) => {
    log.debug('BranchMainView', 'delete section requested', { sectionId: id });
    setConfirmDeleteSectionId(id);
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteSectionId) return;
    log.info('BranchMainView', 'delete section confirmed', { sectionId: confirmDeleteSectionId });
    onDeleteSectionRequest(confirmDeleteSectionId);
    setConfirmDeleteSectionId(null);
  };

  const handleCancelDelete = () => {
    log.debug('BranchMainView', 'delete section cancelled');
    setConfirmDeleteSectionId(null);
  };

  log.debug('BranchMainView', 'render', {
    spreadCount: spreads.length,
    sectionCount: sections.length,
    isAddMode,
    columnsPerRow,
  });

  return (
    <div className="flex flex-col h-full">
      <SpreadViewHeader
        viewMode="grid"
        zoomLevel={100}
        columnsPerRow={columnsPerRow}
        onViewModeToggle={() => {}}
        onZoomChange={() => {}}
        onColumnsChange={setColumnsPerRow}
        enableKeyboardShortcuts={false}
        showViewToggle={false}
      />

      <div className="flex-1 overflow-y-auto p-4">
        <BranchGridBody
          gridItems={gridItems}
          columnsPerRow={columnsPerRow}
          selectedSpreadId={selectedSpreadId}
          selectedSectionId={selectedSectionId}
          isAddMode={isAddMode}
          addSectionSelectedIds={addSectionSelectedIds}
          selectableSpreads={selectableSpreads}
          onSpreadSelect={onSpreadSelect}
          onSectionSelect={onSectionSelect}
          onSpreadGearClick={onSpreadGearClick}
          onDeleteSection={handleDeleteSection}
          onAddSectionSpreadToggle={onAddSectionSpreadToggle}
        />
      </div>

      {/* Delete section confirmation dialog */}
      <AlertDialog open={confirmDeleteSectionId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteSectionId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this section? The spreads inside will become free
              spreads. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default BranchMainView;
