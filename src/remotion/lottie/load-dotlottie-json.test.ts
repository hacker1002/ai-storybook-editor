// @vitest-environment node
// Run in node (not jsdom): fflate's unzipSync mangles filenames under jsdom's TextDecoder,
// and this loader needs no DOM (fetch/btoa/TextDecoder are node globals — same as the
// worker runtime where it actually executes).
import { describe, it, expect, vi, afterEach } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { loadDotLottieAnimationData } from "./load-dotlottie-json";

// Build a synthetic dotLottie (v2 compact layout: a/<id>.json + i/<asset>.png).
function buildDotLottie(opts: { animPath: string; assetExternal: boolean }): Uint8Array {
  const anim = {
    v: "5.9.0",
    fr: 30,
    op: 120,
    w: 100,
    h: 100,
    assets: [{ id: "image_0", w: 10, h: 10, u: "/i/", p: "image_0.png", e: opts.assetExternal ? 0 : 1 }],
    layers: [],
  };
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]); // fake PNG header + data
  return zipSync({
    "manifest.json": strToU8(JSON.stringify({ version: "2", animations: [{ id: "leela" }] })),
    [opts.animPath]: strToU8(JSON.stringify(anim)),
    "i/image_0.png": pngBytes,
  });
}

function mockFetchWith(bytes: Uint8Array) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.slice().buffer, // clean copy → exact bytes regardless of view offset
    }))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("loadDotLottieAnimationData", () => {
  it("finds the animation in v2 'a/' layout", async () => {
    mockFetchWith(buildDotLottie({ animPath: "a/leela.json", assetExternal: true }));
    const anim = (await loadDotLottieAnimationData("x.lottie")) as { w: number; fr: number };
    expect(anim.w).toBe(100);
    expect(anim.fr).toBe(30);
  });

  it("finds the animation in v1 'animations/' layout", async () => {
    mockFetchWith(buildDotLottie({ animPath: "animations/leela.json", assetExternal: true }));
    const anim = (await loadDotLottieAnimationData("x.lottie")) as { op: number };
    expect(anim.op).toBe(120);
  });

  it("inlines an external image asset as a base64 data URI", async () => {
    mockFetchWith(buildDotLottie({ animPath: "a/leela.json", assetExternal: true }));
    const anim = (await loadDotLottieAnimationData("x.lottie")) as {
      assets: Array<{ p: string; u: string; e: number }>;
    };
    expect(anim.assets[0].e).toBe(1);
    expect(anim.assets[0].u).toBe("");
    expect(anim.assets[0].p).toMatch(/^data:image\/png;base64,/);
  });

  it("leaves already-embedded assets untouched", async () => {
    mockFetchWith(buildDotLottie({ animPath: "a/leela.json", assetExternal: false }));
    const anim = (await loadDotLottieAnimationData("x.lottie")) as {
      assets: Array<{ p: string; e: number }>;
    };
    expect(anim.assets[0].e).toBe(1);
    expect(anim.assets[0].p).toBe("image_0.png"); // not rewritten
  });

  it("passes through a plain (non-zip) lottie JSON", async () => {
    mockFetchWith(strToU8(JSON.stringify({ v: "5.9.0", w: 42, assets: [] })));
    const anim = (await loadDotLottieAnimationData("x.json")) as { w: number };
    expect(anim.w).toBe(42);
  });

  it("throws when no animation json is present", async () => {
    const zip = zipSync({ "manifest.json": strToU8("{}") });
    mockFetchWith(zip);
    await expect(loadDotLottieAnimationData("x.lottie")).rejects.toThrow(/no animation json/);
  });
});
