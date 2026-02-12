import { useShallow } from 'zustand/react/shallow';
import { useSnapshotStore } from './index';
import type { DocType } from '@/types/editor';

// Meta selectors
export const useSnapshotId = () => useSnapshotStore((s) => s.meta.id);
export const useIsDirty = () => useSnapshotStore((s) => s.sync.isDirty);
export const useIsSaving = () => useSnapshotStore((s) => s.sync.isSaving);
export const useSyncState = () => useSnapshotStore((s) => s.sync);

// Docs selectors
export const useDocs = () => useSnapshotStore((s) => s.docs);
export const useDocByIndex = (index: number) => useSnapshotStore((s) => s.docs[index]);
export const useDocByType = (type: DocType) =>
  useSnapshotStore((s) => s.docs.find((d) => d.type === type));

// Fetch state selectors
export const useSnapshotFetchLoading = () => useSnapshotStore((s) => s.fetchLoading);
export const useSnapshotFetchError = () => useSnapshotStore((s) => s.fetchError);

// Actions-only hook (no re-render on state changes)
export const useSnapshotActions = () =>
  useSnapshotStore(
    useShallow((s) => ({
      // Docs
      setDocs: s.setDocs,
      addDoc: s.addDoc,
      updateDoc: s.updateDoc,
      updateDocTitle: s.updateDocTitle,
      deleteDoc: s.deleteDoc,
      // Meta
      setMeta: s.setMeta,
      markDirty: s.markDirty,
      markClean: s.markClean,
      setSaving: s.setSaving,
      setSaveError: s.setSaveError,
      // Top-level
      initSnapshot: s.initSnapshot,
      resetSnapshot: s.resetSnapshot,
      fetchSnapshot: s.fetchSnapshot,
      saveSnapshot: s.saveSnapshot,
    }))
  );
