// dot-lottie-player.tsx — lazy-loaded dotLottie v2 WASM renderer for .lottie animated pics
// WASM bundled by Vite via ?url import — hashed filename, served from /assets/
import { useRef, useCallback, useMemo } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottie as DotLottieClass } from "@lottiefiles/dotlottie-web";
import dotLottieWasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
import { createLogger } from "@/utils/logger";

// Register WASM once when this lazy chunk loads — before any instance renders.
DotLottieClass.setWasmUrl(dotLottieWasmUrl);

const log = createLogger("Editor", "DotLottiePlayer");

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

export function DotLottiePlayer({ src, isThumbnail = false, options, onLoad, onError }: DotLottiePlayerProps) {
  const instanceRef = useRef<DotLottie | null>(null);

  // Stabilize config so ref callback deps don't churn on JSONB object re-allocation
  const stableConfig = useMemo(
    () => ({
      speed: options?.speed ?? 1,
      themeId: options?.theme,
      stateMachineId: options?.state_machine,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(options)],
  );

  const handleRefCallback = useCallback(
    (dotLottie: DotLottie | null) => {
      if (!dotLottie) {
        log.debug("handleRefCallback", "unmount — destroying instance");
        instanceRef.current?.destroy();
        instanceRef.current = null;
        return;
      }
      log.debug("handleRefCallback", "new instance received", { src, isThumbnail });
      instanceRef.current = dotLottie;

      dotLottie.addEventListener("load", () => {
        if (isThumbnail) {
          dotLottie.setFrame(0);
        }
        log.info("load", "animation loaded", { src, isThumbnail });
        onLoad?.();
      });

      dotLottie.addEventListener("loadError", () => {
        log.warn("loadError", "animation failed to load", { src });
        onError?.();
      });
    },
    [src, isThumbnail, onLoad, onError],
  );

  if (isThumbnail) {
    return (
      <DotLottieReact
        src={src}
        autoplay={false}
        loop={false}
        useFrameInterpolation={false}
        dotLottieRefCallback={handleRefCallback}
        className="w-full h-full"
      />
    );
  }

  return (
    <DotLottieReact
      src={src}
      autoplay
      loop
      speed={stableConfig.speed}
      themeId={stableConfig.themeId}
      stateMachineId={stableConfig.stateMachineId}
      dotLottieRefCallback={handleRefCallback}
      className="w-full h-full"
    />
  );
}

export default DotLottiePlayer;
