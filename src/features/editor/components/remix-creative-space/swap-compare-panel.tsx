// swap-compare-panel.tsx — Before/after compare slider for SwapCropSheetModal.
// Renders Original vs Swapped via react-compare-slider, with overlays for
// busy / error / empty / loading states. The floating edit button is injected
// by the parent through `editSlot` (it is an EditImagePopover trigger — the
// panel stays unaware of the popover).
//
// Divergence from design §3.2: react-compare-slider v4 has no controlled
// `position` prop — only uncontrolled `defaultPosition` + `onPositionChange`.
// `dividerPosition` is therefore applied as the initial position; the keyed
// inner body remounts the slider when the image URLs change so a parent reset
// (e.g. tab switch) re-applies `defaultPosition`. `isEditDisabled`/`onEditClick`
// from the legacy spec are dropped in favour of the `editSlot` render prop.

import { useState } from 'react';
import { ReactCompareSlider } from 'react-compare-slider';
import { Loader2, AlertTriangle, ImageOff, ScanLine } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SwapComparePanel');

interface SwapComparePanelProps {
  originalUrl: string;
  swappedUrl: string | null;
  /** 0..100 (%) — applied as the slider's initial position only. */
  dividerPosition: number;
  /** Fires on drag AND once on every (re)mount with `dividerPosition`. The
   *  parent must treat `dividerPosition` as init-only — never derive other
   *  state from it inside an effect, or the mount echo will clobber it. */
  onDividerChange: (pos: number) => void;
  busy: boolean;
  busyLabel: string;
  errorMsg: string | null;
  /** Floating edit control (EditImagePopover trigger), bottom-right. */
  editSlot?: React.ReactNode;
}

export function SwapComparePanel({
  originalUrl,
  swappedUrl,
  dividerPosition,
  onDividerChange,
  busy,
  busyLabel,
  errorMsg,
  editSlot,
}: SwapComparePanelProps) {
  return (
    <section
      role="region"
      aria-label="Compare original and swapped image"
      className="flex shrink-0 flex-col gap-1.5"
    >
      <div className="relative h-[400px] w-full overflow-hidden rounded-md bg-muted">
        <ComparePanelBody
          key={`${originalUrl}|${swappedUrl ?? 'none'}`}
          originalUrl={originalUrl}
          swappedUrl={swappedUrl}
          dividerPosition={dividerPosition}
          onDividerChange={onDividerChange}
        />

        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-y-0 right-0 flex w-1/2 flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">{busyLabel}</span>
          </div>
        )}

        {errorMsg && (
          <div className="absolute inset-y-0 right-0 flex w-1/2 flex-col items-center justify-center gap-2 bg-destructive/10 px-3 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <span className="text-xs text-destructive">{errorMsg}</span>
          </div>
        )}

        {editSlot && (
          <div className="absolute bottom-2 right-2 z-10">{editSlot}</div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag the divider to compare original vs swapped
      </p>
    </section>
  );
}

interface ComparePanelBodyProps {
  originalUrl: string;
  swappedUrl: string | null;
  dividerPosition: number;
  onDividerChange: (pos: number) => void;
}

/** Inner body — keyed by image URLs so load/error state and the uncontrolled
 *  slider reset whenever the compared images change (no useEffect+setState). */
function ComparePanelBody({
  originalUrl,
  swappedUrl,
  dividerPosition,
  onDividerChange,
}: ComparePanelBodyProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleLoad = () => setImgLoaded(true);
  const handleError = () => {
    log.warn('ComparePanelBody', 'image failed to load', {
      originalUrl,
      swappedUrl,
    });
    setImgError(true);
  };

  const originalImg = (
    <img
      src={originalUrl}
      alt="Original image"
      onLoad={handleLoad}
      onError={handleError}
      className="h-full w-full object-contain"
    />
  );

  const swappedNode =
    swappedUrl === null ? (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background/60 px-3 text-center">
        <ImageOff className="h-6 w-6 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          No swap image yet — click Swap to create
        </span>
      </div>
    ) : (
      <img
        src={swappedUrl}
        alt="Swapped image"
        onLoad={handleLoad}
        onError={handleError}
        className="h-full w-full object-contain"
      />
    );

  return (
    <>
      <ReactCompareSlider
        defaultPosition={swappedUrl === null ? 100 : dividerPosition}
        onPositionChange={onDividerChange}
        className="h-full w-full"
        itemOne={originalImg}
        itemTwo={swappedNode}
      />
      <span className="absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
        Original
      </span>
      <span className="absolute right-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
        {swappedUrl === null ? 'No swap yet' : 'Swapped'}
      </span>

      {!imgLoaded && !imgError && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'animate-pulse bg-muted',
          )}
        >
          <ScanLine className="h-8 w-8 text-muted-foreground/50" />
        </div>
      )}

      {imgError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Image failed to load
          </span>
        </div>
      )}
    </>
  );
}
