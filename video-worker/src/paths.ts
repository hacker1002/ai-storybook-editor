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
