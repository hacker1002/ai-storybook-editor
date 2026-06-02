// video-worker/src/server.ts
// Minimal demo render server. POST /render { spread, language } → renders MP4 → returns a
// served URL. Output written locally and exposed via /files (static). Renders run one at a
// time (CPU/RAM bound); a small in-flight guard rejects concurrent requests rather than
// risk OOM. Dev-only: bound to localhost, permissive CORS for the Vite demo origin.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import { OUT_DIR } from "./paths";
import { renderSpread, warmup, type RenderInput } from "./render";
import { classifyRenderError } from "./errors";

const PORT = Number(process.env.PORT ?? 4000);
const MAX_KEEP_FILES = 10;

const app = express();
app.use(express.json({ limit: "30mb" }));

// Dev CORS (demo runs on a different Vite port).
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use("/files", express.static(OUT_DIR));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

let rendering = false;

app.post("/render", async (req: Request, res: Response) => {
  const { spread, language } = req.body ?? {};
  if (!spread || typeof spread !== "object") {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", message: "`spread` object required" });
    return;
  }
  if (rendering) {
    res.status(429).json({ ok: false, code: "BUSY", message: "another render in progress" });
    return;
  }

  const input: RenderInput = { spread, language: language === "vi_VN" ? "vi_VN" : "en_US" };
  const fileName = `spread-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
  rendering = true;
  const start = Date.now();
  console.log(`[render] start ${fileName} lang=${input.language}`);

  try {
    const result = await renderSpread(input, fileName);
    await pruneOldFiles();
    const elapsedMs = Date.now() - start;
    console.log(`[render] done ${fileName} frames=${result.durationInFrames} ${elapsedMs}ms`);
    res.json({
      ok: true,
      url: `/files/${fileName}`,
      fileName,
      width: result.width,
      height: result.height,
      fps: result.fps,
      durationInFrames: result.durationInFrames,
      elapsedMs,
    });
  } catch (err) {
    const c = classifyRenderError(err);
    console.error(`[render] failed ${fileName} code=${c.code}: ${c.message}`);
    res.status(c.status).json({ ok: false, code: c.code, message: c.message });
  } finally {
    rendering = false;
  }
});

/** Keep only the most-recent MAX_KEEP_FILES MP4s so the ephemeral out dir doesn't fill. */
async function pruneOldFiles(): Promise<void> {
  try {
    const entries = await fs.readdir(OUT_DIR);
    const mp4s = entries.filter((f) => f.endsWith(".mp4")).sort();
    const excess = mp4s.slice(0, Math.max(0, mp4s.length - MAX_KEEP_FILES));
    await Promise.all(excess.map((f) => fs.unlink(path.join(OUT_DIR, f)).catch(() => undefined)));
  } catch {
    /* best-effort cleanup */
  }
}

async function main() {
  console.log("[server] warming up (browser + bundle)...");
  await warmup();
  // Bind loopback only — enforces the dev-only posture (no auth, wildcard CORS).
  app.listen(PORT, "127.0.0.1", () => console.log(`[server] ready on http://localhost:${PORT}`));
}

void main();
