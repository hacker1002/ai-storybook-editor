// video-worker/src/ensure-wasm-asset.ts
// Idempotent guard that the served ThorVG WASM (public/dotlottie-player.wasm) matches the
// lib copy in node_modules. The file is committed (deterministic deploys), but versions
// drift the moment `@lottiefiles/dotlottie-web` is bumped without re-copying — and a
// size-mismatched WASM fails to instantiate in headless Chromium (silent blank render).
// So at warmup we compare sizes and self-heal + warn, surfacing the drift instead of
// shipping a stale binary.
//
// Deployment checklist: bumping `@lottiefiles/dotlottie-web` ⇒ delete public/
// dotlottie-player.wasm (or let this re-copy) AND commit the new file.

import fs from "node:fs/promises";
import { WASM_SOURCE, WASM_PUBLIC_FILE } from "./paths";

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

/** Copy the lib WASM into public/ if missing or size-mismatched. Best-effort: a missing
 *  source (e.g. pruned node_modules in a packaged deploy) is tolerated as long as the
 *  committed copy exists. Throws only if neither source nor destination is present. */
export async function ensureWasmAsset(): Promise<void> {
  const [srcSize, dstSize] = await Promise.all([sizeOf(WASM_SOURCE), sizeOf(WASM_PUBLIC_FILE)]);

  if (srcSize === null) {
    if (dstSize === null) {
      throw new Error(
        `[wasm] no ThorVG WASM at source (${WASM_SOURCE}) nor public (${WASM_PUBLIC_FILE})`,
      );
    }
    console.warn(`[wasm] source missing; serving committed copy (${dstSize} bytes)`);
    return;
  }

  // Size equality is a pragmatic drift check: a version bump virtually always changes the
  // WASM byte length. It CAN miss two same-length builds (rare) — acceptable vs hashing 1.7MB
  // on every boot; the deployment checklist (delete+recommit on bump) is the real guard.
  if (dstSize === srcSize) return;

  if (dstSize !== null) {
    console.warn(
      `[wasm] version drift: public=${dstSize}B vs lib=${srcSize}B — re-copying (bump committed file)`,
    );
  }
  await fs.copyFile(WASM_SOURCE, WASM_PUBLIC_FILE);
  console.log(`[wasm] copied ThorVG WASM → public (${srcSize} bytes)`);
}
