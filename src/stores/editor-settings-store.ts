import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools } from 'zustand/middleware';
import type { Language, PipelineStep } from '@/types/editor';
import { DEFAULT_LANGUAGE } from '@/constants/editor-constants';

interface EditorSettingsStore {
  currentLanguage: Language;
  currentStep: PipelineStep;
  setCurrentLanguage: (language: Language) => void;
  setCurrentStep: (step: PipelineStep) => void;
  resetSettings: (language: Language, step: PipelineStep) => void;
}

export const useEditorSettingsStore = create<EditorSettingsStore>()(
  devtools(
    (set) => ({
      currentLanguage: DEFAULT_LANGUAGE,
      currentStep: 'manuscript',

      setCurrentLanguage: (language) => set({ currentLanguage: language }),
      setCurrentStep: (step) => set({ currentStep: step }),
      resetSettings: (language, step) => set({ currentLanguage: language, currentStep: step }),
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

export const useEditorSettingsActions = () =>
  useEditorSettingsStore(
    useShallow((s) => ({
      setCurrentLanguage: s.setCurrentLanguage,
      setCurrentStep: s.setCurrentStep,
      resetSettings: s.resetSettings,
    }))
  );
