// entity-subtrees.tsx — Subtree renderers for EntityRow.
// Split out of entity-row.tsx to keep that file under the 500-line guideline.
//   • renderMixSheets       → flat sheet list under a mix entity (ariaLevel=2).
//   • renderVariantSubtree  → variant rows + nested sheet groups (ariaLevel=2/3).
// Both renderers take a single `onArrowNavigate` from EntityRow so wrap-aware
// keyboard navigation lives at the entity scope.

import type { RemixEntityRef } from '@/types/remix';
import { VariantRow } from './variant-row';
import { SheetRow } from './sheet-row';
import type { CollapseApi } from './use-collapse-state';

/** char/prop: indent for sheet rows under a variant row (design §4.12). */
export const SHEET_INDENT_NESTED_PX = 52;
/** mix: indent for sheet rows directly under entity row (design §4.12). */
export const SHEET_INDENT_FLAT_PX = 36;

interface ActiveSheetRef {
  entityKey: string;
  variantKey: string | null;
  sheetIndex: number;
}

type ArrowNavigateFn = (
  direction: 'up' | 'down',
  variantKey: string | null,
  sheetIndex: number,
  currentEl: HTMLElement,
) => void;

export interface MixSheetsProps {
  entity: RemixEntityRef;
  activeSheetRef: ActiveSheetRef;
  onSelectSheet: (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => void;
  onArrowNavigate: ArrowNavigateFn;
}

export function MixSheets({
  entity,
  activeSheetRef,
  onSelectSheet,
  onArrowNavigate,
}: MixSheetsProps) {
  const groupId = `entity-${entity.key}-sheets`;
  return (
    <div
      id={groupId}
      role="group"
      aria-label={`Crop sheets của ${entity.name}`}
      className="flex flex-col pb-1.5"
    >
      {entity.crop_sheets.map((sheet, sheetIndex) => {
        const isActive =
          activeSheetRef.entityKey === entity.key &&
          activeSheetRef.variantKey === null &&
          activeSheetRef.sheetIndex === sheetIndex;
        return (
          <SheetRow
            key={`${entity.key}-mix-${sheetIndex}`}
            entityKey={entity.key}
            variantKey={null}
            sheet={sheet}
            sheetIndex={sheetIndex}
            indentPx={SHEET_INDENT_FLAT_PX}
            isActive={isActive}
            ariaLevel={2}
            fallbackTitleNumber={sheetIndex + 1}
            onSelect={() => onSelectSheet(entity.key, null, sheetIndex)}
            onArrowNavigate={(dir, el) =>
              onArrowNavigate(dir, null, sheetIndex, el)
            }
          />
        );
      })}
    </div>
  );
}

export interface VariantSubtreeProps {
  entity: RemixEntityRef;
  activeSheetRef: ActiveSheetRef;
  collapse: CollapseApi;
  onSelectVariant: (entityKey: string, variantKey: string) => void;
  onSelectSheet: (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => void;
  onAddSheet: (entityKey: string, variantKey: string | null) => void;
  onRemoveSheet: (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => void;
  onArrowNavigate: ArrowNavigateFn;
}

export function VariantSubtree({
  entity,
  activeSheetRef,
  collapse,
  onSelectVariant,
  onSelectSheet,
  onAddSheet,
  onRemoveSheet,
  onArrowNavigate,
}: VariantSubtreeProps) {
  if (entity.variants.length === 0) {
    return (
      <p className="px-3 pb-2 text-xs italic text-[var(--swap-modal-text-muted)]">
        Chưa có variant nào.
      </p>
    );
  }
  return (
    <div
      role="group"
      aria-label={`Variants của ${entity.name}`}
      className="flex flex-col pb-1.5"
    >
      {entity.variants.map((variant) => {
        const variantCollapsed = collapse.isVariantCollapsed(
          entity.key,
          variant.variantKey,
        );
        const variantActive =
          activeSheetRef.entityKey === entity.key &&
          activeSheetRef.variantKey === variant.variantKey;
        const sheetGroupId = `entity-${entity.key}-variant-${variant.variantKey}-sheets`;
        return (
          <div
            key={`${entity.key}-variant-${variant.variantKey}`}
            className="flex flex-col"
          >
            <VariantRow
              entityKey={entity.key}
              variant={variant}
              isCollapsed={variantCollapsed}
              isActive={variantActive}
              onToggleCollapse={() =>
                collapse.toggleVariant(entity.key, variant.variantKey)
              }
              onSelectVariant={() =>
                onSelectVariant(entity.key, variant.variantKey)
              }
              onAddSheet={() => onAddSheet(entity.key, variant.variantKey)}
              onRemoveSheet={() => {
                const lastLocal = variant.sheetIndices.length - 1;
                if (lastLocal < 0) return;
                onRemoveSheet(entity.key, variant.variantKey, lastLocal);
              }}
              sheetGroupId={sheetGroupId}
            />
            {!variantCollapsed && (
              <div
                id={sheetGroupId}
                role="group"
                aria-label={`Sheets của variant ${variant.name}`}
                className="flex flex-col"
              >
                {variant.sheetIndices.map((globalIdx, localIdx) => {
                  const sheet = entity.crop_sheets[globalIdx];
                  if (!sheet) return null;
                  const sheetActive =
                    variantActive && activeSheetRef.sheetIndex === localIdx;
                  return (
                    <SheetRow
                      key={`${entity.key}-${variant.variantKey}-${localIdx}`}
                      entityKey={entity.key}
                      variantKey={variant.variantKey}
                      sheet={sheet}
                      sheetIndex={localIdx}
                      indentPx={SHEET_INDENT_NESTED_PX}
                      isActive={sheetActive}
                      ariaLevel={3}
                      fallbackTitleNumber={localIdx + 1}
                      onSelect={() =>
                        onSelectSheet(entity.key, variant.variantKey, localIdx)
                      }
                      onArrowNavigate={(dir, el) =>
                        onArrowNavigate(dir, variant.variantKey, localIdx, el)
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
