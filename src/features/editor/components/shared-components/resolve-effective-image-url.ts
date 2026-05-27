// resolve-effective-image-url.ts — single source of truth for a SpreadImage's
// effective display/source URL. Priority order:
//   final_hires_media_url → illustrations[is_selected] → illustrations[0] → media_url (sketch)
// Used by editable-image.tsx (canvas render) and build-annotation-images.ts (payload build).

import type { SpreadImage } from "@/types/spread-types";

export function resolveEffectiveImageUrl(
  image: SpreadImage
): string | undefined {
  return (
    image.final_hires_media_url ||
    image.illustrations?.find((i) => i.is_selected)?.media_url ||
    image.illustrations?.[0]?.media_url ||
    image.media_url
  );
}
