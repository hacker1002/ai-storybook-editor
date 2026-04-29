// apply-spread-narration-enhancements.ts — Persist narration enhancements
// onto retouch spread textboxes. Parses the multi-turn script string back
// into AudioChunks, resolves voices via readerToVoice (fallback narrator),
// and applies an equality guard so unchanged textboxes preserve existing
// audio results / sync flags.

import { createLogger } from '@/utils/logger';
import { NARRATOR_KEY } from '@/apis/text-api';
import { DEFAULT_INFERENCE_PARAMS } from '@/constants/config-constants';
import type {
  BaseSpread,
  SpreadTextbox,
  SpreadTextboxContent,
  TextboxAudio,
  TextboxAudioChunk,
} from '@/types/spread-types';
import type { ApplyEnhancementsPayload } from '../enhance-spread-narration-modal';

const log = createLogger('UI', 'ApplyNarrationEnhancements');

const SCRIPT_LINE_REGEX = /^@([a-z][a-z0-9_]{0,39}):\s*(.+)$/;

interface ProposedChunk {
  voice_id: string;
  script: string;
}

function parseEnhancedScript(
  scriptString: string,
  readerToVoice: Record<string, string>
): ProposedChunk[] {
  const proposed: ProposedChunk[] = [];
  const lines = scriptString
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
  for (const line of lines) {
    const match = SCRIPT_LINE_REGEX.exec(line);
    if (!match) {
      log.warn('parseEnhancedScript', 'malformed line', {
        preview: line.slice(0, 80),
      });
      continue;
    }
    const readerKey = match[1];
    const content = match[2];
    const voiceId =
      readerToVoice[readerKey] ?? readerToVoice[NARRATOR_KEY];
    if (!voiceId) {
      log.warn('parseEnhancedScript', 'no voice for reader', { readerKey });
      continue;
    }
    if (readerKey !== NARRATOR_KEY && !readerToVoice[readerKey]) {
      log.warn('parseEnhancedScript', 'unknown reader, fallback narrator', {
        readerKey,
      });
    }
    proposed.push({ voice_id: voiceId, script: content });
  }
  return proposed;
}

function chunksLogicallyEqual(
  existing: TextboxAudioChunk[],
  proposed: ProposedChunk[]
): boolean {
  if (existing.length !== proposed.length) return false;
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].voice_id !== proposed[i].voice_id) return false;
    if (existing[i].script !== proposed[i].script) return false;
  }
  return true;
}

function buildNewChunk(p: ProposedChunk): TextboxAudioChunk {
  return {
    voice_id: p.voice_id,
    script: p.script,
    stability: DEFAULT_INFERENCE_PARAMS.stability,
    similarity: DEFAULT_INFERENCE_PARAMS.similarity,
    exaggeration: DEFAULT_INFERENCE_PARAMS.exaggeration,
    speed: DEFAULT_INFERENCE_PARAMS.speed,
    script_synced: false,
    params_synced: false,
    results: [],
  };
}

export interface ApplyEnhancementsContext {
  spread: BaseSpread;
  payload: ApplyEnhancementsPayload;
  updateRetouchTextbox: (
    spreadId: string,
    textboxId: string,
    patch: Partial<SpreadTextbox>
  ) => void;
}

export function applySpreadNarrationEnhancements(
  ctx: ApplyEnhancementsContext
): void {
  const { spread, payload, updateRetouchTextbox } = ctx;
  if (!spread) {
    log.warn('apply', 'spread missing');
    return;
  }
  let applied = 0;
  let skipped = 0;
  for (const { id, enhanced_script } of payload.results) {
    const textbox = spread.textboxes.find(tb => tb.id === id);
    if (!textbox) continue;
    const existingContent = (textbox as Record<string, unknown>)[
      payload.language
    ] as SpreadTextboxContent | undefined;
    if (!existingContent || !existingContent.text) continue;

    const proposed = parseEnhancedScript(
      enhanced_script,
      payload.readerToVoice
    );
    if (proposed.length === 0) {
      log.warn('apply', 'parsed 0 chunks, skip textbox', { id });
      continue;
    }
    const existingChunks = existingContent.audio?.chunks ?? [];
    if (chunksLogicallyEqual(existingChunks, proposed)) {
      skipped++;
      continue;
    }
    const newChunks = proposed.map(buildNewChunk);
    const newAudio: TextboxAudio = {
      is_sync: false,
      combined_audio_url: null,
      word_timings: [],
      chunks: newChunks,
    };
    updateRetouchTextbox(payload.spreadId, id, {
      [payload.language]: { ...existingContent, audio: newAudio },
    } as Partial<SpreadTextbox>);
    applied++;
  }
  log.info('apply', 'done', {
    applied,
    skipped,
    total: payload.results.length,
  });
}
