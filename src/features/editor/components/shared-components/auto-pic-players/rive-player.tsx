// rive-player.tsx — lazy-loaded Rive Canvas2D runtime for .riv animated pics
import { useMemo } from "react";
import { useRive, Fit, Alignment, Layout, RuntimeLoader } from "@rive-app/react-canvas";
import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";
import { createLogger } from "@/utils/logger";

// Register WASM once when this lazy chunk loads — before any instance renders
RuntimeLoader.setWasmUrl(riveWasmUrl);

const log = createLogger("Editor", "RivePlayer");

type FitOption = NonNullable<NonNullable<RivePlayerProps["options"]>["fit"]>;

const FIT_MAP: Record<FitOption, Fit> = {
  contain: Fit.Contain,
  cover: Fit.Cover,
  fill: Fit.Fill,
  fitWidth: Fit.FitWidth,
  fitHeight: Fit.FitHeight,
  none: Fit.None,
  scaleDown: Fit.ScaleDown,
};

export interface RivePlayerProps {
  src: string;
  isThumbnail?: boolean;
  options?: {
    artboard?: string;
    animation?: string;
    state_machine?: string;
    fit?: "contain" | "cover" | "fill" | "fitWidth" | "fitHeight" | "none" | "scaleDown";
  };
  onLoad?: () => void;
  onError?: () => void;
}

export function RivePlayer({ src, isThumbnail = false, options, onLoad, onError }: RivePlayerProps) {
  // Stabilize params so useRive doesn't re-init on JSONB object re-allocation
  const stableParams = useMemo(
    () => {
      const fitEnum = FIT_MAP[options?.fit ?? "contain"] ?? Fit.Contain;
      const hasStateMachine = Boolean(options?.state_machine);
      return {
        src,
        artboard: options?.artboard,
        ...(hasStateMachine
          ? { stateMachines: [options!.state_machine!] }
          : options?.animation
          ? { animations: [options.animation] }
          : {}),
        autoplay: true,
        // Default @rive-app/canvas is `false` → audio events / URL events don't fire.
        // Interactive .riv files with embedded sounds need this ON.
        automaticallyHandleEvents: true,
        layout: new Layout({ fit: fitEnum, alignment: Alignment.Center }),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src, JSON.stringify(options)],
  );

  const { RiveComponent, rive } = useRive(
    {
      ...stableParams,
      onLoad: () => {
        if (isThumbnail) {
          rive?.pause();
          log.debug("onLoad", "thumbnail paused on load", { src });
        } else {
          log.info("onLoad", "rive loaded and playing", { src });
          if (options?.state_machine) {
            log.debug("onLoad", "state machine active", { stateMachine: options.state_machine });
          }
        }
        onLoad?.();
      },
      onLoadError: () => {
        log.warn("onLoadError", "rive load error", { src });
        onError?.();
      },
    },
    { shouldUseIntersectionObserver: true },
  );

  return <RiveComponent className="w-full h-full" />;
}

export default RivePlayer;
