// remotion/lottie/deterministic-lottie-player.tsx
// Frame-deterministic drop-in for editor's dot-lottie-player.tsx (aliased in via the
// worker's webpack-override). The original uses @lottiefiles/dotlottie-web (rAF-driven +
// Vite `?url` WASM) which freezes under render and breaks webpack. Here we load the
// animation JSON and render @remotion/lottie <Lottie>, which is driven by Remotion's
// frame clock → identical pixels for a given frame in both <Player> and renderMedia.
//
// Signature mirrors DotLottiePlayerProps so the alias swap is transparent to callers
// (SpreadItemLayer imports { DotLottiePlayer }).

import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { createLogger } from "@/utils/logger";
import { loadDotLottieAnimationData } from "./load-dotlottie-json";

const log = createLogger("Remotion", "DeterministicLottiePlayer");

export interface DotLottiePlayerProps {
  src: string;
  isThumbnail?: boolean;
  options?: {
    theme?: string;
    state_machine?: string;
    speed?: number;
  };
  onLoad?: () => void;
  onError?: () => void;
}

export function DotLottiePlayer({ src, options, onLoad, onError }: DotLottiePlayerProps) {
  const [data, setData] = useState<LottieAnimationData | null>(null);
  // Gate frame 0 until the animation JSON is fetched + unzipped (render-safe).
  const [handle] = useState(() => delayRender(`lottie:${src}`));

  useEffect(() => {
    let cancelled = false;
    loadDotLottieAnimationData(src)
      .then((animationData) => {
        if (cancelled) return;
        setData(animationData as LottieAnimationData);
        onLoad?.();
        continueRender(handle);
      })
      .catch((err) => {
        log.warn("load", "dotLottie load failed", { src, error: String(err) });
        onError?.();
        continueRender(handle); // never block the whole render on one broken asset
      });
    return () => {
      cancelled = true;
    };
  }, [src, handle, onLoad, onError]);

  if (!data) return null;

  return (
    <Lottie
      animationData={data}
      loop
      playbackRate={options?.speed ?? 1}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

export default DotLottiePlayer;
