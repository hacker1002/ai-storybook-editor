// remix-store/slices/crud-slice.ts — Remix CRUD slice. Frontend owns remix
// rows via supabase-js (RLS-protected): create / update config / rename /
// delete + active selection + illustration/crop-sheet patching.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { Human } from '@/types/human';
import { applyTextSwap } from '@/features/remix/text-swap-engine';
import { buildRemixClonePayload } from '../clone-builder';
import { mapRowToRemix } from '../supabase-mapping';
import { computeCropSheets } from '../crop-sheet-layout';
import { useSnapshotStore } from '../../snapshot-store';
import { useHumansStore } from '../../humans-store';
import { useBookStore } from '../../book-store';
import { applySheetPatch } from '../slice-helpers';
import type { RemixCrudSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createCrudSlice: RemixSliceCreator<RemixCrudSlice> = (
  set,
  get,
) => ({
  remixes: [],
  activeRemixId: null,

  createRemix: async (config, name) => {
    const snapshotState = useSnapshotStore.getState();
    const snapshotId = snapshotState.meta.id;
    if (!snapshotId) {
      log.warn('createRemix', 'no active snapshot');
      return null;
    }

    const payload = buildRemixClonePayload(
      {
        snapshotId,
        illustration: snapshotState.illustration,
        characters: snapshotState.characters,
        props: snapshotState.props,
      },
      config,
      name,
    );

    // ── Phase 1 text swap ────────────────────────────────────────────
    const humansList = useHumansStore.getState().humans;
    const humansMap: Record<string, Human> = Object.fromEntries(
      humansList.map((h) => [h.id, h]),
    );
    const enabledLanguages = config.languages
      .filter((l) => l.is_enabled)
      .map((l) => l.code);

    const swap = applyTextSwap({
      illustration: payload.illustration,
      remixCharacters: payload.characters,
      configCharacters: config.characters,
      enabledLanguages,
      humans: humansMap,
    });

    const finalPayload = { ...payload, illustration: swap.illustration };

    // ── Step 2h — client-side crop-sheet layout (before INSERT) ──────
    // Computes crop_sheets[] (sheet_geometry + px crop geometry) for every
    // character/prop/mix and writes them back onto finalPayload IN PLACE so
    // they persist in the same INSERT round-trip. Replaces the old
    // fire-and-forget build-crop-sheets endpoint call.
    const dimension = useBookStore.getState().currentBook?.dimension ?? null;
    computeCropSheets(finalPayload, dimension);

    log.info('createRemix', 'insert', { snapshotId, name: finalPayload.name });
    const { data, error } = await supabase
      .from('remixes')
      .insert(finalPayload)
      .select('*')
      .single();

    if (error || !data) {
      log.error('createRemix', 'failed', { error: error?.message });
      return null;
    }

    const remix = mapRowToRemix(data);
    set((s) => ({
      remixes: [...s.remixes, remix],
      activeRemixId: remix.id,
    }));

    if (swap.warnings.length > 0) {
      log.warn('createRemix', 'text swap warnings', {
        remixId: remix.id,
        warningCount: swap.warnings.length,
        matchCount: swap.matchCount,
        chunksMarkedUnsynced: swap.chunksMarkedUnsynced,
        warnings: swap.warnings,
      });
    }

    // ── Phase 2 auto-trigger audio swap (fire-and-forget) ───────────
    log.info('createRemix', 'auto-trigger audio swap', { remixId: remix.id });
    void get()
      .startAudioJob(remix.id, { triggeredBy: 'auto-create' })
      .catch((err) => {
        log.warn('createRemix', 'audio swap enqueue failed (non-blocking)', {
          remixId: remix.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return remix;
  },

  renameRemix: async (id, name) => {
    const trimmed = name.trim() || 'New Remix';
    const prev = get().remixes.find((r) => r.id === id);
    if (!prev) return false;

    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === id ? { ...r, name: trimmed } : r,
      ),
    }));

    const { error } = await supabase
      .from('remixes')
      .update({ name: trimmed })
      .eq('id', id);

    if (error) {
      log.error('renameRemix', 'rollback', { id, error: error.message });
      set((s) => ({
        remixes: s.remixes.map((r) => (r.id === id ? prev : r)),
      }));
      return false;
    }
    return true;
  },

  deleteRemix: async (id) => {
    const prevList = get().remixes;
    const prevActiveId = get().activeRemixId;
    const wasActive = prevActiveId === id;

    // Best-effort cancel any active jobs for the deleted remix.
    const active = get().jobs.filter(
      (j) =>
        j.remixId === id &&
        (j.status === 'queued' || j.status === 'running'),
    );
    for (const job of active) {
      void get()
        .cancelJob(job.id)
        .catch((err) => {
          log.warn('deleteRemix', 'cancel job failed (non-blocking)', {
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    set((s) => ({
      remixes: s.remixes.filter((r) => r.id !== id),
      activeRemixId: wasActive
        ? (s.remixes.find((r) => r.id !== id)?.id ?? null)
        : s.activeRemixId,
    }));

    const { error } = await supabase.from('remixes').delete().eq('id', id);
    if (error) {
      log.error('deleteRemix', 'rollback', { id, error: error.message });
      // Swap state is derived from `jobs[]` (no separate task map) — the
      // active-job cancel above + realtime job rows are the only swap state,
      // so nothing extra to restore here on rollback.
      set({ remixes: prevList, activeRemixId: prevActiveId });
      return false;
    }
    return true;
  },

  setActiveRemixId: (id) => set({ activeRemixId: id }),

  updateRemixDistribution: async (id, dist) => {
    const prev = get().remixes.find((r) => r.id === id);
    if (!prev) {
      log.warn('updateRemixDistribution', 'remix not found', { id });
      return false;
    }

    // Optimistic: full-column set (client owns is_enabled; status/media fields
    // round-trip unchanged from the coalesced shape the UI rendered).
    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === id ? { ...r, distribution: dist } : r,
      ),
    }));

    const { error } = await supabase
      .from('remixes')
      .update({ distribution: dist })
      .eq('id', id);

    if (error) {
      log.error('updateRemixDistribution', 'rollback', { id, error: error.message });
      set((s) => ({
        remixes: s.remixes.map((r) => (r.id === id ? prev : r)),
      }));
      return false;
    }
    log.info('updateRemixDistribution', 'done', { id });
    return true;
  },

  patchRemixIllustration: (id, spreads) =>
    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === id
          ? {
              ...r,
              illustration: { ...r.illustration, spreads },
            }
          : r,
      ),
    })),

  patchRemixCropSheets: (id, updates) =>
    set((s) => ({
      remixes: s.remixes.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r };
        for (const u of updates) {
          if (u.entityType === 'character') {
            next.characters = next.characters.map((c) =>
              c.key === u.entityKey ? applySheetPatch(c, u) : c,
            );
          } else if (u.entityType === 'prop') {
            next.props = next.props.map((p) =>
              p.key === u.entityKey ? applySheetPatch(p, u) : p,
            );
          } else {
            // rev2: batch (mix) identity is `id` (uuid). entityKey === batchId.
            next.mixes = next.mixes.map((m) =>
              m.id === u.entityKey ? applySheetPatch(m, u) : m,
            );
          }
        }
        return next;
      }),
    })),
});
