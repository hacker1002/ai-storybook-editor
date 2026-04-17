import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools } from 'zustand/middleware';
import type { Language, PipelineStep } from '@/types/editor';
import type { CanvasSize, BleedCanvasSize } from '@/types/canvas-types';
import { DEFAULT_LANGUAGE } from '@/constants/editor-constants';
import { DEFAULT_CANVAS_SIZE } from '@/constants/canvas-dimension-constants';
import { resolveCanvasSize, resolveBleedCanvasSize } from '@/utils/canvas-math-utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'EditorSettingsStore');

interface EditorSettingsStore {
  currentLanguage: Language;
  currentStep: PipelineStep;
  /** Active zoom level (percentage). Set by whichever view is currently active. */
  zoomLevel: number;
  /** Canvas pixel dimensions derived from book.dimension. Defaults to 800×600 for legacy books. */
  canvasSize: CanvasSize;
  /** Bleed canvas geometry — null until hydrateBleedCanvas is called on book load. */
  bleedCanvas: BleedCanvasSize | null;
  setCurrentLanguage: (language: Language) => void;
  setCurrentStep: (step: PipelineStep) => void;
  setZoomLevel: (level: number) => void;
  /** Set canvas size from book dimension (for contexts that don't need full resetSettings). */
  setCanvasSize: (dimension: number | null) => void;
  hydrateBleedCanvas: (dimension: number | null, bleedMm?: number) => void;
  resetSettings: (language: Language, step: PipelineStep, dimension: number | null, bleedMm?: number) => void;
}

export const useEditorSettingsStore = create<EditorSettingsStore>()(
  devtools(
    (set, get) => ({
      currentLanguage: DEFAULT_LANGUAGE,
      currentStep: 'manuscript',
      zoomLevel: 90,
      canvasSize: DEFAULT_CANVAS_SIZE,
      bleedCanvas: null,

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

      hydrateBleedCanvas: (dimension, bleedMm = 3) => {
        const bleedCanvas = resolveBleedCanvasSize(dimension, bleedMm);
        log.info('hydrateBleedCanvas', 'hydrated', {
          dimension, bleedMm,
          bleedPctX: bleedCanvas.bleedPct.x.toFixed(2),
          bleedPctY: bleedCanvas.bleedPct.y.toFixed(2),
        });
        set({ bleedCanvas });
      },

      resetSettings: (language, step, dimension, bleedMm = 3) => {
        const canvasSize = resolveCanvasSize(dimension);
        const bleedCanvas = resolveBleedCanvasSize(dimension, bleedMm);
        log.info('resetSettings', 'reset', {
          language: language.code,
          step,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
        });
        set({ currentLanguage: language, currentStep: step, canvasSize, bleedCanvas });
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

export const useBleedCanvas = () =>
  useEditorSettingsStore((s) => s.bleedCanvas);

export const useBleedSize = () =>
  useEditorSettingsStore((s) => s.bleedCanvas?.bleed ?? s.canvasSize);

export const useTrimSize = () =>
  useEditorSettingsStore((s) => s.bleedCanvas?.trim ?? s.canvasSize);

export const useBleedPct = () =>
  useEditorSettingsStore((s) => s.bleedCanvas?.bleedPct ?? { x: 0, y: 0 });

export const useEditorSettingsActions = () =>
  useEditorSettingsStore(
    useShallow((s) => ({
      setCurrentLanguage: s.setCurrentLanguage,
      setCurrentStep: s.setCurrentStep,
      setZoomLevel: s.setZoomLevel,
      setCanvasSize: s.setCanvasSize,
      hydrateBleedCanvas: s.hydrateBleedCanvas,
      resetSettings: s.resetSettings,
    }))
  );
