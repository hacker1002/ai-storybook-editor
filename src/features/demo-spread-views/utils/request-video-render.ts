// features/demo-spread-views/utils/request-video-render.ts
// Demo-only client for the video-worker /render endpoint. Posts the selected spread and
// returns an absolute MP4 URL (worker serves it from /files). Worker base URL is
// configurable via VITE_VIDEO_WORKER_URL (defaults to the local worker port).

import { createLogger } from "@/utils/logger";
import type { PlayableSpread } from "@/types/playable-types";

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
  language: "en_US" | "vi_VN"
): Promise<VideoRenderResult> {
  log.info("requestVideoRender", "POST /render", {
    spreadId: spread.id,
    language,
    worker: WORKER_URL,
  });

  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spread, language }),
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
