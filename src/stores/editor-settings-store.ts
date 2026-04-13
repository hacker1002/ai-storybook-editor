import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools } from 'zustand/middleware';
import type { Language, PipelineStep } from '@/types/editor';
import type { CanvasSize } from '@/types/canvas-types';
import { DEFAULT_LANGUAGE } from '@/constants/editor-constants';
import { DEFAULT_CANVAS_SIZE } from '@/constants/canvas-dimension-constants';
import { resolveCanvasSize } from '@/utils/canvas-math-utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'EditorSettingsStore');

interface EditorSettingsStore {
  currentLanguage: Language;
  currentStep: PipelineStep;
  /** Active zoom level (percentage). Set by whichever view is currently active. */
  zoomLevel: number;
  /** Canvas pixel dimensions derived from book.dimension. Defaults to 800×600 for legacy books. */
  canvasSize: CanvasSize;
  setCurrentLanguage: (language: Language) => void;
  setCurrentStep: (step: PipelineStep) => void;
  setZoomLevel: (level: number) => void;
  /** Set canvas size from book dimension (for contexts that don't need full resetSettings). */
  setCanvasSize: (dimension: number | null) => void;
  resetSettings: (language: Language, step: PipelineStep, dimension: number | null) => void;
}

export const useEditorSettingsStore = create<EditorSettingsStore>()(
  devtools(
    (set, get) => ({
      currentLanguage: DEFAULT_LANGUAGE,
      currentStep: 'manuscript',
      zoomLevel: 90,
      canvasSize: DEFAULT_CANVAS_SIZE,

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

      setCanvasSize: (dimension) => {
        const canvasSize = resolveCanvasSize(dimension);
        log.info('setCanvasSize', 'set', { canvasWidth: canvasSize.width, canvasHeight: canvasSize.height });
        set({ canvasSize });
      },

      resetSettings: (language, step, dimension) => {
        const canvasSize = resolveCanvasSize(dimension);
        log.info('resetSettings', 'reset', {
          language: language.code,
          step,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
        });
        set({ currentLanguage: language, currentStep: step, canvasSize });
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

export const useCanvasSize = () =>
  useEditorSettingsStore((s) => s.canvasSize);

export const useCanvasWidth = () =>
  useEditorSettingsStore((s) => s.canvasSize.width);

export const useCanvasHeight = () =>
  useEditorSettingsStore((s) => s.canvasSize.height);

export const useCanvasAspectRatio = () =>
  useEditorSettingsStore((s) => s.canvasSize.width / s.canvasSize.height);

export const useSetCanvasSize = () =>
  useEditorSettingsStore((s) => s.setCanvasSize);

export const useEditorSettingsActions = () =>
  useEditorSettingsStore(
    useShallow((s) => ({
      setCurrentLanguage: s.setCurrentLanguage,
      setCurrentStep: s.setCurrentStep,
      setZoomLevel: s.setZoomLevel,
      setCanvasSize: s.setCanvasSize,
      resetSettings: s.resetSettings,
    }))
  );
