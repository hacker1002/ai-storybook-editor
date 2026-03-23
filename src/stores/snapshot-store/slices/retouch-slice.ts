import type { StateCreator } from 'zustand';
import type { SnapshotStore, RetouchSlice } from '../types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'RetouchSlice');

export const createRetouchSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  RetouchSlice
> = (set) => ({
  retouch: { spreads: [] },

  setRetouch: (data) =>
    set((state) => {
      log.debug('setRetouch', 'replace all', { spreadCount: data.spreads.length });
      state.retouch = data;
    }),

  // --- Spread CRUD ---

  addRetouchSpread: (spread) =>
    set((state) => {
      log.debug('addRetouchSpread', 'add', { spreadId: spread.id });
      state.retouch.spreads.push(spread);
      state.sync.isDirty = true;
    }),

  updateRetouchSpread: (spreadId, updates) =>
    set((state) => {
      const idx = state.retouch.spreads.findIndex((s) => s.id === spreadId);
      if (idx !== -1) {
        log.debug('updateRetouchSpread', 'update', { spreadId, keys: Object.keys(updates) });
        Object.assign(state.retouch.spreads[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteRetouchSpread: (spreadId) =>
    set((state) => {
      log.debug('deleteRetouchSpread', 'delete', { spreadId });
      state.retouch.spreads = state.retouch.spreads.filter((s) => s.id !== spreadId);
      state.sync.isDirty = true;
    }),

  reorderRetouchSpreads: (fromIndex, toIndex) =>
    set((state) => {
      const { spreads } = state.retouch;
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < spreads.length && toIndex < spreads.length) {
        log.debug('reorderRetouchSpreads', 'reorder', { fromIndex, toIndex });
        const [removed] = spreads.splice(fromIndex, 1);
        spreads.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  // --- Images ---

  addRetouchImage: (spreadId, image) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchImage', 'add', { spreadId, imageId: image.id });
        spread.images.push(image);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchImage: (spreadId, imageId, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
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
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteRetouchImage', 'delete', { spreadId, imageId });
        spread.images = spread.images.filter((i) => i.id !== imageId);
        state.sync.isDirty = true;
      }
    }),

  // --- Textboxes ---

  addRetouchTextbox: (spreadId, textbox) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchTextbox', 'add', { spreadId, textboxId: textbox.id });
        spread.textboxes.push(textbox);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchTextbox: (spreadId, textboxId, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
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
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteRetouchTextbox', 'delete', { spreadId, textboxId });
        spread.textboxes = spread.textboxes.filter((t) => t.id !== textboxId);
        state.sync.isDirty = true;
      }
    }),

  // --- Shapes ---

  addRetouchShape: (spreadId, shape) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchShape', 'add', { spreadId, shapeId: shape.id });
        if (!spread.shapes) spread.shapes = [];
        spread.shapes.push(shape);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchShape: (spreadId, shapeId, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
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
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.shapes) {
        log.debug('deleteRetouchShape', 'delete', { spreadId, shapeId });
        spread.shapes = spread.shapes.filter((sh) => sh.id !== shapeId);
        state.sync.isDirty = true;
      }
    }),

  // --- Videos ---

  addRetouchVideo: (spreadId, video) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchVideo', 'add', { spreadId, videoId: video.id });
        if (!spread.videos) spread.videos = [];
        spread.videos.push(video);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchVideo: (spreadId, videoId, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
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
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.videos) {
        log.debug('deleteRetouchVideo', 'delete', { spreadId, videoId });
        spread.videos = spread.videos.filter((v) => v.id !== videoId);
        state.sync.isDirty = true;
      }
    }),

  // --- Audios ---

  addRetouchAudio: (spreadId, audio) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchAudio', 'add', { spreadId, audioId: audio.id });
        if (!spread.audios) spread.audios = [];
        spread.audios.push(audio);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchAudio: (spreadId, audioId, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
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
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.audios) {
        log.debug('deleteRetouchAudio', 'delete', { spreadId, audioId });
        spread.audios = spread.audios.filter((a) => a.id !== audioId);
        state.sync.isDirty = true;
      }
    }),

  // --- Quizzes ---

  addRetouchQuiz: (spreadId, quiz) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchQuiz', 'add', { spreadId, quizId: quiz.id });
        if (!spread.quizzes) spread.quizzes = [];
        spread.quizzes.push(quiz);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchQuiz: (spreadId, quizId, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.quizzes) {
        const idx = spread.quizzes.findIndex((q) => q.id === quizId);
        if (idx !== -1) {
          log.debug('updateRetouchQuiz', 'update', { spreadId, quizId, keys: Object.keys(updates) });
          Object.assign(spread.quizzes[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteRetouchQuiz: (spreadId, quizId) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.quizzes) {
        log.debug('deleteRetouchQuiz', 'delete', { spreadId, quizId });
        spread.quizzes = spread.quizzes.filter((q) => q.id !== quizId);
        state.sync.isDirty = true;
      }
    }),

  // --- Animations (index-based) ---

  addRetouchAnimation: (spreadId, animation) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addRetouchAnimation', 'add', { spreadId, order: animation.order });
        if (!spread.animations) spread.animations = [];
        spread.animations.push(animation);
        state.sync.isDirty = true;
      }
    }),

  updateRetouchAnimation: (spreadId, animationIndex, updates) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.animations && animationIndex >= 0 && animationIndex < spread.animations.length) {
        log.debug('updateRetouchAnimation', 'update', { spreadId, animationIndex, keys: Object.keys(updates) });
        Object.assign(spread.animations[animationIndex], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteRetouchAnimation: (spreadId, animationIndex) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
      if (spread?.animations && animationIndex >= 0 && animationIndex < spread.animations.length) {
        log.debug('deleteRetouchAnimation', 'delete', { spreadId, animationIndex });
        spread.animations.splice(animationIndex, 1);
        // Re-assign .order to match new array position
        spread.animations.forEach((anim, i) => { anim.order = i; });
        state.sync.isDirty = true;
      }
    }),

  reorderRetouchAnimations: (spreadId, fromIndex, toIndex) =>
    set((state) => {
      const spread = state.retouch.spreads.find((s) => s.id === spreadId);
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
        // Re-assign .order to match new array position
        spread.animations.forEach((anim, i) => { anim.order = i; });
        state.sync.isDirty = true;
      }
    }),

  // --- Clear ---

  clearRetouch: () =>
    set((state) => {
      log.debug('clearRetouch', 'clear');
      state.retouch = { spreads: [] };
      state.sync.isDirty = true;
    }),
});
