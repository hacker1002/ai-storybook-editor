// styles-page.tsx — Route-level container for /styles (art-style library).
// Stateful container: reads the art-styles store, owns filter + modal UI state
// (local useState, NOT in store — UI-only, mirrors VoicesPage), derives the
// filtered list + tag union via useMemo (keyed on the stable store `styles` ref),
// and feeds controlled child components with stable useCallback handlers so the
// memoized StyleCard stays effective while typing in search.
//
// Data fetch is owned by App.tsx (fired on auth-success), so this page does NOT
// re-fetch on mount — it only consumes store state.

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StylesHeader } from '@/features/styles/components/styles-header';
import { StylesToolbar } from '@/features/styles/components/styles-toolbar';
import { StylesGrid } from '@/features/styles/components/styles-grid';
import { StylesGridSkeleton } from '@/features/styles/components/styles-grid-skeleton';
import { StyleFormModal } from '@/features/styles/components/style-form-modal';
import { DeleteStyleDialog } from '@/features/styles/components/delete-style-dialog';
import { applyFilters, distinctTags } from '@/features/styles/utils/style-filters';
import { DEFAULT_STYLES_FILTERS } from '@/features/styles/constants/constants';
import {
  useArtStyles,
  useArtStylesActions,
  useArtStylesLoading,
} from '@/stores/art-styles-store';
import type { ArtStyle, FormMode, StylesFilterState } from '@/types/art-style';
import { createLogger } from '@/utils/logger';

const log = createLogger('Styles', 'StylesPage');

export function StylesPage() {
  const styles = useArtStyles();
  const isLoading = useArtStylesLoading();
  const { upsertLocal, removeLocal } = useArtStylesActions();

  // UI-only state (kept out of the store).
  const [filters, setFilters] = useState<StylesFilterState>(DEFAULT_STYLES_FILTERS);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingStyle, setEditingStyle] = useState<ArtStyle | null>(null);
  const [deletingStyle, setDeletingStyle] = useState<ArtStyle | null>(null);

  // Derived — key on the stable store `styles` ref + local `filters`, never a
  // freshly-mapped array (would loop / defeat memoization).
  const filtered = useMemo(() => applyFilters(styles, filters), [styles, filters]);
  const availableTags = useMemo(() => distinctTags(styles), [styles]);

  // Render-level trace at `debug` (DEV-only, never `info`): surfaces live filter
  // counts without flooding the console on every search keystroke re-render.
  log.debug('render', 'styles page', {
    total: styles.length,
    filtered: filtered.length,
    isLoading,
  });

  // Stable callbacks → keep StyleCard memo effective across search keystrokes.
  const openNew = useCallback(() => {
    log.debug('openNew', 'open create modal');
    setEditingStyle(null);
    setFormMode('create');
  }, []);

  const openEdit = useCallback((style: ArtStyle) => {
    log.debug('openEdit', 'open edit modal', { id: style.id });
    setEditingStyle(style);
    setFormMode('edit');
  }, []);

  const openDel = useCallback((style: ArtStyle) => {
    log.debug('openDel', 'open delete dialog', { id: style.id });
    setDeletingStyle(style);
  }, []);

  const closeForm = useCallback(() => {
    log.debug('closeForm', 'close form modal');
    setFormMode(null);
    setEditingStyle(null);
  }, []);

  const handleSaved = useCallback(
    (style: ArtStyle) => {
      const created = formMode === 'create';
      log.info('handleSaved', created ? 'style created' : 'style saved', {
        id: style.id,
      });
      upsertLocal(style);
      toast.success(created ? 'Style created' : 'Style saved');
      setFormMode(null);
      setEditingStyle(null);
    },
    [formMode, upsertLocal]
  );

  const handleDeleted = useCallback(
    (id: string) => {
      log.info('handleDeleted', 'style deleted', { id });
      removeLocal(id);
      toast.success('Style deleted');
      setDeletingStyle(null);
    },
    [removeLocal]
  );

  return (
    <main aria-labelledby="styles-heading" className="w-full">
      <StylesHeader onOpenNew={openNew} />
      <StylesToolbar
        filters={filters}
        count={filtered.length}
        availableTags={availableTags}
        onChange={setFilters}
      />
      {isLoading ? (
        <StylesGridSkeleton />
      ) : (
        <StylesGrid
          styles={filtered}
          isLibraryEmpty={styles.length === 0}
          onEdit={openEdit}
          onDelete={openDel}
          onOpenNew={openNew}
        />
      )}

      {formMode ? (
        <StyleFormModal
          mode={formMode}
          style={editingStyle}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      ) : null}

      {deletingStyle ? (
        <DeleteStyleDialog
          style={deletingStyle}
          onClose={() => setDeletingStyle(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </main>
  );
}
