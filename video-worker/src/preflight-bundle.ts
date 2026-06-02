// video-worker/src/preflight-bundle.ts
// De-risk gate (plan phase 02.5): run Remotion's bundle() against the shared entry to
// surface ALL webpack resolve errors (Vite `?url`, `@` alias, browser-only top-level)
// BEFORE building the render server. Exits non-zero on failure so it's CI-friendly.

import { bundle } from "@remotion/bundler";
import { REMOTION_ENTRY } from "./paths";
import { webpackOverride } from "./webpack-override";

async function main() {
  console.log("[preflight] entry:", REMOTION_ENTRY);
  const start = Date.now();
  try {
    const serveUrl = await bundle({
      entryPoint: REMOTION_ENTRY,
      webpackOverride,
      onProgress: (p) => {
        if (p % 25 === 0) console.log(`[preflight] bundling ${p}%`);
      },
    });
    console.log(`[preflight] OK serveUrl=${serveUrl} (${Date.now() - start}ms)`);
    process.exit(0);
  } catch (err) {
    console.error("[preflight] FAILED:\n", err);
    process.exit(1);
  }
}

void main();
