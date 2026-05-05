// use-audio-mixer-lifecycle.ts — Owns init/applyGains/teardown lifecycle for the player audio mixer.
//
// Design source: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-10-audio-mixer.md §4, §5.2
// Phase plan: plans/260505-1455-player-audio-mixer-frontend-impl/phase-02-use-audio-mixer-hook.md
//
// IMPORTANT: This hook does NOT call resumeContext. That belongs to FirstGestureGate
// (Phase 05) since AudioContext.resume() must run inside a user-gesture handler on iOS Safari.

import { useEffect, type RefObject } from 'react';
import { createLogger } from '@/utils/logger';
import {
  useContextCreated,
  usePlayerAudioActions,
} from '@/stores/player-audio-store';
import type { BookAudioSettings } from './audio-mixer-types';

const log = createLogger('Editor', 'useAudioMixerLifecycle');

export interface UseAudioMixerLifecycleArgs {
  masterVolume: number;
  isMuted: boolean;
  bookAudio: BookAudioSettings;
  /** Optional — when provided, hook installs a MutationObserver to auto-attach
   *  declarative `<audio data-audio-channel>` nodes that mount under this root.
   *  Programmatic `new Audio()` instances must still call attachAudio explicitly. */
  rootRef?: RefObject<HTMLElement | null>;
}

export function useAudioMixerLifecycle(args: UseAudioMixerLifecycleArgs): void {
  const { masterVolume, isMuted, bookAudio, rootRef } = args;
  const actions = usePlayerAudioActions();
  const contextCreated = useContextCreated();

  // Effect 1 — Init on mount (unconditional; runs pre-gesture, ctx stays suspended).
  // We pass the initial gain settings here so gains are correct the moment any
  // <audio> attaches, even before the first user gesture resumes the context.
  useEffect(() => {
    actions.initContext();
    actions.applyGains({ masterVolume, isMuted, bookAudio });
    log.debug('mount', 'mixer_lifecycle_mounted');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2 — Re-apply gains when inputs change (slider/mute/scale/etc.).
  useEffect(() => {
    if (!contextCreated) return;
    actions.applyGains({ masterVolume, isMuted, bookAudio });
  }, [
    masterVolume,
    isMuted,
    bookAudio,
    contextCreated,
    actions,
  ]);

  // Effect 3 (optional) — MutationObserver auto-attach declarative React audios.
  useEffect(() => {
    if (!contextCreated) return;
    const root = rootRef?.current;
    if (!root) return;

    // Initial sweep — attach any audio nodes already in the tree.
    root
      .querySelectorAll<HTMLAudioElement>('audio[data-audio-channel]')
      .forEach((el) => actions.attachAudio(el));

    const obs = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLAudioElement) {
            if (node.dataset.audioChannel) actions.attachAudio(node);
            return;
          }
          if (node instanceof Element) {
            node
              .querySelectorAll<HTMLAudioElement>('audio[data-audio-channel]')
              .forEach((el) => actions.attachAudio(el));
          }
        });
      }
    });
    obs.observe(root, { childList: true, subtree: true });
    log.debug('observer', 'mutation_observer_installed');

    return () => {
      obs.disconnect();
      log.debug('observer', 'mutation_observer_disconnected');
    };
  }, [contextCreated, rootRef, actions]);

  // Effect 4 — Teardown on unmount.
  useEffect(() => {
    return () => {
      actions.teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
