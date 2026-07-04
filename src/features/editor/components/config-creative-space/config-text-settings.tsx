// config-text-settings.tsx - Text settings panel: textbox typography for 5 fixed
// languages, per editor step (sketch / illustration / retouch). Step tabs select
// which book.typography[step] slice is read/written. Each language section has a
// Force Apply button that pushes that step+language typography onto every textbox
// of the step (behind a mandatory confirm). Voice-over lives in ConfigNarratorSettings.

import * as React from 'react';
import { useCurrentBook, useBookTypography, useBookActions } from '@/stores/book-store';
import { useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { TEXT_LANGUAGES, DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import { TextLanguageSection } from './text-language-section';
import { TextSettingsStepTabs } from './text-settings-step-tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { BookTypography, TypographyStep, TypographySettings } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigTextSettings');

interface ForceApplyConfirm {
  open: boolean;
  lang: string | null;
  langLabel: string | null;
}

export function ConfigTextSettings() {
  const book = useCurrentBook();
  const typography = useBookTypography();
  const { updateBook } = useBookActions();
  const { applyTypographyToStepTextboxes } = useSnapshotActions();

  const [activeStep, setActiveStep] = React.useState<TypographyStep>('sketch');
  const [confirm, setConfirm] = React.useState<ForceApplyConfirm>({
    open: false,
    lang: null,
    langLabel: null,
  });

  if (!book) return null;

  const stepTypo = typography?.[activeStep] ?? {};

  const handleTypographyChange = (langCode: string, updates: Partial<TypographySettings>) => {
    const current = stepTypo[langCode] ?? DEFAULT_TYPOGRAPHY;
    const nextStep = { ...stepTypo, [langCode]: { ...current, ...updates } };
    // Fresh empty steps first so a null book.typography yields independent {}
    // slices (no shared module ref), then existing steps override, then activeStep.
    const nextTypography: BookTypography = {
      sketch: {},
      illustration: {},
      retouch: {},
      ...(typography ?? {}),
      [activeStep]: nextStep,
    };

    log.info('handleTypographyChange', 'updating', { step: activeStep, langCode, keys: Object.keys(updates) });
    void updateBook(book.id, { typography: nextTypography });
  };

  const openForceApplyConfirm = (langCode: string, langLabel: string) => {
    setConfirm({ open: true, lang: langCode, langLabel });
  };

  const handleForceApplyConfirmed = () => {
    if (confirm.lang) {
      const typo = stepTypo[confirm.lang] ?? DEFAULT_TYPOGRAPHY;
      log.info('handleForceApply', 'confirmed', { step: activeStep, lang: confirm.lang });
      applyTypographyToStepTextboxes(activeStep, confirm.lang, typo);
    }
    setConfirm({ open: false, lang: null, langLabel: null });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TextSettingsStepTabs activeStep={activeStep} onStepChange={setActiveStep} />
      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        {TEXT_LANGUAGES.map((lang) => (
          <TextLanguageSection
            key={lang.code}
            langCode={lang.code}
            langLabel={lang.label}
            typography={stepTypo[lang.code] ?? DEFAULT_TYPOGRAPHY}
            onChange={handleTypographyChange}
            onForceApply={() => openForceApplyConfirm(lang.code, lang.label)}
          />
        ))}
      </div>

      <AlertDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Apply typography?</AlertDialogTitle>
            <AlertDialogDescription>
              Ghi đè typography của tất cả textbox thuộc bước{' '}
              <span className="font-semibold uppercase">{activeStep}</span> · ngôn ngữ{' '}
              <span className="font-semibold">{confirm.langLabel}</span>. Hành động này không thể
              hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceApplyConfirmed}>Áp dụng</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
