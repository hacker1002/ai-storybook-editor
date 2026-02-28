// remix-mock-factory.ts - Mock factory for RemixAsset data
import type { RemixAsset } from '@/components/playable-spread-view/types';

// Sample remix assets - target.key MUST match SpreadObject.name for swappability
// Object names from playable-spread-factory: main_character, side_character, prop_1, background_1
const SAMPLE_ASSETS: RemixAsset[] = [
  {
    name: 'Main Character',
    key: 'asset_main_char',
    type: 'character',
    image_url: 'https://picsum.photos/seed/mc/200/300',
    target: { name: 'Main Character', key: 'main_character' },
  },
  {
    name: 'Side Character',
    key: 'asset_side_char',
    type: 'character',
    image_url: 'https://picsum.photos/seed/sc/200/300',
    target: { name: 'Side Character', key: 'side_character' },
  },
  {
    name: 'Magic Prop',
    key: 'asset_prop_1',
    type: 'prop',
    image_url: 'https://picsum.photos/seed/prop/100/100',
    target: { name: 'Prop 1', key: 'prop_1' },
  },
];

/**
 * Create mock remix assets for demo purposes
 * @param count - Number of assets to return (default: 3, max: 3)
 * @returns Array of RemixAsset objects
 */
export function createMockRemixAssets(count: number = 3): RemixAsset[] {
  return SAMPLE_ASSETS.slice(0, Math.min(count, SAMPLE_ASSETS.length));
}

/**
 * Get a specific mock asset by key
 * @param key - Asset key to find
 * @returns RemixAsset or undefined
 */
export function getMockAssetByKey(key: string): RemixAsset | undefined {
  return SAMPLE_ASSETS.find((a) => a.key === key);
}

/**
 * Get all available asset keys
 * @returns Array of asset keys
 */
export function getMockAssetKeys(): string[] {
  return SAMPLE_ASSETS.map((a) => a.key);
}
