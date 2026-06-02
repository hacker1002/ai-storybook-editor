// video-worker/test-scripts/gen-fixture.ts
// Dumps the demo's combined spread (read-along + video + webp + lottie) to a JSON payload
// for the render smoke test. Relies on tsx resolving the `@/*` paths from tsconfig.json.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCombinedDemoSpread } from "@/features/demo-spread-views/__mocks__/combined-demo-spread-fixture";

const here = path.dirname(fileURLToPath(import.meta.url));
const spread = createCombinedDemoSpread();
const payload = { spread, language: "en_US" };

const outDir = path.join(here, "fixtures");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "combined-spread.json");
writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`wrote ${outFile} — ${spread.animations.length} anims, id=${spread.id}`);
