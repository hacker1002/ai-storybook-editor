// branch-creative-space.tsx - Root container for branch creative space

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createLogger } from '@/utils/logger';
import {
  useIllustrationSpreadIds,
  useIllustrationSpreads,
  useSections,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { BranchSidebar } from './branch-sidebar';
import { BranchMainView } from './branch-main-view';
import { StoryBranchingModal } from './story-branching-modal';
import { SectionSettingsModal } from './section-settings-modal';

const log = createLogger('Editor', 'BranchCreativeSpace');

export function BranchCreativeSpace() {
  const spreadIds = useIllustrationSpreadIds();
  const spreads = useIllustrationSpreads();
  const sections = useSections();
  const { addSection, updateSection, deleteSection, clearNextSpreadId } = useSnapshotActions();

  // Selection state — spread and section are mutually exclusive
  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const selectedSpreadId = useMemo(() => {
    if (userSelectedSpreadId && spreadIds.includes(userSelectedSpreadId)) {
      return userSelectedSpreadId;
    }
    return spreadIds[0] ?? null;
  }, [spreadIds, userSelectedSpreadId]);

  // Add section mode
  const [isAddMode, setIsAddMode] = useState(false);
  const [addSectionTitle, setAddSectionTitle] = useState('');
  const [addSectionSelectedIds, setAddSectionSelectedIds] = useState<string[]>([]);

  // Edit section mode — reuses add mode state with a target section ID
  const [editSectionId, setEditSectionId] = useState<string | null>(null);

  // Expanded sections — all expanded by default
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(sections.map((s) => s.id)),
  );

  // Auto-expand newly added sections (without re-expanding collapsed ones)
  const knownSectionIdsRef = useRef(new Set(sections.map((s) => s.id)));
  useEffect(() => {
    const known = knownSectionIdsRef.current;
    const newIds = sections.filter((s) => !known.has(s.id)).map((s) => s.id);
    if (newIds.length > 0) {
      log.debug('BranchCreativeSpace', 'auto-expanding new sections', { newIds });
      setExpandedSectionIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.add(id);
        return next;
      });
    }
    knownSectionIdsRef.current = new Set(sections.map((s) => s.id));
  }, [sections]);

  // Modal states
  const [branchModalSpreadId, setBranchModalSpreadId] = useState<string | null>(null);
  const [sectionSettingsId, setSectionSettingsId] = useState<string | null>(null);

  // Handlers — Spread selection (clears section selection)
  const handleSpreadSelect = useCallback((id: string) => {
    log.info('handleSpreadSelect', 'selected', { spreadId: id });
    setUserSelectedSpreadId(id);
    setSelectedSectionId(null);
  }, []);

  // Handlers — Section selection (clears spread selection)
  const handleSectionSelect = useCallback((id: string) => {
    log.info('handleSectionSelect', 'selected', { sectionId: id });
    setSelectedSectionId((prev) => (prev === id ? null : id));
    setUserSelectedSpreadId(null);
  }, []);

  // Handlers — Add section mode
  const handleStartAddMode = useCallback(() => {
    log.info('handleStartAddMode', 'started');
    setIsAddMode(true);
    setAddSectionTitle('');
    setAddSectionSelectedIds([]);
  }, []);

  const handleCancelAddMode = useCallback(() => {
    log.debug('handleCancelAddMode', 'cancelled');
    setIsAddMode(false);
    setEditSectionId(null);
    setAddSectionTitle('');
    setAddSectionSelectedIds([]);
  }, []);

  const handleConfirmAddSection = useCallback(() => {
    if (!addSectionTitle.trim() || addSectionSelectedIds.length === 0) return;

    // Sort selected IDs by their position in spreads array
    const indexMap = new Map(spreads.map((sp, i) => [sp.id, i]));
    const sorted = [...addSectionSelectedIds].sort(
      (a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0),
    );

    const endSpreadId = sorted[sorted.length - 1];

    if (editSectionId) {
      // Update existing section
      updateSection(editSectionId, {
        title: addSectionTitle.trim(),
        start_spread_id: sorted[0],
        end_spread_id: endSpreadId,
      });
      log.info('handleConfirmAddSection', 'updated', { sectionId: editSectionId, count: sorted.length });
    } else {
      // Create new section
      const newSectionId = crypto.randomUUID();
      addSection({
        id: newSectionId,
        title: addSectionTitle.trim(),
        start_spread_id: sorted[0],
        end_spread_id: endSpreadId,
      });
      setExpandedSectionIds((prev) => new Set([...prev, newSectionId]));
      log.info('handleConfirmAddSection', 'created', { sectionId: newSectionId, count: sorted.length });
    }

    // Set next_spread_id for the section's last spread to "follow order" (next spread in array)
    const endIdx = indexMap.get(endSpreadId);
    if (endIdx !== undefined && endIdx + 1 < spreads.length) {
      clearNextSpreadId(endSpreadId);
      log.debug('handleConfirmAddSection', 'cleared next_spread_id for end spread', { endSpreadId });
    }

    setIsAddMode(false);
    setEditSectionId(null);
    setAddSectionTitle('');
    setAddSectionSelectedIds([]);
  }, [addSectionTitle, addSectionSelectedIds, spreads, addSection, updateSection, editSectionId, clearNextSpreadId]);

  const handleAddSectionSpreadToggle = useCallback((spreadId: string) => {
    const indexMap = new Map(spreads.map((sp, i) => [sp.id, i]));
    const toggleIdx = indexMap.get(spreadId);
    if (toggleIdx === undefined) return;

    setAddSectionSelectedIds((prev) => {
      if (prev.includes(spreadId)) {
        const selectedIndices = prev.map((id) => indexMap.get(id) ?? -1).filter((i) => i >= 0);
        const minIdx = Math.min(...selectedIndices);
        const maxIdx = Math.max(...selectedIndices);

        if (toggleIdx === minIdx) {
          // Deselect first spread: shift start forward, keep the rest
          const keptIds = spreads.slice(minIdx + 1, maxIdx + 1).map((sp) => sp.id);
          log.debug('handleAddSectionSpreadToggle', 'deselect first', { spreadId, newStart: minIdx + 1 });
          return keptIds;
        }

        if (toggleIdx === maxIdx) {
          // Deselect last spread: shift end backward, keep the rest
          const keptIds = spreads.slice(minIdx, maxIdx).map((sp) => sp.id);
          log.debug('handleAddSectionSpreadToggle', 'deselect last', { spreadId, newEnd: maxIdx - 1 });
          return keptIds;
        }

        // Deselect middle spread: trim from this point onwards
        const keptIds = spreads.slice(minIdx, toggleIdx).map((sp) => sp.id);
        log.debug('handleAddSectionSpreadToggle', 'deselect middle + trim', { spreadId, kept: keptIds.length });
        return keptIds;
      }

      // Select: fill all spreads between min and max of (current selection + new spread)
      const currentIndices = prev.map((id) => indexMap.get(id) ?? -1).filter((i) => i >= 0);
      const allIndices = [...currentIndices, toggleIdx];
      const minIdx = Math.min(...allIndices);
      const maxIdx = Math.max(...allIndices);
      const filledIds = spreads.slice(minIdx, maxIdx + 1).map((sp) => sp.id);
      log.debug('handleAddSectionSpreadToggle', 'select + fill', { spreadId, range: `${minIdx}-${maxIdx}` });
      return filledIds;
    });
  }, [spreads]);

  // Handlers — Section toggle / edit / delete
  const handleToggleSection = useCallback((id: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleEditSectionClick = useCallback((sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    // Find spreads belonging to this section
    const indexMap = new Map(spreads.map((sp, i) => [sp.id, i]));
    const startIdx = indexMap.get(section.start_spread_id);
    const endIdx = indexMap.get(section.end_spread_id);
    if (startIdx === undefined || endIdx === undefined) return;

    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const sectionSpreadIds = spreads.slice(lo, hi + 1).map((sp) => sp.id);

    // Enter add mode pre-populated with this section's data
    setEditSectionId(sectionId);
    setIsAddMode(true);
    setAddSectionTitle(section.title);
    setAddSectionSelectedIds(sectionSpreadIds);
    log.info('handleEditSectionClick', 'entering edit mode', { sectionId, spreadCount: sectionSpreadIds.length });
  }, [sections, spreads]);

  const handleDeleteSection = useCallback(
    (id: string) => {
      deleteSection(id);
      log.info('handleDeleteSection', 'deleted', { sectionId: id });
    },
    [deleteSection],
  );

  // Handlers — Gear clicks → open modals
  const handleSpreadGearClick = useCallback((spreadId: string) => {
    log.debug('handleSpreadGearClick', 'opening branching modal', { spreadId });
    setBranchModalSpreadId(spreadId);
  }, []);

  const handleSectionGearClick = useCallback((sectionId: string) => {
    log.debug('handleSectionGearClick', 'opening section settings', { sectionId });
    setSectionSettingsId(sectionId);
  }, []);

  // Derived: is add confirm disabled?
  const isAddConfirmDisabled = !addSectionTitle.trim() || addSectionSelectedIds.length === 0;

  return (
    <div className="flex h-full" role="main" aria-label="Branch creative space">
      <BranchSidebar
        selectedSpreadId={selectedSpreadId}
        isAddMode={isAddMode}
        addSectionTitle={addSectionTitle}
        isAddConfirmDisabled={isAddConfirmDisabled}
        expandedSectionIds={expandedSectionIds}
        onSpreadSelect={handleSpreadSelect}
        onSpreadGearClick={handleSpreadGearClick}
        onSectionGearClick={handleSectionGearClick}
        onStartAddMode={handleStartAddMode}
        onCancelAddMode={handleCancelAddMode}
        onConfirmAddSection={handleConfirmAddSection}
        onAddSectionTitleChange={setAddSectionTitle}
        onToggleSection={handleToggleSection}
        onEditSectionClick={handleEditSectionClick}
      />

      <div className="flex-1 overflow-hidden">
        <BranchMainView
          selectedSpreadId={selectedSectionId ? null : selectedSpreadId}
          selectedSectionId={selectedSectionId}
          isAddMode={isAddMode}
          editSectionId={editSectionId}
          addSectionSelectedIds={addSectionSelectedIds}
          expandedSectionIds={expandedSectionIds}
          onSpreadSelect={handleSpreadSelect}
          onSectionSelect={handleSectionSelect}
          onSpreadGearClick={handleSpreadGearClick}
          onDeleteSectionRequest={handleDeleteSection}
          onAddSectionSpreadToggle={handleAddSectionSpreadToggle}
        />
      </div>

      {branchModalSpreadId && (
        <StoryBranchingModal
          spreadId={branchModalSpreadId}
          onClose={() => setBranchModalSpreadId(null)}
        />
      )}

      {sectionSettingsId && sections.some((s) => s.id === sectionSettingsId) && (
        <SectionSettingsModal
          sectionId={sectionSettingsId}
          onClose={() => setSectionSettingsId(null)}
        />
      )}
    </div>
  );
}
