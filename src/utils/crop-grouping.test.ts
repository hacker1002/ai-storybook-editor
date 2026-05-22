// crop-grouping.test.ts — Unit tests for groupCropsForKey.
// Core contract under test: crop sheets are built from STATIC-IMAGE layers
// ONLY. auto_pic (.lottie/.riv/.webm animations), video and audio layers must
// never become crops, even when tagged to the entity key.

import { describe, it, expect } from 'vitest';
import { groupCropsForKey } from './crop-grouping';
import type { GroupCropsContext } from './crop-grouping';
import { canonicalMixKey } from '@/types/remix';
import { mixLineupTokens } from '@/stores/remix-store/clone-builder';
import type { RemixIllustration } from '@/types/remix';
import type {
  SpreadImage,
  SpreadAutoPic,
  SpreadVideo,
  SpreadTag,
} from '@/types/spread-types';

// ── Fixture builders ─────────────────────────────────────────────────────────

function subjectTag(
  type: 'character' | 'prop',
  objectKey: string,
  variant = 'v1',
): SpreadTag {
  return { type, object_key: objectKey, variant_key: variant };
}

function makeImage(id: string, tags: SpreadTag[]): SpreadImage {
  return {
    id,
    media_url: `https://cdn/${id}.png`,
    aspect_ratio: '4:3',
    geometry: { x: 10, y: 20, w: 40, h: 30 },
    'z-index': 0,
    tags,
  } as unknown as SpreadImage;
}

/** Animated layer (.lottie) — must be excluded from crop sheets. */
function makeAutoPic(id: string, tags: SpreadTag[]): SpreadAutoPic {
  return {
    id,
    media_url: `https://cdn/${id}.lottie`,
    geometry: { x: 0, y: 0, w: 50, h: 50 },
    'z-index': 0,
    tags,
  } as unknown as SpreadAutoPic;
}

/** Video layer (.mp4) — must be excluded from crop sheets. */
function makeVideo(id: string, tags: SpreadTag[]): SpreadVideo {
  return {
    id,
    media_url: `https://cdn/${id}.mp4`,
    geometry: { x: 0, y: 0, w: 50, h: 50 },
    'z-index': 0,
    tags,
  } as unknown as SpreadVideo;
}

function makeIllustration(layers: {
  images?: SpreadImage[];
  auto_pics?: SpreadAutoPic[];
  videos?: SpreadVideo[];
}): RemixIllustration {
  return {
    sections: [],
    spreads: [
      {
        id: 's1',
        pages: [{ number: 1 }],
        images: layers.images ?? [],
        auto_pics: layers.auto_pics ?? [],
        videos: layers.videos ?? [],
        textboxes: [],
      },
    ],
  } as unknown as RemixIllustration;
}

/** Enabled-cast context — single-variant cast (baseVariant ''). */
function ctx(...keys: string[]): GroupCropsContext {
  return {
    enabledKeys: new Set(keys),
    cast: keys.map((key) => ({ key, baseVariant: '' })),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('groupCropsForKey — image-only crop selection', () => {
  it('includes a tagged image layer', () => {
    const ill = makeIllustration({
      images: [makeImage('img1', [subjectTag('character', 'c1')])],
    });
    const r = groupCropsForKey(ill, 'character', 'c1', ctx('c1'));
    expect(r.cropInputs).toHaveLength(1);
    expect(r.cropInputs[0].id).toBe('img1');
    expect(r.cropMetaById['img1'].media_url).toBe('https://cdn/img1.png');
  });

  // BUG GUARD — the .lottie-in-crop-sheet regression.
  it('excludes a tagged auto_pic (.lottie animation) layer', () => {
    const ill = makeIllustration({
      auto_pics: [makeAutoPic('anim1', [subjectTag('character', 'c1')])],
    });
    const r = groupCropsForKey(ill, 'character', 'c1', ctx('c1'));
    expect(r.cropInputs).toEqual([]);
    expect(r.cropMetaById).toEqual({});
  });

  it('excludes a tagged video layer', () => {
    const ill = makeIllustration({
      videos: [makeVideo('vid1', [subjectTag('character', 'c1')])],
    });
    const r = groupCropsForKey(ill, 'character', 'c1', ctx('c1'));
    expect(r.cropInputs).toEqual([]);
  });

  it('picks only the image when an image and an auto_pic share the key', () => {
    const ill = makeIllustration({
      images: [makeImage('img1', [subjectTag('character', 'c1')])],
      auto_pics: [makeAutoPic('anim1', [subjectTag('character', 'c1')])],
    });
    const r = groupCropsForKey(ill, 'character', 'c1', ctx('c1'));
    expect(r.cropInputs.map((c) => c.id)).toEqual(['img1']);
  });
});

describe('groupCropsForKey — enabled-aware fold + mix lineup', () => {
  // User bug: only didi enabled → a didi+leela layer must fold into didi.
  it('folds a co-occurrence into the sole enabled subject', () => {
    const ill = makeIllustration({
      images: [
        makeImage('img1', [
          subjectTag('character', 'didi'),
          subjectTag('character', 'leela'),
        ]),
      ],
    });
    const onlyDidi = ctx('didi');
    expect(
      groupCropsForKey(ill, 'character', 'didi', onlyDidi).cropInputs.map((c) => c.id),
    ).toEqual(['img1']);
    // leela is disabled → no crops, even though it is tagged on the layer.
    expect(groupCropsForKey(ill, 'character', 'leela', onlyDidi).cropInputs).toEqual([]);
  });

  it('keeps a genuine mix (≥2 enabled) out of either single key, matched by lineup', () => {
    const ill = makeIllustration({
      images: [
        makeImage('img1', [
          subjectTag('character', 'didi'),
          subjectTag('character', 'leela'),
        ]),
      ],
    });
    const both = ctx('didi', 'leela');
    expect(groupCropsForKey(ill, 'character', 'didi', both).cropInputs).toEqual([]);
    expect(groupCropsForKey(ill, 'character', 'leela', both).cropInputs).toEqual([]);

    const lineupKey = canonicalMixKey(
      mixLineupTokens(
        [
          { object_key: 'didi', variant_key: 'v1' },
          { object_key: 'leela', variant_key: 'v1' },
        ],
        both.cast,
      ),
    );
    expect(
      groupCropsForKey(ill, 'mix', lineupKey, both).cropInputs.map((c) => c.id),
    ).toEqual(['img1']);
  });
});
