// stage-sheet-content-area.tsx — right pane of SketchStagesSpace (design 02). Toolbar (Raw/Crop
// tabs + zoom) over the SELECTED TARGET's imagery — ONE component, TWO bindings (the parent
// passes `sheet` = styles[i].{illustrations,crops} for a base style attempt, or
// variants[vk].{illustrations,crops} for a variant — same displayed shape):
//   • Raw tab (default) = the 2-cell 21:9 sheet (effective illustration) + one [✎]. Committing
//     an edit AUTO re-cuts the 2 cells (the parent chains recropStage*Sheet) — crops[] overwritten.
//   • Crop tab          = the TWO cut cells (7:6 cards) — pick 1/2 (radio, ✓) + per-cell [✎][⧉].
// Presentational/dumb: reads the passed `sheet` and reports intent via callbacks. [✎]/card/[⧉]
// are ACQUIRE seams (non-disabled) — the parent adopts the stage lock before mutating.
//
// Zoom is applied as CSS width % (NOT transform:scale) so the overflow scroll reaches the zoomed
// image's corners (memory: zoom-via-css-width / reference generate-canvas.tsx).

import { Check, Layers, Loader2, Pencil } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ZoomControl } from '@/features/editor/components/shared-components/zoom-control';
import type { Illustration } from '@/types/prop-types';
import type { SketchStageCrop, StageSelection } from '@/types/sketch';
import { effectiveIllustrationUrl } from '@/types/sketch';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { ZOOM, STAGE_CROP_ASPECT_CLASS, type StageGenStatus } from './sketch-stages-constants';

const log = createLogger('Editor', 'StageSheetContentArea');

interface StageSheetContentAreaProps {
  selection: StageSelection;
  /** Parent-bound imagery of the selected target: base → styles[i].{illustrations,crops};
   *  variant → variants[vk].{illustrations,crops} (flat). undefined = target vanished. */
  sheet: { illustrations: Illustration[]; crops: SketchStageCrop[] } | undefined;
  activeTab: 'raw' | 'crop';
  zoom: number;
  genStatus: StageGenStatus;
  onChangeTab: (tab: 'raw' | 'crop') => void;
  onChangeZoom: (zoom: number) => void;
  onEditRaw: () => void; // [✎] sheet → EditImageModal (⇒ AUTO re-cut) — acquire seam
  onSelectCrop: (cropIndex: number) => void; // 0..1 → pick crops[i].is_selected — acquire seam
  onEditCrop: (cropIndex: number) => void; // 0..1 → edit that cell — acquire seam
  onExtractCrop: (cropIndex: number) => void; // [⧉] → extract that cell — acquire seam
}

export function StageSheetContentArea({
  selection,
  sheet,
  activeTab,
  zoom,
  genStatus,
  onChangeTab,
  onChangeZoom,
  onEditRaw,
  onSelectCrop,
  onEditCrop,
  onExtractCrop,
}: StageSheetContentAreaProps) {
  const crops = sheet?.crops ?? [];
  const selIdx = crops.findIndex((c) => c.is_selected); // −1 = none picked yet

  const targetLabel =
    selection.target === 'base'
      ? `@${selection.stageKey} · Style ${selection.styleIndex + 1}`
      : `@${selection.stageKey}/${selection.variantKey}`;

  return (
    <section
      className="flex flex-1 flex-col overflow-hidden"
      role="region"
      aria-label={`Stage ${targetLabel} ${activeTab}`}
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
          rawUrl={effectiveIllustrationUrl(sheet?.illustrations ?? [])}
          zoom={zoom}
          genStatus={genStatus}
          onEditRaw={onEditRaw}
        />
      ) : (
        <CropPickGrid
          crops={crops}
          selIdx={selIdx}
          zoom={zoom}
          genStatus={genStatus}
          onSelectCrop={onSelectCrop}
          onEditCrop={onEditCrop}
          onExtractCrop={onExtractCrop}
        />
      )}
    </section>
  );
}

/** Raw tab: the 2-cell 21:9 sheet + one [✎] (edit ⇒ auto re-cut). Busy → skeleton; empty → hint. */
function RawSheetView({
  rawUrl,
  zoom,
  genStatus,
  onEditRaw,
}: {
  rawUrl: string | null;
  zoom: number;
  genStatus: StageGenStatus;
  onEditRaw: () => void;
}) {
  if (genStatus.isBusy) return <SheetSkeleton phase={genStatus.phase} />;
  if (!rawUrl) return <EmptyHint text="No stage sketch generated yet" />;

  return (
    <div className="relative flex-1 overflow-hidden">
      <CardIconButton
        icon={Pencil}
        label="Edit stage sheet"
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
          alt="Stage raw sheet"
          className="object-contain"
          // width % drives zoom; maxHeight clamps so 100% = contain-fit.
          style={{ width: `${zoom}%`, maxWidth: 'none', height: 'auto', maxHeight: `${zoom}%` }}
          onError={() => log.warn('RawSheetView', 'raw sheet image failed to load')}
        />
      </div>
    </div>
  );
}

/** Crop tab: the 2 cut cells (7:6) — click card to pick 1/2 + per-cell [✎]/[⧉]. */
function CropPickGrid({
  crops,
  selIdx,
  zoom,
  genStatus,
  onSelectCrop,
  onEditCrop,
  onExtractCrop,
}: {
  crops: SketchStageCrop[];
  selIdx: number;
  zoom: number;
  genStatus: StageGenStatus;
  onSelectCrop: (cropIndex: number) => void;
  onEditCrop: (cropIndex: number) => void;
  onExtractCrop: (cropIndex: number) => void;
}) {
  if (genStatus.isBusy) return <SheetSkeleton phase={genStatus.phase} />;
  if (crops.length === 0) return <EmptyHint text="No stage sketch generated yet" />;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="Pick a stage option">
        {crops.map((crop, i) => (
          <CropCard
            key={i}
            index={i}
            cropUrl={effectiveIllustrationUrl(crop.illustrations)}
            isPicked={i === selIdx}
            zoom={zoom}
            onSelect={() => onSelectCrop(i)}
            onEdit={() => onEditCrop(i)}
            onExtract={() => onExtractCrop(i)}
          />
        ))}
      </div>
    </div>
  );
}

/** Busy state for BOTH tabs: the sheet generates then cuts as ONE unit → one 21:9 skeleton. */
function SheetSkeleton({ phase }: { phase?: StageGenStatus['phase'] }) {
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
  onExtract,
}: {
  index: number;
  cropUrl: string | null;
  isPicked: boolean;
  zoom: number;
  onSelect: () => void;
  onEdit: () => void;
  onExtract: () => void;
}) {
  const label = `option ${index + 1}`;
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
          // 7:6 = a stage cell's true ratio (½ of the 21:9 sheet, 10.5:9 ≈ 7:6) → full-fit landscape.
          STAGE_CROP_ASPECT_CLASS,
          'relative flex cursor-pointer items-center justify-center overflow-auto rounded-md border',
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
        {/* [✎] edit + [⧉] extract — must not bubble to the card's select handler. */}
        <span className="absolute right-2 top-2 z-10 flex gap-1" onClick={(e) => e.stopPropagation()}>
          <CardIconButton
            icon={Pencil}
            label={`Edit crop ${index + 1}`}
            disabled={cropUrl == null}
            onClick={onEdit}
          />
          <CardIconButton
            icon={Layers}
            label={`Extract from crop ${index + 1}`}
            disabled={cropUrl == null}
            onClick={onExtract}
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

/** Small ghost icon button used by the raw sheet ([✎]) + each crop card ([✎]/[⧉]). */
function CardIconButton({
  icon: Icon,
  label,
  disabled,
  onClick,
  className,
}: {
  icon: LucideIcon;
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
      <Icon className="h-4 w-4" />
    </Button>
  );
}
