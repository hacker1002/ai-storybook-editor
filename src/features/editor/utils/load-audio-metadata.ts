import { createLogger } from "@/utils/logger";

const log = createLogger("Util", "LoadAudioMetadata");

const DEFAULT_TIMEOUT_MS = 10_000;

export interface LoadAudioMetadataOptions {
  timeoutMs?: number;
}

export async function loadAudioMetadata(
  url: string,
  options: LoadAudioMetadataOptions = {},
): Promise<number | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  log.info("loadAudioMetadata", "start", { url });

  if (!url) {
    log.debug("loadAudioMetadata", "missing url", {});
    return null;
  }

  if (typeof Audio === "undefined") {
    log.debug("loadAudioMetadata", "Audio API unavailable (SSR)", {});
    return null;
  }

  return new Promise<number | null>((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";

    let settled = false;

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      try {
        audio.src = "";
      } catch {
        // ignore
      }
    };

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    const onLoaded = () => {
      const seconds = audio.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) {
        log.debug("loadAudioMetadata", "duration invalid", { seconds });
        finish(null);
        return;
      }
      const ms = Math.round(seconds * 1000);
      log.debug("loadAudioMetadata", "loaded", { ms });
      finish(ms);
    };

    const onError = () => {
      log.debug("loadAudioMetadata", "error event", {});
      finish(null);
    };

    const timer = setTimeout(() => {
      log.debug("loadAudioMetadata", "timeout", { timeoutMs });
      finish(null);
    }, timeoutMs);

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    audio.src = url;
  });
}
