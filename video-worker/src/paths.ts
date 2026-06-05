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

/** Output dir for rendered MP4s (served statically by the worker at /files). */
export const OUT_DIR = path.resolve(here, "../out");

/** Worker port — server bind. Override via env (PORT). The ThorVG WASM is no longer
 *  served by the worker (render adapter resolves it as a bundled `?url` asset), so the
 *  port no longer doubles as a WASM origin. */
export const WORKER_PORT = Number(process.env.PORT ?? 4000);

/** Public base URL of the worker — job-side absolutizes publicUrl → media_url leaf.
 *  Not used in v1 response (worker returns relative `/files/` path); kept for future. */
export const VIDEO_WORKER_PUBLIC_URL = process.env.VIDEO_WORKER_PUBLIC_URL ?? "";

/** Optional shared secret protecting /render* routes (POST only).
 *  Unset → bypass (dev loopback). Set → require X-Worker-Token header match. */
export const VIDEO_WORKER_TOKEN = process.env.VIDEO_WORKER_TOKEN ?? "";

/** Max bytes to fetch for BGM audio (SSRF + OOM guard). Default: 20 MB. */
export const BGM_MAX_BYTES = Number(process.env.BGM_MAX_BYTES ?? 20 * 1024 * 1024);
