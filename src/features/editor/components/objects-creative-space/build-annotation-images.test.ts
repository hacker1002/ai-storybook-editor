// build-annotation-images.test.ts — pure builder unit tests (design §4.8.1)
// Covers: filter char/prop tags, skip no-tag / other-only, skip missing URL,
// subject resolution (name/visual_description from entity+variant), subjects cap,
// existingDescription, dangling entity (name undefined but @key still sent).

import { describe, it, expect } from "vitest";
import { buildAnnotationImages } from "./build-annotation-images";
import type { SpreadImage, SpreadTag } from "@/types/spread-types";
import type { Character } from "@/types/character-types";
import type { Prop } from "@/types/prop-types";

const tag = (
  type: SpreadTag["type"],
  object_key: string,
  variant_key: string | null = "base"
): SpreadTag => ({ type, object_key, variant_key });

const img = (over: Partial<SpreadImage>): SpreadImage => ({
  id: "img-1",
  geometry: { x: 0, y: 0, w: 10, h: 10 },
  media_url: "https://cdn/x.png",
  ...over,
});

const character = (over: Partial<Character>): Character =>
  ({
    order: 0,
    name: "Elara",
    key: "elara",
    variants: [{ key: "base", visual_description: "girl with braids" }],
    ...over,
  }) as unknown as Character;

const prop = (over: Partial<Prop>): Prop =>
  ({
    order: 0,
    name: "Red Balloon",
    key: "red_balloon",
    variants: [{ key: "base", visual_description: "glossy red balloon" }],
    ...over,
  }) as unknown as Prop;

describe("buildAnnotationImages", () => {
  it("skips images with no tags or only 'other' tags", () => {
    const spread = {
      images: [
        img({ id: "no-tag" }),
        img({ id: "other-only", tags: [tag("other", "background", null)] }),
      ],
    };
    expect(buildAnnotationImages(spread, [], [])).toEqual([]);
  });

  it("skips images with no effective URL", () => {
    const spread = {
      images: [
        img({
          id: "no-url",
          media_url: undefined,
          illustrations: [],
          tags: [tag("character", "elara")],
        }),
      ],
    };
    expect(buildAnnotationImages(spread, [character({})], [])).toEqual([]);
  });

  it("resolves subject name + variant visual_description from entity", () => {
    const spread = {
      images: [
        img({
          id: "i1",
          tags: [tag("character", "elara", "base"), tag("prop", "red_balloon", "base")],
        }),
      ],
    };
    const rows = buildAnnotationImages(spread, [character({})], [prop({})]);
    expect(rows).toHaveLength(1);
    expect(rows[0].imageId).toBe("i1");
    expect(rows[0].subjects).toEqual([
      {
        key: "elara",
        type: "character",
        variant_key: "base",
        name: "Elara",
        visual_description: "girl with braids",
      },
      {
        key: "red_balloon",
        type: "prop",
        variant_key: "base",
        name: "Red Balloon",
        visual_description: "glossy red balloon",
      },
    ]);
  });

  it("dangling entity → name undefined but @key still sent", () => {
    const spread = {
      images: [img({ id: "i1", tags: [tag("character", "ghost", "base")] })],
    };
    const rows = buildAnnotationImages(spread, [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].subjects[0]).toEqual({
      key: "ghost",
      type: "character",
      variant_key: "base",
      name: undefined,
      visual_description: undefined,
    });
  });

  it("uses effective URL priority (final_hires > illustrations > media_url)", () => {
    const spread = {
      images: [
        img({
          id: "i1",
          media_url: "https://cdn/sketch.png",
          illustrations: [
            { media_url: "https://cdn/ill0.png", created_time: "", is_selected: false },
            { media_url: "https://cdn/sel.png", created_time: "", is_selected: true },
          ],
          final_hires_media_url: "https://cdn/hires.png",
          tags: [tag("character", "elara")],
        }),
      ],
    };
    const rows = buildAnnotationImages(spread, [character({})], []);
    expect(rows[0].effectiveUrl).toBe("https://cdn/hires.png");
  });

  it("caps subjects at 20", () => {
    const tags = Array.from({ length: 25 }, (_, i) =>
      tag("prop", `p_${i}`, "base")
    );
    const spread = { images: [img({ id: "i1", tags })] };
    const rows = buildAnnotationImages(spread, [], []);
    expect(rows[0].subjects).toHaveLength(20);
  });

  it("carries existingDescription from annotation", () => {
    const spread = {
      images: [
        img({
          id: "i1",
          tags: [tag("character", "elara")],
          annotation: { description: "already annotated" },
        }),
        img({ id: "i2", tags: [tag("character", "elara")] }),
      ],
    };
    const rows = buildAnnotationImages(spread, [character({})], []);
    expect(rows.find((r) => r.imageId === "i1")?.existingDescription).toBe(
      "already annotated"
    );
    expect(rows.find((r) => r.imageId === "i2")?.existingDescription).toBe("");
  });

  it("handles undefined spread", () => {
    expect(buildAnnotationImages(undefined, [], [])).toEqual([]);
  });
});
