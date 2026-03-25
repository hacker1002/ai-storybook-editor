import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools } from 'zustand/middleware';
import type { Language, PipelineStep } from '@/types/editor';
import { DEFAULT_LANGUAGE } from '@/constants/editor-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'EditorSettingsStore');

interface EditorSettingsStore {
  currentLanguage: Language;
  currentStep: PipelineStep;
  /** Active zoom level (percentage). Set by whichever view is currently active. */
  zoomLevel: number;
  setCurrentLanguage: (language: Language) => void;
  setCurrentStep: (step: PipelineStep) => void;
  setZoomLevel: (level: number) => void;
  resetSettings: (language: Language, step: PipelineStep) => void;
}

export const useEditorSettingsStore = create<EditorSettingsStore>()(
  devtools(
    (set, get) => ({
      currentLanguage: DEFAULT_LANGUAGE,
      currentStep: 'manuscript',
      zoomLevel: 100,

      setCurrentLanguage: (language) => {
        const prev = get().currentLanguage.code;
        log.info('setCurrentLanguage', 'transition', { prev, next: language.code });
        set({ currentLanguage: language });
      },

      setCurrentStep: (step) => {
        const prev = get().currentStep;
        log.info('setCurrentStep', 'transition', { prev, next: step });
        set({ currentStep: step });
      },

      setZoomLevel: (level) => {
        set({ zoomLevel: level });
      },

      resetSettings: (language, step) => {
        log.info('resetSettings', 'reset', { language: language.code, step });
        set({ currentLanguage: language, currentStep: step });
      },
    }),
    { name: 'editor-settings-store' }
  )
);

// Selectors for optimized re-renders
export const useCurrentLanguage = () =>
  useEditorSettingsStore((s) => s.currentLanguage);

export const useCurrentStep = () =>
  useEditorSettingsStore((s) => s.currentStep);

export const useLanguageCode = () =>
  useEditorSettingsStore((s) => s.currentLanguage.code);

export const useZoomLevel = () =>
  useEditorSettingsStore((s) => s.zoomLevel);

export const useSetZoomLevel = () =>
  useEditorSettingsStore((s) => s.setZoomLevel);

export const useEditorSettingsActions = () =>
  useEditorSettingsStore(
    useShallow((s) => ({
      setCurrentLanguage: s.setCurrentLanguage,
      setCurrentStep: s.setCurrentStep,
      setZoomLevel: s.setZoomLevel,
      resetSettings: s.resetSettings,
    }))
  );
