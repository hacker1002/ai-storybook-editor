// variant-sheet-content-area.tsx — right pane of SketchVariantsSpace (design 02). Toolbar
// (Raw/Crop tabs + zoom) over the selected variant's imagery.
//   • Raw tab (default)  = the RAW 21:9 sheet (raw_sheet.illustrations) + a single [✎]. Committing
//     an edit AUTO re-cuts the 4 cells (the parent chains recropVariantSheet) — crops[] is overwritten.
//   • Crop tab           = the FOUR cut cells (raw_sheet.crops[]) — pick 1/4 (radio) + a per-cell [✎].
// 2026-07-16 rework: the two tabs' contents were SWAPPED (the raw sheet used to be hidden as an
// internal cut-source) and the "picked cell enlarged" view was dropped entirely.
// Presentational/dumb: reads the passed `variant` and reports intent via callbacks.
//
// Zoom is applied as CSS width % (NOT transform:scale) so the overflow scroll reaches the zoomed
// image's corners (memory: zoom-via-css-width / reference generate-canvas.tsx).

import { Check, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ZoomControl } from '@/features/editor/components/shared-components/zoom-control';
import type { Illustration } from '@/types/prop-types';
import type { SketchVariant, SketchVariantCrop, VariantRef } from '@/types/sketch';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { ZOOM, type VariantGenStatus } from './sketch-variants-constants';

const log = createLogger('Editor', 'VariantSheetContentArea');

/** Effective preview URL of a versioned illustration list: selected → newest → null. */
function effectiveUrl(illustrations: Illustration[]): string | null {
  return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? null;
}

interface VariantSheetContentAreaProps {
  selectedVariant: VariantRef;
  variant: SketchVariant | undefined; // raw_sheet.{illustrations, crops[]}
  activeTab: 'raw' | 'crop';
  zoom: number;
  genStatus: VariantGenStatus;
  onChangeTab: (tab: 'raw' | 'crop') => void;
  onChangeZoom: (zoom: number) => void;
  onSelectCrop: (cropIndex: number) => void; // 0..3 → lock crops[i].is_selected
  onEditCrop: (cropIndex: number) => void; // 0..3 → edit that cell
  onEditRaw: () => void; // edit the 21:9 sheet → commit AUTO re-cuts all 4 cells
}

export function VariantSheetContentArea({
  selectedVariant,
  variant,
  activeTab,
  zoom,
  genStatus,
  onChangeTab,
  onChangeZoom,
  onSelectCrop,
  onEditCrop,
  onEditRaw,
}: VariantSheetContentAreaProps) {
  const crops = variant?.raw_sheet?.crops ?? [];
  const selIdx = crops.findIndex((c) => c.is_selected); // −1 = none picked yet

  return (
    <section
      className="flex flex-1 flex-col overflow-hidden"
      role="region"
      aria-label={`Variant @${selectedVariant.entityKey}/${selectedVariant.variantKey} ${activeTab}`}
    >
      {/* Toolbar: Raw/Crop tabs (left) + zoom (right). */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
        <Tabs value={activeTab} onValueChange={(v) => onChangeTab(v as 'raw' | 'crop')}>
          <TabsList>
            <TabsTrigger value="raw">Raw</TabsTrigger>
            <TabsTrigger value="crop">Crop</TabsTrigger>
          </TabsList>
        </Tabs>
        <ZoomControl value={zoom} onChange={onChangeZoom} min={ZOOM.min} max={ZOOM.max} step={ZOOM.step} />
      </div>

      {activeTab === 'raw' ? (
        <RawSheetView
          rawUrl={effectiveUrl(variant?.raw_sheet?.illustrations ?? [])}
          zoom={zoom}
          genStatus={genStatus}
          onEditRaw={onEditRaw}
        />
      ) : (
        <CropCandidateGrid
          crops={crops}
          selIdx={selIdx}
          zoom={zoom}
          genStatus={genStatus}
          onSelectCrop={onSelectCrop}
          onEditCrop={onEditCrop}
        />
      )}
    </section>
  );
}

/** Raw tab: the 21:9 sheet + one [✎] (edit ⇒ auto re-cut). Busy → sheet skeleton; empty → hint. */
function RawSheetView({
  rawUrl,
  zoom,
  genStatus,
  onEditRaw,
}: {
  rawUrl: string | null;
  zoom: number;
  genStatus: VariantGenStatus;
  onEditRaw: () => void;
}) {
  if (genStatus.isBusy) return <SheetSkeleton phase={genStatus.phase} />;
  if (!rawUrl) return <EmptyHint text="No variant sketch generated yet" />;

  return (
    <div className="relative flex-1 overflow-hidden">
      <EditIconButton
        label="Edit variant sheet"
        disabled={false}
        onClick={onEditRaw}
        className="absolute right-3 top-3 z-10"
      />
      <div
        className="flex h-full overflow-auto p-6"
        style={{ justifyContent: 'safe center', alignItems: 'safe center' }}
      >
        <img
          key={rawUrl}
          src={rawUrl}
          alt="Variant raw sheet"
          className="object-contain"
          // width % drives zoom; maxHeight clamps so 100% = contain-fit (shorter of pane W/H binds).
          style={{ width: `${zoom}%`, maxWidth: 'none', height: 'auto', maxHeight: `${zoom}%` }}
          onError={() => log.warn('RawSheetView', 'raw sheet image failed to load')}
        />
      </div>
    </div>
  );
}

/** Crop tab: the 4 cut cells — click-to-pick + per-cell [✎]. Busy → sheet skeleton; empty → hint. */
function CropCandidateGrid({
  crops,
  selIdx,
  zoom,
  genStatus,
  onSelectCrop,
  onEditCrop,
}: {
  crops: SketchVariantCrop[];
  selIdx: number;
  zoom: number;
  genStatus: VariantGenStatus;
  onSelectCrop: (cropIndex: number) => void;
  onEditCrop: (cropIndex: number) => void;
}) {
  if (genStatus.isBusy) return <SheetSkeleton phase={genStatus.phase} />;

  if (crops.length === 0) {
    return <EmptyHint text="No variant sketch generated yet" />;
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-4 gap-4" role="radiogroup" aria-label="Pick a candidate crop">
        {crops.map((crop, i) => (
          <CropCard
            key={i}
            index={i}
            cropUrl={effectiveUrl(crop.illustrations)}
            isPicked={i === selIdx}
            zoom={zoom}
            onSelect={() => onSelectCrop(i)}
            onEdit={() => onEditCrop(i)}
          />
        ))}
      </div>
    </div>
  );
}

/** Busy state for BOTH tabs: the sheet is generated then cut as ONE unit → one 21:9 skeleton. */
function SheetSkeleton({ phase }: { phase?: VariantGenStatus['phase'] }) {
  const label = phase === 'cut' ? 'Cutting cells…' : 'Generating…';
  return (
    <div className="flex-1 overflow-auto p-6" role="status" aria-live="polite">
      <div className="flex aspect-[21/9] w-full flex-col items-center justify-center gap-2 rounded-md border bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function CropCard({
  index,
  cropUrl,
  isPicked,
  zoom,
  onSelect,
  onEdit,
}: {
  index: number;
  cropUrl: string | null;
  isPicked: boolean;
  zoom: number;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const label = `candidate ${index + 1}`;
  return (
    <div className="flex flex-col gap-1.5">
      {/* The card itself is the pick target — click/Enter/Space selects. Hover lifts it. */}
      <div
        role="radio"
        aria-checked={isPicked}
        aria-label={`Pick ${label}`}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          // aspect-[7/12] = a crop cell's true ratio (¼ of the 21:9 sheet, 5.25:9) → image fills, no letterbox.
          'relative flex aspect-[7/12] cursor-pointer items-center justify-center overflow-auto rounded-md border',
          'transition-all hover:-translate-y-1 hover:shadow-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isPicked ? 'ring-2 ring-primary border-primary' : 'border-border bg-muted/30',
        )}
      >
        {/* Ordinal badge (top-left). */}
        <span
          className="absolute left-2 top-2 z-10 rounded bg-background/70 px-1.5 text-xs font-medium backdrop-blur"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        {/* Edit must not bubble to the card's select handler. */}
        <span className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
          <EditIconButton
            label={`Edit crop ${index + 1}`}
            disabled={cropUrl == null}
            onClick={onEdit}
          />
        </span>
        {/* Picked → check badge (bottom-right). */}
        {isPicked && (
          <span
            className="absolute bottom-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            aria-hidden="true"
          >
            <Check className="h-4 w-4" />
          </span>
        )}
        {cropUrl ? (
          <img
            key={cropUrl}
            src={cropUrl}
            alt={`Crop ${index + 1}`}
            className="object-contain"
            // Constrain both axes → 100% = contain-fit (no head/feet clipping); width % still drives zoom.
            style={{ width: `${zoom}%`, maxWidth: 'none', height: 'auto', maxHeight: `${zoom}%` }}
            onError={() => log.warn('CropCard', 'crop image failed to load', { index })}
          />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">No image</span>
        )}
      </div>

      {/* Non-interactive state caption — selection happens on the card above. */}
      <p
        className={cn(
          'truncate px-1.5 text-sm',
          isPicked ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {isPicked ? 'Selected' : `Pick #${index + 1}`}
      </p>
    </div>
  );
}

/** Centered dashed empty-state used by both tabs. */
function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex min-h-[50%] w-full max-w-3xl items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 p-10 text-center text-muted-foreground">
        <p className="text-sm">{text}</p>
      </div>
    </div>
  );
}

/** Small ghost [✎] used by the raw sheet + each crop card. Disabled → aria-disabled. */
function EditIconButton({
  label,
  disabled,
  onClick,
  className,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7 bg-background/70 backdrop-blur hover:bg-background', className)}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
