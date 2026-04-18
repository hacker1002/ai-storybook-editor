// editable-animated-pic.tsx - Canvas component for animated_pic items (WebP/WebM auto-loop)
"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/utils/utils";
import type { SpreadAnimatedPic } from "@/types/spread-types";
import { COLORS } from "@/constants/spread-constants";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "EditableAnimatedPic");

const DotLottiePlayer = lazy(() =>
  import("./animated-pic-players/dot-lottie-player").then((m) => ({ default: m.DotLottiePlayer })),
);
const RivePlayer = lazy(() =>
  import("./animated-pic-players/rive-player").then((m) => ({ default: m.RivePlayer })),
);

const lazyFallback = (
  <div className="absolute inset-0 flex items-center justify-center bg-muted">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

type MediaKind = "webp" | "webm" | "lottie" | "riv" | "unknown";

function detectMediaKind(url: string | undefined): MediaKind {
  if (!url) return "unknown";
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".webm")) return "webm";
  if (lower.endsWith(".lottie")) return "lottie";
  if (lower.endsWith(".riv")) return "riv";
  return "unknown";
}

interface AnimatedPicPlaceholderProps {
  name: string;
  type: string;
}

function AnimatedPicPlaceholder({ name, type }: AnimatedPicPlaceholderProps) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 border-2 border-dashed"
      style={{
        backgroundColor: COLORS.PLACEHOLDER_BG,
        borderColor: COLORS.PLACEHOLDER_BORDER,
      }}
    >
      <Sparkles className="h-6 w-6 text-muted-foreground" />
      <p
        className={cn("text-center line-clamp-2 text-xs", !name && "italic")}
        style={{ color: COLORS.PLACEHOLDER_TEXT }}
      >
        {name || "No animated pic"}
      </p>
      <span
        className="text-[10px] px-1 rounded"
        style={{
          backgroundColor: COLORS.PLACEHOLDER_BORDER,
          color: COLORS.PLACEHOLDER_TEXT,
        }}
      >
        {type}
      </span>
    </div>
  );
}

interface EditableAnimatedPicProps {
  animatedPic: SpreadAnimatedPic;
  index: number;
  zIndex?: number;
  isSelected: boolean;
  isEditable: boolean;
  isThumbnail?: boolean;
  /** Show persistent item border (muted outline) — only in retouch/objects space */
  showItemBorder?: boolean;
  onSelect: () => void;
}

export function EditableAnimatedPic({
  animatedPic,
  index,
  zIndex,
  isSelected,
  isEditable,
  isThumbnail = false,
  showItemBorder,
  onSelect,
}: EditableAnimatedPicProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(!!animatedPic.media_url);
  const [hasError, setHasError] = useState(false);

  const mediaKind = detectMediaKind(animatedPic.media_url);
  const showMedia = !!animatedPic.media_url && !hasError && mediaKind !== "unknown";

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isEditable && !isThumbnail) {
        log.info("handleClick", "animated_pic selected", { index, id: animatedPic.id });
        onSelect();
      }
    },
    [isEditable, isThumbnail, onSelect, index, animatedPic.id]
  );

  const handleLoaded = useCallback(() => setIsLoading(false), []);
  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    log.warn("handleError", "animated_pic media load failed", { id: animatedPic.id, url: animatedPic.media_url, mediaKind });
  }, [animatedPic.id, animatedPic.media_url, mediaKind]);

  useEffect(() => {
    if (mediaKind === "lottie" || mediaKind === "riv") {
      log.debug("render", `${mediaKind} player dispatched`, { isThumbnail, id: animatedPic.id });
    }
  }, [mediaKind, isThumbnail, animatedPic.id]);

  return (
    <div
      role="img"
      aria-label={animatedPic.title || animatedPic.name || `Animated Pic ${index + 1}`}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && isEditable && !isThumbnail && onSelect()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "absolute overflow-hidden",
        isEditable && !isThumbnail && "cursor-pointer",
        !isSelected && (showItemBorder || isHovered) && "outline outline-1"
      )}
      style={{
        left: `${animatedPic.geometry.x}%`,
        top: `${animatedPic.geometry.y}%`,
        width: `${animatedPic.geometry.w}%`,
        height: `${animatedPic.geometry.h}%`,
        zIndex,
        outlineColor: !isSelected
          ? isHovered
            ? COLORS.ITEM_BORDER_HOVER
            : COLORS.ITEM_BORDER_ANIMATED_PIC
          : undefined,
      }}
    >
      {showMedia ? (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {mediaKind === "webp" ? (
            // Animated WebP loops natively — same element for full and thumbnail modes
            <img
              src={animatedPic.media_url}
              alt={animatedPic.title || animatedPic.name || ""}
              className="w-full h-full object-contain"
              onLoad={handleLoaded}
              onError={handleError}
            />
          ) : mediaKind === "lottie" ? (
            <Suspense fallback={lazyFallback}>
              <DotLottiePlayer
                src={animatedPic.media_url!}
                isThumbnail={isThumbnail}
                options={animatedPic.lottie}
                onLoad={handleLoaded}
                onError={handleError}
              />
            </Suspense>
          ) : mediaKind === "riv" ? (
            <Suspense fallback={lazyFallback}>
              <RivePlayer
                src={animatedPic.media_url!}
                isThumbnail={isThumbnail}
                options={animatedPic.rive}
                onLoad={handleLoaded}
                onError={handleError}
              />
            </Suspense>
          ) : (
            // WebM: thumbnail uses preload=metadata (first frame, no autoplay).
            // onLoadedMetadata fires reliably with preload=metadata on Firefox/Safari;
            // onLoadedData may not fire when the browser stops after metadata.
            isThumbnail ? (
              <video
                src={animatedPic.media_url}
                className="w-full h-full object-contain"
                preload="metadata"
                muted
                playsInline
                onLoadedMetadata={handleLoaded}
                onError={handleError}
              />
            ) : (
              <video
                src={animatedPic.media_url}
                className="w-full h-full object-contain"
                autoPlay
                muted
                loop
                playsInline
                onLoadedData={handleLoaded}
                onError={handleError}
              />
            )
          )}
        </>
      ) : (
        <AnimatedPicPlaceholder
          name={animatedPic.name || animatedPic.title || ""}
          type={animatedPic.type}
        />
      )}
    </div>
  );
}

export default EditableAnimatedPic;
