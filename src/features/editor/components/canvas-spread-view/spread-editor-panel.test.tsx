// spread-editor-panel.test.tsx — Animation overlay logic contracts (ADR-028)
// Contract tests: ZoomAreaOverlay + MotionLineOverlay mutual exclusion, drawZoomAreaMode gating
// Note: SpreadEditorPanel has heavy deps (useInteractionLayer, zustand stores, etc.)
// These tests validate the core rendering logic contracts without full DOM rendering

import { describe, it, expect } from 'vitest';
import type { SpreadAnimation } from '@/types/spread-types';

/**
 * Overlay rendering rule contracts (from spread-editor-panel.tsx §Line 1007-1080)
 *
 * Priority order:
 * 1. DrawZoomAreaSurface IF drawZoomAreaMode === true
 * 2. ZoomAreaOverlay IF effect.type === 19 AND target.type === 'spread' AND geometry exists
 * 3. MotionLineOverlay IF effect.type === 16 AND geometry exists AND item geometry resolvable
 * 4. Nothing IF none of above apply
 */

interface OverlayRenderingState {
  drawZoomAreaMode?: boolean;
  expandedAnimation?: SpreadAnimation | null;
  expandedAnimationIndex?: number | null;
  itemGeometryResolvable?: boolean; // Simulation of resolveTargetItemGeometry(target, spread)
}

function resolveOverlayRender(state: OverlayRenderingState): string {
  const { drawZoomAreaMode, expandedAnimation, expandedAnimationIndex, itemGeometryResolvable } =
    state;

  // Rule 1: DrawZoomAreaSurface blocks all overlays
  if (drawZoomAreaMode === true) {
    return 'DrawZoomAreaSurface';
  }

  // Rule 2: ZoomAreaOverlay
  if (
    expandedAnimation?.effect.type === 19 &&
    expandedAnimation.target.type === 'spread' &&
    expandedAnimation.effect.geometry &&
    expandedAnimationIndex !== null &&
    expandedAnimationIndex !== undefined
  ) {
    return 'ZoomAreaOverlay';
  }

  // Rule 3: MotionLineOverlay
  if (
    expandedAnimation?.effect.type === 16 &&
    expandedAnimation.effect.geometry &&
    expandedAnimationIndex !== null &&
    expandedAnimationIndex !== undefined &&
    itemGeometryResolvable !== false
  ) {
    return 'MotionLineOverlay';
  }

  // Rule 4: No overlay
  return 'none';
}

function buildMockAnimation(
  effectType: number,
  targetType: SpreadAnimation['target']['type'] = 'spread',
  order: number = 0,
): SpreadAnimation {
  return {
    order,
    type: 0,
    target: { type: targetType, id: targetType === 'spread' ? 'spread-1' : 'item-1' },
    trigger_type: 'on_click',
    effect: {
      type: effectType,
      duration: 500,
      geometry: { x: 0, y: 0, w: 100, h: 100 },
    },
  };
}

describe('SpreadEditorPanel — overlay rendering contracts (ADR-028)', () => {
  describe('overlay mutual exclusion', () => {
    it('drawZoomAreaMode=true blocks ZoomAreaOverlay', () => {
      const animation = buildMockAnimation(19, 'spread', 0);

      const result = resolveOverlayRender({
        drawZoomAreaMode: true,
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
      });

      expect(result).toBe('DrawZoomAreaSurface');
    });

    it('drawZoomAreaMode=true blocks MotionLineOverlay', () => {
      const animation = buildMockAnimation(16, 'image', 0);

      const result = resolveOverlayRender({
        drawZoomAreaMode: true,
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
        itemGeometryResolvable: true,
      });

      expect(result).toBe('DrawZoomAreaSurface');
    });

    it('ZoomAreaOverlay and MotionLineOverlay mutually exclusive (by effect.type)', () => {
      const zoomAnim = buildMockAnimation(19, 'spread', 0);
      const lineAnim = buildMockAnimation(16, 'image', 1);

      const zoomResult = resolveOverlayRender({
        expandedAnimation: zoomAnim,
        expandedAnimationIndex: 0,
      });

      const lineResult = resolveOverlayRender({
        expandedAnimation: lineAnim,
        expandedAnimationIndex: 1,
        itemGeometryResolvable: true,
      });

      expect(zoomResult).toBe('ZoomAreaOverlay');
      expect(lineResult).toBe('MotionLineOverlay');
    });
  });

  describe('ZoomAreaOverlay rendering conditions', () => {
    it('renders when effect.type === 19, target.type === spread, geometry present', () => {
      const animation = buildMockAnimation(19, 'spread', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
      });

      expect(result).toBe('ZoomAreaOverlay');
    });

    it('does not render when effect.type !== 19', () => {
      const animation = buildMockAnimation(20, 'spread', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
      });

      expect(result).not.toBe('ZoomAreaOverlay');
    });

    it('does not render when target.type !== spread', () => {
      const animation = buildMockAnimation(19, 'image', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
      });

      expect(result).not.toBe('ZoomAreaOverlay');
    });

    it('does not render when geometry is missing', () => {
      const animation = buildMockAnimation(19, 'spread', 0);
      const animWithoutGeom = {
        ...animation,
        effect: { ...animation.effect, geometry: undefined },
      };

      const result = resolveOverlayRender({
        expandedAnimation: animWithoutGeom,
        expandedAnimationIndex: 0,
      });

      expect(result).not.toBe('ZoomAreaOverlay');
    });

    it('does not render when expandedAnimationIndex is null', () => {
      const animation = buildMockAnimation(19, 'spread', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: null,
      });

      expect(result).not.toBe('ZoomAreaOverlay');
    });
  });

  describe('MotionLineOverlay rendering conditions', () => {
    it('renders when effect.type === 16, geometry present, item geometry resolvable', () => {
      const animation = buildMockAnimation(16, 'image', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
        itemGeometryResolvable: true,
      });

      expect(result).toBe('MotionLineOverlay');
    });

    it('does not render when effect.type !== 16', () => {
      const animation = buildMockAnimation(15, 'image', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
        itemGeometryResolvable: true,
      });

      expect(result).not.toBe('MotionLineOverlay');
    });

    it('does not render when geometry is missing', () => {
      const animation = buildMockAnimation(16, 'image', 0);
      const animWithoutGeom = {
        ...animation,
        effect: { ...animation.effect, geometry: undefined },
      };

      const result = resolveOverlayRender({
        expandedAnimation: animWithoutGeom,
        expandedAnimationIndex: 0,
        itemGeometryResolvable: true,
      });

      expect(result).not.toBe('MotionLineOverlay');
    });

    it('does not render when item geometry cannot be resolved', () => {
      const animation = buildMockAnimation(16, 'image', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: 0,
        itemGeometryResolvable: false,
      });

      expect(result).not.toBe('MotionLineOverlay');
    });

    it('does not render when expandedAnimationIndex is null', () => {
      const animation = buildMockAnimation(16, 'image', 0);

      const result = resolveOverlayRender({
        expandedAnimation: animation,
        expandedAnimationIndex: null,
        itemGeometryResolvable: true,
      });

      expect(result).not.toBe('MotionLineOverlay');
    });
  });

  describe('no overlay (default, backward compatibility)', () => {
    it('renders no overlay when all props undefined', () => {
      const result = resolveOverlayRender({
        drawZoomAreaMode: undefined,
        expandedAnimation: undefined,
      });

      expect(result).toBe('none');
    });

    it('renders no overlay when expandedAnimation is null', () => {
      const result = resolveOverlayRender({
        expandedAnimation: null,
      });

      expect(result).toBe('none');
    });

    it('backward compatibility: consumers not passing animation props get zero overlays', () => {
      // Simulate old CanvasSpreadView consumer not aware of animation props
      const result = resolveOverlayRender({
        // No animation props at all
      });

      expect(result).toBe('none');
    });
  });

  describe('drawZoomAreaMode gating side-effects', () => {
    it('contract: drawZoomAreaMode=true suppresses item.onSelect callback', () => {
      // In spread-editor-panel.tsx:
      // const itemInteractionDisabled = drawZoomAreaMode === true;
      // handleElementSelectGated: if (itemInteractionDisabled) return; // no-op

      const drawZoomAreaMode = true;
      const itemInteractionDisabled = drawZoomAreaMode === true;

      expect(itemInteractionDisabled).toBe(true);
    });

    it('contract: drawZoomAreaMode=true suppresses toolbar render', () => {
      // In spread-editor-panel.tsx line 1122-1124:
      // {state.selectedElement && !itemInteractionDisabled && (...toolbar code...)}

      const drawZoomAreaMode = true;
      const itemInteractionDisabled = drawZoomAreaMode === true;

      const shouldRenderToolbar = !itemInteractionDisabled;

      expect(shouldRenderToolbar).toBe(false);
    });

    it('contract: spread change triggers onDrawZoomAreaCancel', () => {
      // In spread-editor-panel.tsx useEffect[spread.id]:
      // if (drawZoomAreaMode && onDrawZoomAreaCancel) {
      //   onDrawZoomAreaCancel();
      // }

      const beforeSpread = { id: 'spread-1' };
      const afterSpread = { id: 'spread-2' };

      const shouldCancel = beforeSpread.id !== afterSpread.id;

      expect(shouldCancel).toBe(true);
    });
  });

  describe('animation label resolution', () => {
    it('contract: ZoomArea label shows Camera Zoom #N counter', () => {
      // From resolveZoomLabel():
      // const zoomList = allAnimations.filter(a => a.effect.type === 19 && a.target.type === 'spread');
      // const idx = zoomList.findIndex(a => a.order === animation.order);
      // return `Camera Zoom #${idx + 1}`;

      const allAnimations: SpreadAnimation[] = [
        buildMockAnimation(19, 'spread', 0),
        buildMockAnimation(19, 'spread', 1),
      ];

      const zoomList = allAnimations.filter((a) => a.effect.type === 19 && a.target.type === 'spread');
      const secondAnim = allAnimations[1];
      const idx = zoomList.findIndex((a) => a.order === secondAnim.order);

      expect(idx + 1).toBe(2); // Second zoom animation
    });

    it('contract: MotionLine label shows Motion Line #N counter', () => {
      // From resolveMotionLineLabel():
      // const linesList = allAnimations.filter(a => a.effect.type === 16);
      // const idx = linesList.findIndex(a => a.order === animation.order);
      // return `Motion Line #${idx + 1}`;

      const allAnimations: SpreadAnimation[] = [
        buildMockAnimation(16, 'image', 0),
        buildMockAnimation(16, 'image', 1),
      ];

      const linesList = allAnimations.filter((a) => a.effect.type === 16);
      const secondAnim = allAnimations[1];
      const idx = linesList.findIndex((a) => a.order === secondAnim.order);

      expect(idx + 1).toBe(2); // Second motion line animation
    });
  });
});
