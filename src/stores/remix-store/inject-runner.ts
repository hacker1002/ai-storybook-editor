// inject-runner.ts — Stage 1 text-swap pass. Stage 2 (audio chunks + crop
// swap) is deferred — finalize as `completed` with informational toast per
// Validation Session 1.

import { toast } from 'sonner';
import { supabase } from '@/apis/supabase';
import { useHumansStore } from '@/stores/humans-store';
import { useEditorSettingsStore } from '@/stores/editor-settings-store';
import { createLogger } from '@/utils/logger';
import type { InjectJob, RemixSpread } from '@/types/remix';
import type {
  SpreadTextbox,
  SpreadTextboxContent,
} from '@/types/spread-types';
import { buildNameResolution, replaceMentions } from './mention-replacer';
import type { useRemixStore } from '../remix-store';

const log = createLogger('Store', 'InjectRunner');

export type RemixStoreApi = typeof useRemixStore;

const isLanguageKey = (key: string) => /^[a-z]{2}_[A-Z]{2}$/.test(key);

function isTextboxContent(value: unknown): value is SpreadTextboxContent {
  return (
    !!value &&
    typeof value === 'object' &&
    'text' in (value as Record<string, unknown>) &&
    typeof (value as { text: unknown }).text === 'string'
  );
}

function rewriteTextbox(
  tb: SpreadTextbox,
  resolution: Map<string, string>,
  enabledLangs: string[],
): SpreadTextbox {
  let mutated = false;
  const next: Record<string, unknown> = { ...tb };
  for (const key of Object.keys(tb)) {
    if (!isLanguageKey(key)) continue;
    // Skip if not in enabled language set (when enabledLangs is empty, accept all).
    if (enabledLangs.length > 0 && !enabledLangs.includes(key)) continue;
    const content = (tb as Record<string, unknown>)[key];
    if (!isTextboxContent(content)) continue;
    const swapped = replaceMentions(content.text, resolution);
    if (swapped === content.text) continue;
    next[key] = { ...content, text: swapped };
    mutated = true;
  }
  return mutated ? (next as SpreadTextbox) : tb;
}

export async function runInjectJob(
  jobId: string,
  store: RemixStoreApi,
): Promise<void> {
  const updateJob = (patch: Partial<InjectJob>) => {
    store.setState((s) => ({
      injectJobs: s.injectJobs.map((j) =>
        j.id === jobId ? { ...j, ...patch } : j,
      ),
    }));
  };

  const getJob = () => store.getState().injectJobs.find((j) => j.id === jobId);

  const job0 = getJob();
  if (!job0) {
    log.warn('runInjectJob', 'job missing', { jobId });
    return;
  }

  log.info('runInjectJob', 'start', { jobId, remixId: job0.remixId });

  const remix = store.getState().remixes.find((r) => r.id === job0.remixId);
  if (!remix) {
    updateJob({
      status: 'error',
      errors: [{ stage: 'text-swap', message: 'Remix not found' }],
      completedAt: new Date().toISOString(),
    });
    toast.error('Inject failed — remix not found');
    return;
  }

  updateJob({ status: 'running', progress: 5 });

  try {
    const fallback = new Map(remix.characters.map((c) => [c.key, c.name]));
    const humansList = useHumansStore.getState().humans;
    const humansMap = new Map(humansList.map((h) => [h.id, h]));
    const currentLanguage = useEditorSettingsStore.getState().currentLanguage.code;
    const resolution = buildNameResolution(
      remix.remix_config.characters,
      fallback,
      humansMap,
      currentLanguage,
    );
    const enabledLangs = remix.remix_config.languages
      .filter((l) => l.is_enabled)
      .map((l) => l.code);

    const nextSpreads: RemixSpread[] = remix.illustration.spreads.map(
      (spread) => {
        const nextTextboxes = (spread.textboxes ?? []).map((tb) =>
          rewriteTextbox(tb, resolution, enabledLangs),
        );
        return { ...spread, textboxes: nextTextboxes };
      },
    );

    if (getJob()?.cancelFlag) {
      updateJob({
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      });
      toast.info('Inject cancelled');
      return;
    }

    store.getState().patchRemixIllustration(remix.id, nextSpreads);

    const { error } = await supabase
      .from('remixes')
      .update({
        illustration: { ...remix.illustration, spreads: nextSpreads },
      })
      .eq('id', remix.id);
    if (error) throw error;

    log.debug('runInjectJob', 'stage1 persisted', {
      remixId: remix.id,
      spreadCount: nextSpreads.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('runInjectJob', 'stage1 failed', { jobId, error: message });
    updateJob({
      status: 'error',
      errors: [{ stage: 'text-swap', message }],
      completedAt: new Date().toISOString(),
    });
    toast.error(`Inject failed for "${remix.name}"`);
    return;
  }

  if (getJob()?.cancelFlag) {
    updateJob({
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    toast.info('Inject cancelled');
    return;
  }

  // Stage 2 deferred — finalize with success toast informing about deferred stages.
  updateJob({
    progress: 100,
    status: 'completed',
    completedAt: new Date().toISOString(),
    errors: [],
  });
  toast.success(
    `Text swap completed for "${remix.name}". Audio/image swap pending backend.`,
  );
}
