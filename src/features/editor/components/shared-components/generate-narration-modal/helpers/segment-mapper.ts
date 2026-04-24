// segment-mapper.ts — Convert a narrate-script API segment to the snapshot
// form. Sole difference is camelCase `voiceId` → snake_case `voice_id` (the
// snapshot convention; spec: snapshot/illustration-structure.md#textboxes).

import type { NarrationSegment as ApiNarrationSegment } from '@/apis/narrate-script-api';
import type { NarrationSegment } from '@/types/spread-types';

export function mapApiSegmentToSnapshot(
  apiSeg: ApiNarrationSegment,
): NarrationSegment {
  return {
    index: apiSeg.index,
    voice_id: apiSeg.voiceId,
    text: apiSeg.text,
    startMs: apiSeg.startMs,
    endMs: apiSeg.endMs,
    // WordTiming shape (text/startMs/endMs/charStart/charEnd) already matches
    // — no field renames needed.
    words: apiSeg.words,
  };
}
