// features/demo-spread-views/utils/request-video-render.ts
// Demo-only client for the video-worker /render endpoint. Posts the selected spread and
// returns an absolute MP4 URL (worker serves it from /files). Worker base URL is
// configurable via VITE_VIDEO_WORKER_URL (defaults to the local worker port).

import { createLogger } from "@/utils/logger";
import type { PlayableSpread } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";

const log = createLogger("Demo", "RequestVideoRender");

const WORKER_URL =
  (import.meta.env.VITE_VIDEO_WORKER_URL as string | undefined) ?? "http://localhost:4000";

export interface VideoRenderResult {
  url: string; // absolute, playable
  fileName: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  elapsedMs: number;
}

export async function requestVideoRender(
  spread: PlayableSpread,
  language: RemixLanguageCode,
  canvasSize?: { width: number; height: number }
): Promise<VideoRenderResult> {
  log.info("requestVideoRender", "POST /render", {
    spreadId: spread.id,
    language,
    canvasWidth: canvasSize?.width,
    canvasHeight: canvasSize?.height,
    worker: WORKER_URL,
  });

  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Design canvas size lets the worker scale render fonts/borders to match the live
      // player (font px is authored relative to this width). Omitted → worker default 800×600.
      body: JSON.stringify({
        spread,
        language,
        canvasWidth: canvasSize?.width,
        canvasHeight: canvasSize?.height,
      }),
    });
  } catch (err) {
    log.error("requestVideoRender", "network error reaching worker", {
      worker: WORKER_URL,
      error: String(err),
    });
    throw new Error(`Cannot reach render worker at ${WORKER_URL}. Is it running?`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error("requestVideoRender", "render failed", { status: res.status, body: body.slice(0, 200) });
    throw new Error(`Render failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as Omit<VideoRenderResult, "url"> & { url: string };
  log.info("requestVideoRender", "render ok", {
    fileName: data.fileName,
    elapsedMs: data.elapsedMs,
    durationInFrames: data.durationInFrames,
  });

  return { ...data, url: `${WORKER_URL}${data.url}` };
}

// ── Full-book render (≥2 spreads, page-turn between them) ──────────────────────
// Posts to the worker's /render-book endpoint (BookVideoComposition → per-turn
// book-turn-segment). Same worker base URL. Response uses `publicUrl` (durable
// artifact path) — mapped to an absolute `url` so the demo's <video> UI reuses
// the single-spread VideoRenderResult shape unchanged.

export interface BookVideoRenderResult extends VideoRenderResult {
  spreadsRendered: number;
  truncatedByCycle: boolean;
  truncatedByCap: boolean;
  warnings: string[];
}

interface BookRenderResponse {
  publicUrl: string;
  fileName: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  spreadsRendered: number;
  truncatedByCycle: boolean;
  truncatedByCap: boolean;
  warnings: string[];
  elapsedMs: number;
}

export async function requestBookVideoRender(
  spreads: PlayableSpread[],
  language: RemixLanguageCode,
  canvasSize?: { width: number; height: number },
  transitionSfxUrl?: string | null
): Promise<BookVideoRenderResult> {
  log.info("requestBookVideoRender", "POST /render-book", {
    spreadCount: spreads.length,
    spreadIds: spreads.map((s) => s.id.slice(0, 8)),
    language,
    canvasWidth: canvasSize?.width,
    hasTransitionSfx: Boolean(transitionSfxUrl),
    worker: WORKER_URL,
  });

  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/render-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Worker reads spreads/sections off `illustration`; empty sections → linear walk
      // (each spread.turnToNext='next' except the last) so 2 spreads yield exactly 1 turn.
      body: JSON.stringify({
        illustration: { spreads, sections: [] },
        edition: "classic",
        language,
        startSpreadId: spreads[0]?.id,
        canvasWidth: canvasSize?.width,
        canvasHeight: canvasSize?.height,
        transitionSfxUrl: transitionSfxUrl ?? undefined,
      }),
    });
  } catch (err) {
    log.error("requestBookVideoRender", "network error reaching worker", {
      worker: WORKER_URL,
      error: String(err),
    });
    throw new Error(`Cannot reach render worker at ${WORKER_URL}. Is it running?`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error("requestBookVideoRender", "book render failed", {
      status: res.status,
      body: body.slice(0, 200),
    });
    throw new Error(`Book render failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as BookRenderResponse;
  log.info("requestBookVideoRender", "render ok", {
    fileName: data.fileName,
    elapsedMs: data.elapsedMs,
    durationInFrames: data.durationInFrames,
    spreadsRendered: data.spreadsRendered,
  });

  return {
    url: `${WORKER_URL}${data.publicUrl}`,
    fileName: data.fileName,
    width: data.width,
    height: data.height,
    fps: data.fps,
    durationInFrames: data.durationInFrames,
    elapsedMs: data.elapsedMs,
    spreadsRendered: data.spreadsRendered,
    truncatedByCycle: data.truncatedByCycle,
    truncatedByCap: data.truncatedByCap,
    warnings: data.warnings,
  };
}
