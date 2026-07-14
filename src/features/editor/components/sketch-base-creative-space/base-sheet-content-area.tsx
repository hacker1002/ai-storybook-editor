// base-sheet-content-area.tsx — right pane of SketchBaseSpace (design 02). Toolbar (Raw/Crop
// tabs + zoom) over the style-under-view's imagery. Raw = the whole sheet (1 [✎] edit-all);
// Crop = a card per base entity (each with its own [✎]). Presentational/dumb: it reads the
// passed `style`/`entityKeys` and reports edit intent via callbacks — the parent owns the
// EditImageModal mount (Phase 06). Zoom is applied as CSS width % (NOT transform:scale) so the
// overflow scroll can reach the zoomed image's corners (memory: zoom-via-css-width).

import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ZoomControl } from '@/features/editor/components/shared-components/zoom-control';
import { titleCase } from '@/features/editor/components/sketch-variants-creative-space/sketch-variants-constants';
import type { Illustration } from '@/types/prop-types';
import type { SketchBaseStyle } from '@/types/sketch';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { ZOOM, type SelectedStyleRef } from './sketch-base-constants';

const log = createLogger('Editor', 'BaseSheetContentArea');

/** Effective preview URL of a versioned illustration list: selected → newest → null. */
function effectiveUrl(illustrations: Illustration[]): string | null {
  return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? null;
}

interface BaseSheetContentAreaProps {
  selectedStyle: SelectedStyleRef;
  style: SketchBaseStyle;
  /** Base entity keys → one crop card each (entity missing a crop → placeholder card). */
  entityKeys: string[];
  /** "character" | "prop" — empty-state noun. */
  noun: string;
  activeTab: 'raw' | 'crop';
  zoom: number;
  isGenerating: boolean;
  onChangeTab: (tab: 'raw' | 'crop') => void;
  onChangeZoom: (zoom: number) => void;
  onEditRaw: () => void;
  onEditCrop: (entityKey: string) => void;
}

export function BaseSheetContentArea({
  selectedStyle,
  style,
  entityKeys,
  noun,
  activeTab,
  zoom,
  isGenerating,
  onChangeTab,
  onChangeZoom,
  onEditRaw,
  onEditCrop,
}: BaseSheetContentAreaProps) {
  const rawUrl = effectiveUrl(style.illustrations);

  return (
    <section
      className="flex flex-1 flex-col overflow-hidden"
      role="region"
      aria-label={`${selectedStyle.kind} base ${activeTab}`}
    >
      {/* Toolbar: Raw/Crop tabs (left) + zoom (right) */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
        <Tabs value={activeTab} onValueChange={(v) => onChangeTab(v as 'raw' | 'crop')}>
          <TabsList>
            <TabsTrigger value="raw">Raw</TabsTrigger>
            <TabsTrigger value="crop">Crop</TabsTrigger>
          </TabsList>
        </Tabs>
        <ZoomControl
          value={zoom}
          onChange={onChangeZoom}
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.step}
        />
      </div>

      {activeTab === 'raw' ? (
        <RawSheet
          rawUrl={rawUrl}
          noun={noun}
          zoom={zoom}
          isGenerating={isGenerating}
          onEditRaw={onEditRaw}
        />
      ) : (
        <CropGrid style={style} entityKeys={entityKeys} zoom={zoom} onEditCrop={onEditCrop} />
      )}
    </section>
  );
}

/** Raw tab: the whole sheet of the style-under-view + a single edit-all [✎]. */
function RawSheet({
  rawUrl,
  noun,
  zoom,
  isGenerating,
  onEditRaw,
}: {
  rawUrl: string | null;
  noun: string;
  zoom: number;
  isGenerating: boolean;
  onEditRaw: () => void;
}) {
  const canEdit = rawUrl != null && !isGenerating;

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Edit-all — kept above the scroll area so it stays anchored to the frame corner. */}
      <EditIconButton
        label="Edit base sheet"
        disabled={!canEdit}
        onClick={onEditRaw}
        className="absolute right-3 top-3 z-10"
      />

      <div
        className="flex h-full overflow-auto p-6"
        style={{ justifyContent: 'safe center', alignItems: 'safe center' }}
      >
        {rawUrl && !isGenerating ? (
          <img
            key={rawUrl}
            src={rawUrl}
            alt="Base sheet"
            className="object-contain"
            style={{ width: `${zoom}%`, maxWidth: 'none', height: 'auto' }}
          />
        ) : (
          <div className="m-6 flex min-h-[60%] w-full max-w-3xl flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 p-10 text-center text-muted-foreground">
            {!isGenerating && <p className="text-sm">No {noun} sketch generated yet</p>}
          </div>
        )}
      </div>

      {/* Generating overlay */}
      {isGenerating && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Generating…</p>
        </div>
      )}
    </div>
  );
}

/** Crop tab: one card per base entity (labelled), each with its own [✎]. */
function CropGrid({
  style,
  entityKeys,
  zoom,
  onEditCrop,
}: {
  style: SketchBaseStyle;
  entityKeys: string[];
  zoom: number;
  onEditCrop: (entityKey: string) => void;
}) {
  if (entityKeys.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-center text-muted-foreground">
        <p className="text-sm">No base entity — import first</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
      >
        {entityKeys.map((key) => {
          const crop = style.crops.find((c) => c.key === key);
          const cropUrl = crop ? effectiveUrl(crop.illustrations) : null;
          return (
            <CropCard
              key={key}
              entityKey={key}
              cropUrl={cropUrl}
              zoom={zoom}
              onEdit={() => onEditCrop(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

function CropCard({
  entityKey,
  cropUrl,
  zoom,
  onEdit,
}: {
  entityKey: string;
  cropUrl: string | null;
  zoom: number;
  onEdit: () => void;
}) {
  const name = titleCase(entityKey);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          'relative flex aspect-square items-center justify-center overflow-auto rounded-md border',
          cropUrl ? 'border-border bg-muted/30' : 'border-2 border-dashed border-muted-foreground/30',
        )}
      >
        <EditIconButton
          label={`Edit ${name} crop`}
          disabled={cropUrl == null}
          onClick={onEdit}
          className="absolute right-2 top-2 z-10"
        />
        {cropUrl ? (
          <img
            key={cropUrl}
            src={cropUrl}
            alt={`${name} crop`}
            className="object-contain"
            style={{ width: `${zoom}%`, maxWidth: 'none', height: 'auto' }}
            onError={() => log.warn('CropCard', 'crop image failed to load', { entityKey })}
          />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">No crop</span>
        )}
      </div>
      <span className="truncate text-center text-sm" title={name}>
        {name}
      </span>
    </div>
  );
}

/** Small ghost [✎] used by both the raw frame and each crop card. Disabled → aria-disabled. */
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
