// video-worker/src/render.ts
// Core render pipeline: bundle (cached once), select composition (duration derived in-
// bundle via calculateMetadata), renderMedia → MP4 in OUT_DIR. Blocking/CPU-bound; the
// server serialises calls. `@/` frontend modules resolve at runtime because the worker
// launches via tsx (video-worker/tsconfig.json paths: "@/*" → "../src/*") — same as
// render-book.ts — so canonical consts are imported, never mirrored.

import path from "node:path";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { SPREAD_COMPOSITION_ID } from "@/remotion/composition-metadata";
import { REMIX_LANGUAGE_CODES, type RemixLanguageCode } from "@/types/editor";
import { REMOTION_ENTRY, OUT_DIR } from "./paths";
import { webpackOverride } from "./webpack-override";

const RENDER_TIMEOUT_MS = 120_000;
const RENDER_CONCURRENCY = 2;

// App's supported narration languages — canonical list lives in @/types/editor;
// imported (not mirrored) so a new app language is recognised without touching the worker.
export const SUPPORTED_LANGUAGES = REMIX_LANGUAGE_CODES;
export type RenderLanguage = RemixLanguageCode;

export interface RenderInput {
  spread: unknown;
  language: RenderLanguage;
  // Book sizing forwarded into the composition inputProps: the design-canvas width
  // (which scales render fonts/borders to match the live player) is derived from
  // dimension (+ bleed). Optional — absent → composition 800×600 fallback (demo).
  dimension?: number;
  bleedMm?: number;
}

export interface RenderResult {
  outputLocation: string;
  fileName: string;
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
}

let bundlePromise: Promise<string> | null = null;

/** Bundle the shared Remotion entry once; subsequent calls reuse the same serveUrl.
 *  A failed bundle clears the cache so the next call retries instead of memoizing the
 *  rejection forever (which would otherwise require a server restart). */
export function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: REMOTION_ENTRY, webpackOverride }).catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }
  return bundlePromise;
}

/** Boot-time warm-up: download Chrome (once) + pre-bundle so the first request is fast. */
export async function warmup(): Promise<void> {
  await ensureBrowser();
  await getBundle();
}

export async function renderSpread(input: RenderInput, fileName: string): Promise<RenderResult> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const serveUrl = await getBundle();

  // Remotion types inputProps as Record<string, unknown>; our concrete shape widens to it.
  const inputProps = input as unknown as Record<string, unknown>;

  const composition = await selectComposition({
    serveUrl,
    id: SPREAD_COMPOSITION_ID,
    inputProps,
  });

  const outputLocation = path.join(OUT_DIR, fileName);

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation,
    inputProps,
    concurrency: RENDER_CONCURRENCY,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    chromiumOptions: { gl: "angle" },
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 20 === 0) console.log(`[render] ${fileName} ${pct}%`);
    },
  });

  return {
    outputLocation,
    fileName,
    durationInFrames: composition.durationInFrames,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
  };
}
