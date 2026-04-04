// config-branch-settings.tsx - Branch settings panel: default typography per language for branch UI.
// 5 fixed languages, each with font family + font size + color controls.

import { useCurrentBook, useBookBranch, useBookActions } from '@/stores/book-store';
import { NARRATION_LANGUAGES, FONT_FAMILY_OPTIONS, DEFAULT_BRANCH_TYPOGRAPHY } from '@/constants/config-constants';
import { NumberStepper } from '@/components/ui/number-stepper';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import type { BranchTypographySettings } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigBranchSettings');

const FONT_OPTIONS = FONT_FAMILY_OPTIONS.map((f) => ({ value: f, label: f }));

export function ConfigBranchSettings() {
  const book = useCurrentBook();
  const branch = useBookBranch();
  const { updateBook } = useBookActions();

  if (!book) return null;

  const handleTypographyChange = (langCode: string, updates: Partial<BranchTypographySettings>) => {
    const current = branch?.typography?.[langCode] ?? DEFAULT_BRANCH_TYPOGRAPHY;
    const updated = { ...current, ...updates };
    const nextTypography = { ...(branch?.typography ?? {}), [langCode]: updated };

    log.info('handleTypographyChange', 'updating', { langCode, keys: Object.keys(updates) });
    void updateBook(book.id, { branch: { ...(branch ?? {}), typography: nextTypography } });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Branch Settings</h3>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        {NARRATION_LANGUAGES.map((lang) => {
          const typo = branch?.typography?.[lang.code] ?? DEFAULT_BRANCH_TYPOGRAPHY;
          return (
            <div key={lang.code} className="flex flex-col gap-3 border-b pb-5 last:border-b-0">
              <p className="text-xs font-bold uppercase tracking-wider">{lang.label}</p>
              <div className="flex items-center gap-2">
                <div className="w-44 shrink-0">
                  <SearchableDropdown
                    options={FONT_OPTIONS}
                    value={typo.family}
                    onChange={(val) => handleTypographyChange(lang.code, { family: val })}
                    placeholder="Font..."
                  />
                </div>
                <NumberStepper
                  value={typo.size}
                  min={8}
                  max={72}
                  step={1}
                  onChange={(val) => handleTypographyChange(lang.code, { size: val })}
                  className="shrink-0"
                />
                <input
                  type="color"
                  value={typo.color}
                  onChange={(e) => handleTypographyChange(lang.code, { color: e.target.value })}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded border p-0.5"
                  title="Text color"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
