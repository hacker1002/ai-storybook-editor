// mobile-full-page-zoom-overlay.tsx - Overlay controls for mobile portrait full page zoom
// Toggle button (expand/collapse) + page bar indicators (left/right with blink)

import { Maximize2, Minimize2 } from "lucide-react";
import type { FullPageMode } from "./player-canvas";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "MobileFullPageZoomOverlay");

// === CSS for page bar blink animation ===
const PAGE_BAR_BLINK_STYLE = `
@keyframes page-bar-blink {
  0%, 100% { background-color: rgba(255, 165, 0, 0.2); }
  50% { background-color: rgba(255, 165, 0, 0.7); }
}
.page-bar-blink { animation: page-bar-blink 1s ease-in-out infinite; }
`;

interface MobileFullPageZoomOverlayProps {
  fullPageMode: FullPageMode;
  onModeChange: (mode: FullPageMode) => void;
  hiddenPageClickTarget: 'left' | 'right' | null;
  spreadWidth: number;
}

export function MobileFullPageZoomOverlay({
  fullPageMode,
  onModeChange,
  hiddenPageClickTarget,
  spreadWidth,
}: MobileFullPageZoomOverlayProps) {
  const isFullPage = fullPageMode !== 'spread';

  const handleToggle = () => {
    const newMode: FullPageMode = isFullPage ? 'spread' : 'left';
    log.info("handleToggle", "toggle full page mode", { from: fullPageMode, to: newMode });
    onModeChange(newMode);
  };

  const handlePageChange = (side: 'left' | 'right') => {
    log.debug("handlePageChange", "page bar clicked", { side, currentMode: fullPageMode });
    onModeChange(side);
  };

  return (
    <>
      <style>{PAGE_BAR_BLINK_STYLE}</style>

      {/* Controls row — flows right below the spread via parent flex-col.
           Width matches spread width so bars align with the page edges. */}
      <div
        className="flex items-center gap-2 mt-1"
        style={{ width: spreadWidth }}
      >
        {/* Left spacer — balances the toggle button on the right so page bars stay centered */}
        {isFullPage && <div className="w-9 flex-shrink-0" />}

        {/* Page bars — only visible in full page mode, centered between spacers */}
        {isFullPage && (
          <div className="flex-1 flex gap-2 justify-center">
            <button
              className={`w-16 rounded-full transition-colors ${
                hiddenPageClickTarget === 'left'
                  ? 'page-bar-blink'
                  : fullPageMode === 'left'
                    ? 'bg-black/40'
                    : 'bg-black/15'
              }`}
              style={{ height: 10 }}
              onClick={() => handlePageChange('left')}
              aria-label="View left page"
            />
            <button
              className={`w-16 rounded-full transition-colors ${
                hiddenPageClickTarget === 'right'
                  ? 'page-bar-blink'
                  : fullPageMode === 'right'
                    ? 'bg-black/40'
                    : 'bg-black/15'
              }`}
              style={{ height: 10 }}
              onClick={() => handlePageChange('right')}
              aria-label="View right page"
            />
          </div>
        )}
        {/* Spacer when not in full page mode — pushes toggle button to the right */}
        {!isFullPage && <div className="flex-1" />}

        {/* Toggle button */}
        <button
          className="bg-black/40 backdrop-blur-sm rounded-lg w-9 h-9 flex-shrink-0 flex items-center justify-center text-white hover:bg-black/50 active:bg-black/60"
          onClick={handleToggle}
          aria-label={isFullPage ? "View full spread" : "Zoom into single page"}
        >
          {isFullPage ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>
    </>
  );
}
