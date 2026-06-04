// video-worker/src/paths.ts
// Resolved filesystem anchors shared across worker modules. The worker lives at
// ai-storybook-editor/video-worker/src/ → frontend src is two levels up.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** ai-storybook-editor/src — root the Remotion bundle resolves `@/` against. */
export const FRONTEND_SRC = path.resolve(here, "../../src");

/** Remotion entry registering the composition tree. */
export const REMOTION_ENTRY = path.join(FRONTEND_SRC, "remotion", "index.ts");

/** Output dir for rendered MP4s (served statically by the worker). */
export const OUT_DIR = path.resolve(here, "../out");

/** Static asset dir served at the worker origin. Holds the committed ThorVG WASM
 *  (`dotlottie-player.wasm`) that the headless Chromium fetches at render time. */
export const PUBLIC_DIR = path.resolve(here, "../public");

/** Source WASM shipped with the dotlottie-web lib — copied into PUBLIC_DIR by
 *  ensureWasmAsset() so it's served from the worker origin (not a Vite `?url` hash). */
export const WASM_SOURCE = path.resolve(
  FRONTEND_SRC,
  "../node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm",
);

/** Committed copy the worker actually serves. */
export const WASM_PUBLIC_FILE = path.join(PUBLIC_DIR, "dotlottie-player.wasm");

/** Worker port — single source for BOTH server bind and the WASM URL the render
 *  bundle fetches. Override via env to keep the two in lockstep (no drift). */
export const WORKER_PORT = Number(process.env.PORT ?? 4000);

/** Absolute origin of the worker. `setWasmUrl()` in the render bundle uses this
 *  (mirrored as a literal in the adapter, since the bundle can't import this Node module). */
export const WORKER_ORIGIN = process.env.VIDEO_WORKER_ORIGIN ?? `http://127.0.0.1:${WORKER_PORT}`;

/** Absolute URL the headless Chromium fetches the ThorVG WASM from. */
export const WASM_PUBLIC_URL = `${WORKER_ORIGIN}/dotlottie-player.wasm`;
