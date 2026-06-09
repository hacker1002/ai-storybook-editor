// sprite-layout.test.ts — Pure sprite-plane layout helpers.

import { describe, it, expect } from 'vitest';
import type { Remix, RemixSpriteEntry } from '@/types/remix';
import {
  groupVariantsForSprite,
  partitionByObjectAffinity,
  originalVariantArtwork,
  currentCellsOfSprite,
  addSpriteSubset,
  buildSeedSprite,
  spriteCellKey,
  type SpriteCell,
} from './sprite-layout';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function illus(url: string, selected = true) {
  return { media_url: url, created_time: '2026-06-08T00:00:00Z', is_selected: selected };
}

function variant(key: string, type: 0 | 1, urls: { url: string; sel: boolean }[]) {
  return {
    name: key,
    key,
    type,
    appearance: {} as never,
    visual_description: '',
    illustrations: urls.map((u) => illus(u.url, u.sel)),
    image_references: [],
  };
}

function makeRemix(opts: {
  chars: { key: string; enabled: boolean; variants: ReturnType<typeof variant>[] }[];
}): Remix {
  return {
    id: 'r1',
    snapshot_id: 's1',
    name: 'R',
    remix_config: {
      characters: opts.chars.map((c) => ({
        key: c.key,
        human_id: 'h1',
        visual: 'v1',
        traits: [],
        base_image_url: null,
        is_enabled: c.enabled,
      })),
      props: [],
      voices: [],
      languages: [],
    },
    illustration: { spreads: [], sections: [] },
    characters: opts.chars.map((c) => ({
      order: 0,
      name: c.key,
      key: c.key,
      basic_info: {} as never,
      personality: {} as never,
      variants: c.variants,
      voice_setting: null,
    })) as never,
    props: [],
    mixes: [],
    sprites: [],
    created_at: '',
    updated_at: '',
  };
}

// ── originalVariantArtwork ───────────────────────────────────────────────────

describe('originalVariantArtwork', () => {
  it('prefers the selected illustration', () => {
    expect(
      originalVariantArtwork({
        illustrations: [illus('a', false), illus('b', true)],
      }),
    ).toBe('b');
  });
  it('falls back to first then null', () => {
    expect(
      originalVariantArtwork({ illustrations: [illus('a', false)] }),
    ).toBe('a');
    expect(originalVariantArtwork({ illustrations: [] })).toBeNull();
    expect(originalVariantArtwork({})).toBeNull();
  });
});

// ── groupVariantsForSprite ───────────────────────────────────────────────────

describe('groupVariantsForSprite', () => {
  it('collects enabled-character variants with artwork, skips disabled + artwork-less', () => {
    const remix = makeRemix({
      chars: [
        { key: 'c1', enabled: true, variants: [variant('base', 0, [{ url: 'c1b', sel: true }]), variant('v1', 1, [{ url: 'c1v1', sel: true }])] },
        { key: 'c2', enabled: false, variants: [variant('base', 0, [{ url: 'c2b', sel: true }])] },
        { key: 'c3', enabled: true, variants: [variant('base', 0, [])] }, // no artwork
      ],
    });
    const cells = groupVariantsForSprite(remix);
    expect(cells.map((c) => c.object_key)).toEqual(['c1', 'c1']);
    expect(cells.map((c) => c.variant_key)).toEqual(['base', 'v1']);
    expect(cells.every((c) => c.type === 'character')).toBe(true);
  });

  it('dedups by cellKey', () => {
    const remix = makeRemix({
      chars: [{ key: 'c1', enabled: true, variants: [variant('base', 0, [{ url: 'x', sel: true }]), variant('base', 0, [{ url: 'y', sel: true }])] }],
    });
    expect(groupVariantsForSprite(remix)).toHaveLength(1);
  });
});

// ── partitionByObjectAffinity ────────────────────────────────────────────────

const cell = (obj: string, vk: string): SpriteCell => ({
  type: 'character',
  object_key: obj,
  variant_key: vk,
  media_url: `${obj}/${vk}`,
});

describe('partitionByObjectAffinity', () => {
  it('K=1 packs all cells onto one sheet, no overlap', () => {
    const cells = [cell('a', '1'), cell('a', '2'), cell('b', '1')];
    const sheets = partitionByObjectAffinity(cells, 1);
    expect(sheets).toHaveLength(1);
    const crops = sheets[0].crops;
    expect(crops).toHaveLength(3);
    // No overlapping geometry (uniform squares packed by the engine).
    for (let i = 0; i < crops.length; i++) {
      for (let j = i + 1; j < crops.length; j++) {
        const a = crops[i].geometry;
        const b = crops[j].geometry;
        const disjoint =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(disjoint).toBe(true);
      }
    }
  });

  it('K>=2 keeps a character on a single sheet when clusters fit the per-sheet budget', () => {
    // 2+2 cells, K=2 → each cluster's area equals the budget (not OVER it), so
    // the engine keeps each character intact (oversized clusters that exceed the
    // budget are split crop-by-crop — that's a separate, documented case).
    const cells = [cell('a', '1'), cell('a', '2'), cell('b', '1'), cell('b', '2')];
    const sheets = partitionByObjectAffinity(cells, 2);
    expect(sheets).toHaveLength(2);
    const sheetOf = (obj: string, vk: string) =>
      sheets.findIndex((s) => s.crops.some((c) => c.object_key === obj && c.variant_key === vk));
    expect(new Set([sheetOf('a', '1'), sheetOf('a', '2')]).size).toBe(1);
    expect(new Set([sheetOf('b', '1'), sheetOf('b', '2')]).size).toBe(1);
  });

  // Column counts below depend on `landscapeTolerance: 0.1` in the sprite layout
  // — square cells would otherwise stack into a tall single column for 2–3 cells.
  it('packs 2 cells into a 2-col single row (not a vertical stack)', () => {
    const cells = [cell('a', '1'), cell('a', '2')];
    const crops = partitionByObjectAffinity(cells, 1).flatMap((s) => s.crops);
    expect(new Set(crops.map((c) => c.geometry.x)).size).toBe(2); // 2 columns
    expect(new Set(crops.map((c) => c.geometry.y)).size).toBe(1); // 1 row
  });

  it('packs 3 cells into a 2-col [2,1] grid (not a vertical stack)', () => {
    const cells = [cell('a', '1'), cell('a', '2'), cell('a', '3')];
    const crops = partitionByObjectAffinity(cells, 1).flatMap((s) => s.crops);
    expect(new Set(crops.map((c) => c.geometry.x)).size).toBe(2); // 2 columns
    expect(new Set(crops.map((c) => c.geometry.y)).size).toBe(2); // 2 rows [2,1]
  });

  it('packs 5 cells into a 3-col × 2-row landscape grid', () => {
    const cells = [
      cell('a', '1'), cell('a', '2'), cell('a', '3'), cell('a', '4'), cell('a', '5'),
    ];
    const sheets = partitionByObjectAffinity(cells, 1);
    expect(sheets).toHaveLength(1);
    expect(new Set(sheets[0].crops.map((c) => c.geometry.x)).size).toBe(3);
    expect(new Set(sheets[0].crops.map((c) => c.geometry.y)).size).toBe(2);
  });

  it('frames a square cell grid to a 1:1 sheet (N=3 [2,1] and N=4 2×2)', () => {
    // Square content + equal re-frame margins → square sheet. Guards against the
    // engine's ratio snap (which would stretch the 2×2[2,1] sheet to 4:3).
    for (const n of [3, 4]) {
      const cells = Array.from({ length: n }, (_, i) => cell('a', String(i)));
      const sheet = partitionByObjectAffinity(cells, 1)[0];
      expect(sheet.sheet_geometry.width).toBe(sheet.sheet_geometry.height);
    }
  });

  it('spaces cells EVENLY — horizontal gap === vertical gap (2·gutter = 64px)', () => {
    // 4 cells @600 → 2×2 grid. Equal gutters → identical gaps on both axes.
    const cells = Array.from({ length: 4 }, (_, i) => cell('a', String(i)));
    const crops = partitionByObjectAffinity(cells, 1).flatMap((s) => s.crops);
    const w = crops[0].geometry.w;
    const h = crops[0].geometry.h;
    const xs = [...new Set(crops.map((c) => c.geometry.x))].sort((a, b) => a - b);
    const ys = [...new Set(crops.map((c) => c.geometry.y))].sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(ys).toHaveLength(2);
    const gapX = xs[1] - (xs[0] + w);
    const gapY = ys[1] - (ys[0] + h);
    expect(gapX).toBe(64);
    expect(gapY).toBe(64);
    expect(gapX).toBe(gapY);
  });

  it('swap_results always empty + image_url empty on fresh layout', () => {
    const sheets = partitionByObjectAffinity([cell('a', '1')], 1);
    expect(sheets[0].swap_results).toEqual([]);
    expect(sheets[0].image_url).toBe('');
  });
});

// ── cell dimension (resolution ceiling) + sheet cap guard ────────────────────

const MAX_SHEET_DIM = 8192;
const MAX_SHEET_PIXELS = 32_000_000;

describe('partitionByObjectAffinity — cell dimension by cells-per-sheet', () => {
  it.each([
    [1, 2000],
    [2, 1000],
    [3, 800],
    [4, 600],
    [8, 600],
  ])('%i cell(s)/sheet → %ipx square cells', (n, dim) => {
    const cells = Array.from({ length: n }, (_, i) => cell('a', String(i)));
    const crops = partitionByObjectAffinity(cells, 1).flatMap((s) => s.crops);
    expect(crops).toHaveLength(n);
    for (const c of crops) {
      expect(c.geometry.w).toBe(dim);
      expect(c.geometry.h).toBe(dim);
    }
  });

  it('keys off PER-SHEET count: 4 cells over K=2 → 2 cells/sheet → 1000px', () => {
    const cells = [cell('a', '1'), cell('a', '2'), cell('b', '1'), cell('b', '2')];
    const crops = partitionByObjectAffinity(cells, 2).flatMap((s) => s.crops);
    for (const c of crops) expect(c.geometry.w).toBe(1000);
  });
});

describe('partitionByObjectAffinity — sheet cap guard', () => {
  it('clamps an over-cap sheet within both caps, crops stay in-bounds + scaled', () => {
    // Far more cells than fit at 600px on K=1 → sheet overflows 8192px / 32 MP →
    // guard must scale the whole sheet down rather than emit an un-swappable one.
    const cells = Array.from({ length: 150 }, (_, i) => cell('a', String(i)));
    const sheets = partitionByObjectAffinity(cells, 1);
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0];
    const { width, height } = sheet.sheet_geometry;
    expect(width).toBeLessThanOrEqual(MAX_SHEET_DIM);
    expect(height).toBeLessThanOrEqual(MAX_SHEET_DIM);
    expect(width * height).toBeLessThanOrEqual(MAX_SHEET_PIXELS);
    // Clamp genuinely engaged → cells shrank below their 600px tier.
    expect(sheet.crops[0].geometry.w).toBeLessThan(600);
    for (const c of sheet.crops) {
      expect(c.geometry.x).toBeGreaterThanOrEqual(0);
      expect(c.geometry.y).toBeGreaterThanOrEqual(0);
      expect(c.geometry.x + c.geometry.w).toBeLessThanOrEqual(width);
      expect(c.geometry.y + c.geometry.h).toBeLessThanOrEqual(height);
    }
  });

  it('within-cap sheets are NOT clamped (cells keep their full tier dimension)', () => {
    const cells = Array.from({ length: 8 }, (_, i) => cell('a', String(i)));
    const crops = partitionByObjectAffinity(cells, 1).flatMap((s) => s.crops);
    // 8 cells @600px well under caps → exact 600, no down-scale.
    for (const c of crops) expect(c.geometry.w).toBe(600);
  });
});

// ── currentCellsOfSprite + addSpriteSubset ───────────────────────────────────

function spriteFrom(cells: SpriteCell[]): RemixSpriteEntry {
  return { id: 'sp1', order: 0, name: 'Sprite 1', crop_sheets: partitionByObjectAffinity(cells, 1) };
}

describe('currentCellsOfSprite + addSpriteSubset', () => {
  it('currentCellsOfSprite dedups across sheets', () => {
    const sprite = spriteFrom([cell('a', '1'), cell('a', '2'), cell('b', '1')]);
    expect(currentCellsOfSprite(sprite)).toHaveLength(3);
  });

  it('addSpriteSubset filters to selected cellKeys', () => {
    const sprite = spriteFrom([cell('a', '1'), cell('a', '2'), cell('b', '1')]);
    const sel = new Set([spriteCellKey(cell('a', '1')), spriteCellKey(cell('b', '1'))]);
    const sheets = addSpriteSubset(sprite, sel);
    const keys = sheets.flatMap((s) => s.crops.map((c) => spriteCellKey(c)));
    expect(new Set(keys)).toEqual(sel);
  });

  it('addSpriteSubset returns [] when nothing matches', () => {
    const sprite = spriteFrom([cell('a', '1')]);
    expect(addSpriteSubset(sprite, new Set(['character/zzz/9']))).toEqual([]);
  });
});

// ── buildSeedSprite ──────────────────────────────────────────────────────────

describe('buildSeedSprite', () => {
  it('seeds Sprite 1 (K=1) from enabled variants; null when already seeded', () => {
    const remix = makeRemix({
      chars: [{ key: 'c1', enabled: true, variants: [variant('base', 0, [{ url: 'x', sel: true }])] }],
    });
    const seed = buildSeedSprite(remix);
    expect(seed?.name).toBe('Sprite 1');
    expect(seed?.crop_sheets[0].crops).toHaveLength(1);

    const seeded = { ...remix, sprites: [seed!] };
    expect(buildSeedSprite(seeded)).toBeNull();
  });

  it('null when no variant cells', () => {
    const remix = makeRemix({ chars: [{ key: 'c1', enabled: false, variants: [] }] });
    expect(buildSeedSprite(remix)).toBeNull();
  });
});
