// supabase-mapping.ts — Convert raw Supabase row → Remix domain type.
// JSONB columns come back as `unknown`-shaped objects; narrow defensively.

import type {
  Remix,
  RemixCharacter,
  RemixConfig,
  RemixIllustration,
  RemixMix,
  RemixProp,
  RemixSpriteEntry,
} from '@/types/remix';
import type { Distribution } from '@/types/editor';

interface RawRemixRow {
  id: string;
  snapshot_id: string;
  name?: string | null;
  remix_config?: unknown;
  illustration?: unknown;
  characters?: unknown;
  props?: unknown;
  mixes?: unknown;
  sprites?: unknown;
  distribution?: unknown;
  created_at: string;
  updated_at: string;
}

const EMPTY_ILLUSTRATION: RemixIllustration = { spreads: [], sections: [] };
const EMPTY_CONFIG: RemixConfig = {
  characters: [],
  props: [],
  voices: [],
  languages: [],
};

export function mapRowToRemix(row: RawRemixRow): Remix {
  return {
    id: row.id,
    snapshot_id: row.snapshot_id,
    name: row.name ?? 'New Remix',
    remix_config: (row.remix_config as RemixConfig | null) ?? EMPTY_CONFIG,
    illustration: (row.illustration as RemixIllustration | null) ?? EMPTY_ILLUSTRATION,
    characters: (row.characters as RemixCharacter[] | null) ?? [],
    props: (row.props as RemixProp[] | null) ?? [],
    mixes: (row.mixes as RemixMix[] | null) ?? [],
    // Sprite plane (Variants tab) — additive JSONB; legacy rows omit it.
    sprites: (row.sprites as RemixSpriteEntry[] | null) ?? [],
    // Nullable JSONB — reader coalesces to DEFAULT at render (KISS: no
    // normalize at ingress; shape is small + tolerated downstream).
    distribution: (row.distribution as Distribution | null) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
