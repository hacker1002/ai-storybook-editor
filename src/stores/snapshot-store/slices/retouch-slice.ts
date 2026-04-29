// retouch-slice.ts — Playable layer CRUD on unified illustration spreads
// No own state: reads/writes from state.illustration.spreads[] playable layers

import type { StateCreator } from 'zustand';
import type { SnapshotStore, RetouchSlice } from '../types';
import { createLogger } from '@/utils/logger';
import { loadAudioMetadata } from '@/features/editor/utils/load-audio-metadata';

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

  deleteRetouchImage: (spreadId, imageId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteRetouchImage', 'delete', { spreadId, imageId });
        spread.images = spread.images.filter((i) => i.id !== imageId);
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

  addRetouchShape: (spreadId, shape) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.shapes) spread.shapes = [];
        log.debug('addRetouchShape', 'add', { spreadId, shapeId: shape.id });
        spread.shapes.push(shape);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchShape: (spreadId, shapeId, updates) =>
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
    }),

  deleteRetouchShape: (spreadId, shapeId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.shapes) {
        log.debug('deleteRetouchShape', 'delete', { spreadId, shapeId });
        spread.shapes = spread.shapes.filter((sh) => sh.id !== shapeId);
        state.sync.isDirty = true;
      }
    }),

  // --- Videos ---

  addRetouchVideo: (spreadId, video) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.videos) spread.videos = [];
        log.debug('addRetouchVideo', 'add', { spreadId, videoId: video.id });
        spread.videos.push(video);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchVideo: (spreadId, videoId, updates) =>
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
    }),

  deleteRetouchVideo: (spreadId, videoId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.videos) {
        log.debug('deleteRetouchVideo', 'delete', { spreadId, videoId });
        spread.videos = spread.videos.filter((v) => v.id !== videoId);
        state.sync.isDirty = true;
      }
    }),

  // --- Auto Pics ---

  addRetouchAutoPic: (spreadId, autoPic) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.auto_pics) spread.auto_pics = [];
        log.debug('addRetouchAutoPic', 'add', { spreadId, autoPicId: autoPic.id });
        spread.auto_pics.push(autoPic);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchAutoPic: (spreadId, autoPicId, updates) =>
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
    }),

  deleteRetouchAutoPic: (spreadId, autoPicId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.auto_pics) {
        log.debug('deleteRetouchAutoPic', 'delete', { spreadId, autoPicId });
        spread.auto_pics = spread.auto_pics.filter((p) => p.id !== autoPicId);
        state.sync.isDirty = true;
      }
    }),

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

  updateRetouchAudio: (spreadId, audioId, updates) =>
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
    }),

  deleteRetouchAudio: (spreadId, audioId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.audios) {
        log.debug('deleteRetouchAudio', 'delete', { spreadId, audioId });
        spread.audios = spread.audios.filter((a) => a.id !== audioId);
        state.sync.isDirty = true;
      }
    }),

  // --- Animations (index-based) ---

  addRetouchAnimation: (spreadId, animation) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchAnimation', 'add', { spreadId, order: animation.order });
        if (!spread.animations) spread.animations = [];
        spread.animations.push(animation);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchAnimation: (spreadId, animationIndex, updates) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.animations && animationIndex >= 0 && animationIndex < spread.animations.length) {
        log.debug('updateRetouchAnimation', 'update', { spreadId, animationIndex, keys: Object.keys(updates) });
        Object.assign(spread.animations[animationIndex], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteRetouchAnimation: (spreadId, animationIndex) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.animations && animationIndex >= 0 && animationIndex < spread.animations.length) {
        log.debug('deleteRetouchAnimation', 'delete', { spreadId, animationIndex });
        spread.animations.splice(animationIndex, 1);
        spread.animations.forEach((anim, i) => { anim.order = i; });
        state.sync.isDirty = true;
      }
    }),

  deleteRetouchAnimationsByTargetId: (spreadId, targetId) =>
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
    }),

  reorderRetouchAnimations: (spreadId, fromIndex, toIndex) =>
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
    }),
});
