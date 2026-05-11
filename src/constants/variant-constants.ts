// variant-constants.ts - Shared constants for entity variant keys.
//
// Every character/prop/stage is seeded with exactly one base variant
// (type=0, key=BASE_VARIANT_KEY). ItemTagsSection auto-fill, defensive
// fallbacks, and variant-dropdown sort/placeholder MUST stay aligned
// with this seed — divergence creates immediate dangling refs.
//
// See ADR-027 (Layer Subject Identity via tags[]).

export const BASE_VARIANT_KEY = 'base';
export const BASE_VARIANT_NAME = 'Base';
