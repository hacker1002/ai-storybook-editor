// retouch-slice.ts — Playable layer CRUD on unified illustration spreads
// No own state: reads/writes from state.illustration.spreads[] playable layers

import type { StateCreator } from 'zustand';
import type { SnapshotStore, RetouchSlice } from '../types';
import { createLogger } from '@/utils/logger';
import { loadAudioMetadata } from '@/features/editor/utils/load-audio-metadata';
import {
  persistSceneShapeCollab,
  persistSceneShapeDeleteCollab,
} from './collab-scene-save-helper';
import {
  persistRetouchNodeCollab,
  persistRetouchDeleteCollab,
  persistAnimationsCollectionCollab,
} from './collab-retouch-save-helper';

const log = createLogger('Store', 'RetouchSlice');

export const createRetouchSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  RetouchSlice
> = (set, get) => ({
  // --- Images (playable) ---

  addRetouchImage: (spreadId, image) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchImage', 'add', { spreadId, imageId: image.id });
        spread.images.push(image);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchImage: (spreadId, imageId, updates) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        const idx = spread.images.findIndex((i) => i.id === imageId);
        if (idx !== -1) {
          log.debug('updateRetouchImage', 'update', { spreadId, imageId, keys: Object.keys(updates) });
          Object.assign(spread.images[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  // collab: NOT wired here — retouch image is rtype 1 (owned by the image-task pipeline / retouch
  // modal), out of the P06 rtype-9 set. NOTE: the composite-cascade below auto-deletes composites
  // (rtype-9 in-scope nodes) when this image was a variant — that cascade delete is NOT persisted
  // via the gateway; a secondary gap flagged for the P07 flip (parity with deleteRetouchAutoPic).
  deleteRetouchImage: (spreadId, imageId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteRetouchImage', 'delete', { spreadId, imageId });
        spread.images = spread.images.filter((i) => i.id !== imageId);
        // Cascade: drop variant refs to this image, auto-delete composite if < 2 variants left
        if (spread.composites && spread.composites.length > 0) {
          for (const composite of spread.composites) {
            composite.variants = composite.variants.filter((v) => v.id !== imageId);
          }
          const before = spread.composites.length;
          spread.composites = spread.composites.filter((c) => c.variants.length >= 2);
          const removed = before - spread.composites.length;
          if (removed > 0) {
            log.debug('deleteRetouchImage', 'cascade composites auto-deleted', { spreadId, imageId, removed });
          }
        }
        state.sync.isDirty = true;
      }
    }),

  // --- Textboxes (playable) ---

  addRetouchTextbox: (spreadId, textbox) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchTextbox', 'add', { spreadId, textboxId: textbox.id });
        spread.textboxes.push(textbox);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchTextbox: (spreadId, textboxId, updates) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        const idx = spread.textboxes.findIndex((t) => t.id === textboxId);
        if (idx !== -1) {
          log.debug('updateRetouchTextbox', 'update', { spreadId, textboxId, keys: Object.keys(updates) });
          Object.assign(spread.textboxes[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteRetouchTextbox: (spreadId, textboxId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteRetouchTextbox', 'delete', { spreadId, textboxId });
        spread.textboxes = spread.textboxes.filter((t) => t.id !== textboxId);
        state.sync.isDirty = true;
      }
    }),

  // --- Shapes (playable, with z-index/visibility) ---

  addRetouchShape: (spreadId, shape) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.shapes) spread.shapes = [];
        log.debug('addRetouchShape', 'add', { spreadId, shapeId: shape.id });
        spread.shapes.push(shape);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new shape node (create, scope:'node', rtype 8) — no-op solo.
    void persistSceneShapeCollab(get, spreadId, shape.id, 2);
  },

  updateRetouchShape: (spreadId, shapeId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.shapes) {
        const idx = spread.shapes.findIndex((sh) => sh.id === shapeId);
        if (idx !== -1) {
          log.debug('updateRetouchShape', 'update', { spreadId, shapeId, keys: Object.keys(updates) });
          Object.assign(spread.shapes[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the whole shape node (edit, scope:'node', rtype 8) — no-op solo.
    void persistSceneShapeCollab(get, spreadId, shapeId, 3);
  },

  deleteRetouchShape: (spreadId, shapeId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.shapes) {
        log.debug('deleteRetouchShape', 'delete', { spreadId, shapeId });
        spread.shapes = spread.shapes.filter((sh) => sh.id !== shapeId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, scope:'collection', rtype 8) — no-op solo.
    void persistSceneShapeDeleteCollab(spreadId, shapeId);
  },

  // --- Videos ---

  addRetouchVideo: (spreadId, video) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.videos) spread.videos = [];
        log.debug('addRetouchVideo', 'add', { spreadId, videoId: video.id });
        spread.videos.push(video);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new video node (create, rtype 9, collection 'videos') — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: video.id, collection: 'videos', actionType: 2 });
  },

  updateRetouchVideo: (spreadId, videoId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.videos) {
        const idx = spread.videos.findIndex((v) => v.id === videoId);
        if (idx !== -1) {
          log.debug('updateRetouchVideo', 'update', { spreadId, videoId, keys: Object.keys(updates) });
          Object.assign(spread.videos[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the whole video node (edit, rtype 9) — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: videoId, collection: 'videos', actionType: 3 });
  },

  deleteRetouchVideo: (spreadId, videoId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.videos) {
        log.debug('deleteRetouchVideo', 'delete', { spreadId, videoId });
        spread.videos = spread.videos.filter((v) => v.id !== videoId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, rtype 9, collection 'videos') — no-op solo.
    void persistRetouchDeleteCollab(spreadId, videoId, 'videos');
  },

  // --- Auto Pics ---

  addRetouchAutoPic: (spreadId, autoPic) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.auto_pics) spread.auto_pics = [];
        log.debug('addRetouchAutoPic', 'add', { spreadId, autoPicId: autoPic.id });
        spread.auto_pics.push(autoPic);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new auto_pic node (create, rtype 9, collection 'auto_pics') — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: autoPic.id, collection: 'auto_pics', actionType: 2 });
  },

  updateRetouchAutoPic: (spreadId, autoPicId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.auto_pics) {
        const idx = spread.auto_pics.findIndex((p) => p.id === autoPicId);
        if (idx !== -1) {
          log.debug('updateRetouchAutoPic', 'update', { spreadId, autoPicId, keys: Object.keys(updates) });
          Object.assign(spread.auto_pics[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the whole auto_pic node (edit, rtype 9) — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: autoPicId, collection: 'auto_pics', actionType: 3 });
  },

  deleteRetouchAutoPic: (spreadId, autoPicId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.auto_pics) {
        log.debug('deleteRetouchAutoPic', 'delete', { spreadId, autoPicId });
        spread.auto_pics = spread.auto_pics.filter((p) => p.id !== autoPicId);
        // Cascade: drop variant refs to this auto_pic, auto-delete composite if < 2 variants left
        if (spread.composites && spread.composites.length > 0) {
          for (const composite of spread.composites) {
            composite.variants = composite.variants.filter((v) => v.id !== autoPicId);
          }
          const before = spread.composites.length;
          spread.composites = spread.composites.filter((c) => c.variants.length >= 2);
          const removed = before - spread.composites.length;
          if (removed > 0) {
            log.debug('deleteRetouchAutoPic', 'cascade composites auto-deleted', { spreadId, autoPicId, removed });
          }
        }
        state.sync.isDirty = true;
      }
    });
    // collab: persist the auto_pic removal (delete, rtype 9, collection 'auto_pics') — no-op solo.
    // NOTE: the composite-variant cascade above (variant-ref drop + auto-delete) is NOT separately
    // persisted here — a secondary gap flagged for the P07 flip (see P06-FE report).
    void persistRetouchDeleteCollab(spreadId, autoPicId, 'auto_pics');
  },

  // --- Audios ---

  addRetouchAudio: (spreadId, audio) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.audios) spread.audios = [];
        log.debug('addRetouchAudio', 'add', { spreadId, audioId: audio.id });
        spread.audios.push(audio);
        state.sync.isDirty = true;
      }
    });

    // collab: persist the new audio node (create, rtype 9, collection 'audios') — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: audio.id, collection: 'audios', actionType: 2 });

    // Fire-and-forget media_length capture if missing.
    if (audio.media_url && !audio.media_length) {
      log.debug('addRetouchAudio', 'schedule media_length capture', { audioId: audio.id });
      void loadAudioMetadata(audio.media_url).then((ms) => {
        if (!ms) {
          log.warn('addRetouchAudio', 'media_length not persisted', {
            audioId: audio.id,
            reason: 'load failed or timed out',
          });
          return;
        }
        get().updateRetouchAudio(spreadId, audio.id, { media_length: ms });
      });
    }
  },

  updateRetouchAudio: (spreadId, audioId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.audios) {
        const idx = spread.audios.findIndex((a) => a.id === audioId);
        if (idx !== -1) {
          log.debug('updateRetouchAudio', 'update', { spreadId, audioId, keys: Object.keys(updates) });
          Object.assign(spread.audios[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the whole audio node (edit, rtype 9) — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: audioId, collection: 'audios', actionType: 3 });
  },

  deleteRetouchAudio: (spreadId, audioId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.audios) {
        log.debug('deleteRetouchAudio', 'delete', { spreadId, audioId });
        spread.audios = spread.audios.filter((a) => a.id !== audioId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, rtype 9, collection 'audios') — no-op solo.
    void persistRetouchDeleteCollab(spreadId, audioId, 'audios');
  },

  // --- Auto Audios ---

  addRetouchAutoAudio: (spreadId, autoAudio) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.auto_audios) spread.auto_audios = [];
        // Defense-in-depth: coerce player_visible to literal false
        const coerced = { ...autoAudio, player_visible: false as const };
        log.debug('addRetouchAutoAudio', 'add', { spreadId, autoAudioId: autoAudio.id });
        spread.auto_audios.push(coerced);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new auto_audio node (create, rtype 9, collection 'auto_audios') — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: autoAudio.id, collection: 'auto_audios', actionType: 2 });
  },

  updateRetouchAutoAudio: (spreadId, autoAudioId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.auto_audios) {
        const idx = spread.auto_audios.findIndex((a) => a.id === autoAudioId);
        if (idx !== -1) {
          // Coerce player_visible if invalid (cannot be true)
          const cleanUpdates =
            (updates as { player_visible?: unknown }).player_visible === true
              ? { ...updates, player_visible: false as const }
              : updates;
          log.debug('updateRetouchAutoAudio', 'update', {
            spreadId,
            autoAudioId,
            keys: Object.keys(cleanUpdates),
          });
          Object.assign(spread.auto_audios[idx], cleanUpdates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the whole auto_audio node (edit, rtype 9) — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: autoAudioId, collection: 'auto_audios', actionType: 3 });
  },

  deleteRetouchAutoAudio: (spreadId, autoAudioId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.auto_audios) {
        log.debug('deleteRetouchAutoAudio', 'delete', { spreadId, autoAudioId });
        spread.auto_audios = spread.auto_audios.filter((a) => a.id !== autoAudioId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, rtype 9, collection 'auto_audios') — no-op solo.
    void persistRetouchDeleteCollab(spreadId, autoAudioId, 'auto_audios');
  },

  // --- Animations (index-based) ---
  //
  // collab: persisted as a WHOLE ARRAY (rtype 9, edit), NOT per-node. `SpreadAnimation` carries NO
  // stable node `id` (only `target.id`; the snapshot schema mints no animation id) and these
  // mutators are index-based, so an animation cannot be per-node rtype-9-addressed. Instead every
  // change (add/update/delete/deleteByTargetId/reorder) re-saves the ENTIRE `spreads[si].animations`
  // array keyed by the parent SPREAD — see `persistAnimationsCollectionCollab`. Fire-and-forget
  // (`void …`), read FRESH via `get()` post-mutate, no-op solo.

  addRetouchAnimation: (spreadId, animation) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchAnimation', 'add', { spreadId, order: animation.order });
        if (!spread.animations) spread.animations = [];
        spread.animations.push(animation);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the whole animations array (whole-array edit, rtype 9) — no-op solo.
    void persistAnimationsCollectionCollab(get, spreadId);
  },

  updateRetouchAnimation: (spreadId, animationIndex, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.animations && animationIndex >= 0 && animationIndex < spread.animations.length) {
        log.debug('updateRetouchAnimation', 'update', { spreadId, animationIndex, keys: Object.keys(updates) });
        Object.assign(spread.animations[animationIndex], updates);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the whole animations array (whole-array edit, rtype 9) — no-op solo.
    void persistAnimationsCollectionCollab(get, spreadId);
  },

  deleteRetouchAnimation: (spreadId, animationIndex) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.animations && animationIndex >= 0 && animationIndex < spread.animations.length) {
        log.debug('deleteRetouchAnimation', 'delete', { spreadId, animationIndex });
        spread.animations.splice(animationIndex, 1);
        spread.animations.forEach((anim, i) => { anim.order = i; });
        state.sync.isDirty = true;
      }
    });
    // collab: persist the whole animations array (whole-array edit, rtype 9) — no-op solo.
    void persistAnimationsCollectionCollab(get, spreadId);
  },

  deleteRetouchAnimationsByTargetId: (spreadId, targetId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.animations) {
        const before = spread.animations.length;
        spread.animations = spread.animations.filter((a) => a.target.id !== targetId);
        const removed = before - spread.animations.length;
        if (removed > 0) {
          spread.animations.forEach((anim, i) => { anim.order = i; });
          state.sync.isDirty = true;
          log.debug('deleteRetouchAnimationsByTargetId', 'removed', { spreadId, targetId, removed });
        }
      }
    });
    // collab: persist the whole animations array (whole-array edit, rtype 9) — no-op solo.
    void persistAnimationsCollectionCollab(get, spreadId);
  },

  reorderRetouchAnimations: (spreadId, fromIndex, toIndex) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (
        spread?.animations &&
        fromIndex >= 0 &&
        toIndex >= 0 &&
        fromIndex < spread.animations.length &&
        toIndex < spread.animations.length
      ) {
        log.debug('reorderRetouchAnimations', 'reorder', { spreadId, fromIndex, toIndex });
        const [removed] = spread.animations.splice(fromIndex, 1);
        spread.animations.splice(toIndex, 0, removed);
        spread.animations.forEach((anim, i) => { anim.order = i; });
        state.sync.isDirty = true;
      }
    });
    // collab: persist the whole animations array (whole-array edit, rtype 9) — no-op solo.
    void persistAnimationsCollectionCollab(get, spreadId);
  },

  // --- Composites (edition-aware wrapper) ---

  addRetouchComposite: (spreadId, composite) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.composites) spread.composites = [];
        log.debug('addRetouchComposite', 'add', {
          spreadId,
          compositeId: composite.id,
          variantCount: composite.variants.length,
        });
        spread.composites.push(composite);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new composite node (create, rtype 9, collection 'composites') — no-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: composite.id, collection: 'composites', actionType: 2 });
  },

  updateRetouchComposite: (spreadId, compositeId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (!spread?.composites) return;
      const idx = spread.composites.findIndex((c) => c.id === compositeId);
      if (idx === -1) return;

      const composite = spread.composites[idx];
      log.debug('updateRetouchComposite', 'update', {
        spreadId,
        compositeId,
        keys: Object.keys(updates),
      });
      Object.assign(composite, updates);

      // ⚡ WRITE-THROUGH cascade (Session 1 D5 + reorder bugfix):
      // Propagate editor_visible / player_visible / z-index to all variant
      // items. Variants render at their own z-index, so the composite layer
      // would drift if children were not kept in sync on reorder.
      const hasEditorVis = Object.prototype.hasOwnProperty.call(updates, 'editor_visible');
      const hasPlayerVis = Object.prototype.hasOwnProperty.call(updates, 'player_visible');
      const hasZIndex = Object.prototype.hasOwnProperty.call(updates, 'z-index');

      if (hasEditorVis || hasPlayerVis || hasZIndex) {
        const editorVis = updates.editor_visible;
        const playerVis = updates.player_visible;
        const zIndex = updates['z-index'];
        for (const variant of composite.variants) {
          if (variant.type === 'image') {
            const img = spread.images.find((i) => i.id === variant.id);
            if (img) {
              // Symmetric undefined guard with auto_pic branch — caller may
              // pass `editor_visible: undefined` (intent: "don't touch") and
              // we must NOT clear the cascaded field.
              if (hasEditorVis && editorVis !== undefined) img.editor_visible = editorVis;
              if (hasPlayerVis && playerVis !== undefined) img.player_visible = playerVis;
              if (hasZIndex && zIndex !== undefined) img['z-index'] = zIndex;
            }
          } else if (variant.type === 'auto_pic') {
            const ap = spread.auto_pics?.find((a) => a.id === variant.id);
            if (ap) {
              if (hasEditorVis && editorVis !== undefined) ap.editor_visible = editorVis;
              if (hasPlayerVis && playerVis !== undefined) ap.player_visible = playerVis;
              if (hasZIndex && zIndex !== undefined) ap['z-index'] = zIndex;
            }
          }
        }
        log.debug('updateRetouchComposite', 'cascade', {
          spreadId,
          compositeId,
          editorVis: hasEditorVis ? editorVis : undefined,
          playerVis: hasPlayerVis ? playerVis : undefined,
          zIndex: hasZIndex ? zIndex : undefined,
          variantCount: composite.variants.length,
        });
      }

      state.sync.isDirty = true;
    });
    // collab: persist the whole composite node (edit, rtype 9) — no-op solo.
    // NOTE: the write-through cascade to variant image/auto_pic nodes (visibility/z-index above) is
    // NOT separately persisted here — a secondary gap flagged for the P07 flip (see P06-FE report).
    void persistRetouchNodeCollab(get, { spreadId, nodeId: compositeId, collection: 'composites', actionType: 3 });
  },

  deleteRetouchComposite: (spreadId, compositeId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.composites) {
        log.debug('deleteRetouchComposite', 'delete', { spreadId, compositeId });
        spread.composites = spread.composites.filter((c) => c.id !== compositeId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, rtype 9, collection 'composites') — no-op solo.
    void persistRetouchDeleteCollab(spreadId, compositeId, 'composites');
  },

  addVariantToComposite: (spreadId, compositeId, variant) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (!spread?.composites) return;
      const composite = spread.composites.find((c) => c.id === compositeId);
      if (!composite) return;
      // Reject duplicate edition (1 edition slot → 1 variant)
      if (composite.variants.some((v) => v.edition === variant.edition)) {
        log.warn('addVariantToComposite', 'duplicate edition rejected', {
          spreadId,
          compositeId,
          edition: variant.edition,
        });
        return;
      }
      log.debug('addVariantToComposite', 'add', {
        spreadId,
        compositeId,
        variantId: variant.id,
        edition: variant.edition,
      });
      composite.variants.push(variant);
      state.sync.isDirty = true;
    });
    // collab: a variant add is a rtype-9 EDIT of the composite node (patch = composite with the new
    // variant) — no separate variant address. No-op solo.
    void persistRetouchNodeCollab(get, { spreadId, nodeId: compositeId, collection: 'composites', actionType: 3 });
  },

  removeVariantFromComposite: (spreadId, compositeId, variantId, edition) => {
    // Capture presence BEFORE the mutation so we can tell "auto-deleted" (present → gone) apart from
    // "never existed" (a caller bug) — the latter must NOT fire a phantom gateway DELETE.
    const wasPresent =
      get().illustration.spreads.find((s) => s.id === spreadId)?.composites?.some((c) => c.id === compositeId) ?? false;
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (!spread?.composites) return;
      const compositeIdx = spread.composites.findIndex((c) => c.id === compositeId);
      if (compositeIdx === -1) return;

      const composite = spread.composites[compositeIdx];
      const before = composite.variants.length;
      composite.variants = composite.variants.filter((v) => {
        if (v.id !== variantId) return true;
        if (edition && v.edition !== edition) return true;
        return false;
      });
      const removed = before - composite.variants.length;
      log.debug('removeVariantFromComposite', 'remove', {
        spreadId,
        compositeId,
        variantId,
        edition,
        removed,
      });

      // Auto-delete composite if < 2 variants
      if (composite.variants.length < 2) {
        log.debug('removeVariantFromComposite', 'auto-delete composite (< 2 variants)', {
          spreadId,
          compositeId,
        });
        spread.composites.splice(compositeIdx, 1);
      }

      state.sync.isDirty = true;
    });
    // collab: a variant removal is a rtype-9 EDIT of the composite node (patch = composite with the
    // variant removed); when the composite auto-deletes (< 2 variants) it becomes a DELETE instead.
    // Read fresh (post-mutate) to pick the outcome; skip entirely if the composite never existed
    // (guards against a phantom DELETE). No-op solo.
    if (wasPresent) {
      const stillExists =
        get().illustration.spreads.find((s) => s.id === spreadId)?.composites?.some((c) => c.id === compositeId) ?? false;
      if (stillExists) {
        void persistRetouchNodeCollab(get, { spreadId, nodeId: compositeId, collection: 'composites', actionType: 3 });
      } else {
        void persistRetouchDeleteCollab(spreadId, compositeId, 'composites');
      }
    }
  },
});
