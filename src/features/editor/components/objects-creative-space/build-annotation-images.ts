// build-annotation-images.ts — pure builder turning a spread's image layers into
// AnnotationRowInput[] for EnhanceImageAnnotationModal. Exported standalone so it
// can be unit-tested without React/store. See design §4.8.1.
//
// Rules:
//   - keep only images with ≥1 tag of type character|prop (skip no-tag / other-only)
//   - skip images with no effective URL (not yet generated)
//   - resolve each subject's name + visual_description from the matching entity/variant
//     (Character/Prop have NO entity-level visual_description — variant-level only)
//   - cap subjects at MAX_ANNOTATION_SUBJECTS_PER_IMAGE

import type { SpreadImage } from "@/types/spread-types";
import type { Character } from "@/types/character-types";
import type { Prop } from "@/types/prop-types";
import { MAX_ANNOTATION_SUBJECTS_PER_IMAGE } from "@/apis/text-api";
import { resolveEffectiveImageUrl } from "@/features/editor/components/shared-components/resolve-effective-image-url";
import type { AnnotationRowInput } from "./enhance-image-annotation-modal";

interface SpreadLike {
  images?: SpreadImage[];
}

export function buildAnnotationImages(
  spread: SpreadLike | undefined,
  characters: Character[],
  props: Prop[]
): AnnotationRowInput[] {
  const images = spread?.images ?? [];
  const rows: AnnotationRowInput[] = [];

  for (const img of images) {
    const subjectTags =
      img.tags?.filter((t) => t.type === "character" || t.type === "prop") ??
      [];
    if (subjectTags.length === 0) continue;

    const effectiveUrl = resolveEffectiveImageUrl(img);
    if (!effectiveUrl) continue;

    const subjects = subjectTags
      .map((tag) => {
        const entity =
          tag.type === "character"
            ? characters.find((c) => c.key === tag.object_key)
            : props.find((p) => p.key === tag.object_key);
        const variant = entity?.variants?.find(
          (v) => v.key === tag.variant_key
        );
        return {
          key: tag.object_key,
          type: tag.type as "character" | "prop",
          variant_key: tag.variant_key,
          name: entity?.name,
          visual_description: variant?.visual_description,
        };
      })
      .slice(0, MAX_ANNOTATION_SUBJECTS_PER_IMAGE);

    rows.push({
      imageId: img.id,
      effectiveUrl,
      subjects,
      existingDescription: img.annotation?.description ?? "",
    });
  }

  return rows;
}
