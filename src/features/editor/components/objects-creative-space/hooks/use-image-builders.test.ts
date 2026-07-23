// use-image-builders.test.ts — buildExtractImages AI-provenance threading (cost attribution).
// Focus: ExtractResult.aiRequestId → illustrations[].ai_request_id on the spawned entry.
//   • AI extract (Layers / Background) → id set; N layers from one call SHARE the same id.
//   • CV crop (Objects / Crops, no aiRequestId) → key absent (never fabricated).
// Uses the raw path (zTier:null + addImage override) so no spread/z-tier scaffolding is needed.

import { describe, it, expect } from 'vitest';
import { buildExtractImages } from './use-image-builders';
import type { SpreadImage } from '@/types/canvas-types';
import type { ExtractResult } from '@/features/editor/components/shared-components';

const SOURCE: SpreadImage = { id: 'src-1', geometry: { x: 0, y: 0, w: 100, h: 100 } };

/** Capture the spawned images via the addImage override (raw path — no store). */
function runBuilder(results: ExtractResult[]): SpreadImage[] {
  const captured: SpreadImage[] = [];
  // Only options.addImage is exercised; actions default is never dereferenced here.
  const actions = {} as unknown as Parameters<typeof buildExtractImages>[4];
  buildExtractImages(results, SOURCE, 'spread-1', [], actions, {
    addImage: (_spreadId, img) => captured.push(img),
    zTier: null,
  });
  return captured;
}

describe('buildExtractImages — AI provenance (ai_request_id)', () => {
  it('threads a shared aiRequestId onto every layering result entry (1 call = 1 id)', () => {
    const AI_ID = 'ai-layer-abc';
    const results: ExtractResult[] = [
      { id: 'r1', media_url: 'https://s/layer-1.png', sourceTab: 'layering', title: 'L1', aiRequestId: AI_ID, meta: { layerIndex: 0 } },
      { id: 'r2', media_url: 'https://s/layer-2.png', sourceTab: 'layering', title: 'L2', aiRequestId: AI_ID, meta: { layerIndex: 1 } },
    ];

    const spawned = runBuilder(results);

    expect(spawned).toHaveLength(2);
    expect(spawned[0].illustrations?.[0].ai_request_id).toBe(AI_ID);
    // All N layers from one call share the SAME id (not fabricated per-layer).
    expect(spawned[1].illustrations?.[0].ai_request_id).toBe(AI_ID);
  });

  it('threads the background aiRequestId onto the single generated entry', () => {
    const results: ExtractResult[] = [
      { id: 'bg1', media_url: 'https://s/bg-1.png', sourceTab: 'background', title: 'BG', aiRequestId: 'ai-bg-xyz', meta: { permanent: true } },
    ];

    const spawned = runBuilder(results);

    expect(spawned[0].illustrations?.[0].ai_request_id).toBe('ai-bg-xyz');
  });

  it('omits ai_request_id for CV crop results (no AI provenance → key never fabricated)', () => {
    const results: ExtractResult[] = [
      { id: 'c1', media_url: 'https://s/crop-1.png', sourceTab: 'crop', title: 'C1', meta: { geometry: { x: 10, y: 10, w: 20, h: 20 } } },
    ];

    const spawned = runBuilder(results);
    const entry = spawned[0].illustrations?.[0];

    expect(entry).toBeDefined();
    // Key must be ABSENT (not present-with-undefined) so uploaded/CV entries read as NULL provenance.
    expect(entry && 'ai_request_id' in entry).toBe(false);
  });
});
