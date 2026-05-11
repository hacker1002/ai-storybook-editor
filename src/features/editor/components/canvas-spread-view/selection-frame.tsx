// selection-frame.tsx - Selection overlay with drag/resize using react-moveable
'use client';

import { useRef, useEffect } from 'react';
import Moveable from 'react-moveable';
import type { Geometry, Point, ResizeHandle } from '@/types/canvas-types';
import { useSelectionToolbarPlacementStore } from '@/stores/selection-toolbar-placement-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SelectionFrame');

interface SelectionFrameProps {
  geometry: Geometry;
  // Mirror selected item's stacking index — items with a higher z-index than
  // the selected one stay above the frame and remain interactive. See
  // resolve-item-z-index.ts for the single source of truth.
  zIndex: number;
  zoomLevel: number;
  showHandles: boolean;
  showRotateHandle?: boolean;
  activeHandle: ResizeHandle | null;

  // Feature flags
  canDrag?: boolean;
  canResize?: boolean;
  canRotate?: boolean;

  // Double-click forwarding — parent uses this to trigger edit mode
  onDoubleClick?: (e: React.MouseEvent) => void;

  // ADR-029 — mousedown on frame body (bubble-phase) for click-no-drag hijack.
  // Parent decides whether a small-delta click should re-route selection.
  onFrameMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;

  // Drag callbacks
  onDragStart: () => void;
  onDrag: (delta: Point) => void;
  onDragEnd: () => void;

  // Resize callbacks
  onResizeStart: (handle: ResizeHandle) => void;
  onResize: (handle: ResizeHandle, delta: Point) => void;
  onResizeEnd: () => void;

  // Rotate callbacks — `rotation` is cumulative degrees from rotate start.
  onRotateStart?: () => void;
  onRotate?: (rotation: number) => void;
  onRotateEnd?: () => void;
}

export function SelectionFrame({
  geometry,
  zIndex,
  zoomLevel,
  showHandles,
  showRotateHandle,
  activeHandle,
  canDrag = true,
  canResize = true,
  canRotate = false,
  onDoubleClick,
  onFrameMouseDown,
  onDragStart,
  onDrag,
  onDragEnd,
  onResizeStart,
  onResize,
  onResizeEnd,
  onRotateStart,
  onRotate,
  onRotateEnd,
}: SelectionFrameProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const startGeometryRef = useRef<Geometry | null>(null);
  const currentHandleRef = useRef<ResizeHandle | null>(null);

  // Get container dimensions for percentage calculations
  useEffect(() => {
    containerRef.current = targetRef.current?.parentElement ?? null;
  }, []);

  // Update moveable when geometry changes from external source
  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [geometry.x, geometry.y, geometry.w, geometry.h, geometry.rotation]);

  // Sync activeHandle prop with internal state
  useEffect(() => {
    currentHandleRef.current = activeHandle;
  }, [activeHandle]);

  // Convert pixel delta to percentage delta
  const toPercentDelta = (dx: number, dy: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();

    // Apply zoom adjustment - moveable library returns screen pixels
    // Divide by zoomLevel because screen pixels are already scaled by zoom
    const zoomFactor = zoomLevel / 100;

    return {
      x: (dx / rect.width / zoomFactor) * 100,
      y: (dy / rect.height / zoomFactor) * 100,
    };
  };

  // Map moveable direction to our handle type
  const directionToHandle = (direction: number[]): ResizeHandle => {
    const [h, v] = direction;
    if (v === -1 && h === -1) return 'nw';
    if (v === -1 && h === 0) return 'n';
    if (v === -1 && h === 1) return 'ne';
    if (v === 0 && h === -1) return 'w';
    if (v === 0 && h === 1) return 'e';
    if (v === 1 && h === -1) return 'sw';
    if (v === 1 && h === 0) return 's';
    return 'se';
  };

  // Compute className for active handle visual feedback (use prop directly)
  const moveableClassName = activeHandle
    ? `moveable-selection active-${activeHandle}`
    : 'moveable-selection';

  // Prefer rotate handle on top; only swing right when the toolbar takes the
  // top slot (toolbar 'above' → rotate 'right'). Other toolbar placements
  // (below/left/right/none) leave plenty of room above the selection.
  const toolbarPlacement = useSelectionToolbarPlacementStore((s) => s.placement);
  const rotationPosition: 'top' | 'right' =
    toolbarPlacement === 'above' ? 'right' : 'top';

  return (
    <>
      {/* Full-body drag zone — pointer-events controlled by canDrag/canResize */}
      <div
        ref={targetRef}
        className="absolute"
        data-selection-frame-target="true"
        onDoubleClick={onDoubleClick}
        onMouseDown={onFrameMouseDown}
        style={{
          left: `${geometry.x}%`,
          top: `${geometry.y}%`,
          width: `${geometry.w}%`,
          height: `${geometry.h}%`,
          transform: `rotate(${geometry.rotation ?? 0}deg)`,
          transformOrigin: '50% 50%',
          zIndex,
          pointerEvents: (canDrag || canResize || canRotate) ? 'auto' : 'none',
          cursor: canDrag ? 'move' : 'default',
        }}
      >
        {/* Visual border */}
        <div
          className="absolute inset-0 border-2 border-blue-500 pointer-events-none"
          style={{ boxSizing: 'border-box' }}
        />
      </div>

      {/* Moveable controller */}
      <Moveable
        ref={moveableRef}
        target={targetRef}
        draggable={canDrag}
        resizable={canResize && showHandles}
        rotatable={canRotate && (showRotateHandle ?? showHandles)}
        rotationPosition={rotationPosition}
        throttleDrag={0}
        throttleResize={0}
        throttleRotate={0}
        edge={false}
        keepRatio={false}
        origin={false}
        padding={{ left: 0, top: 0, right: 0, bottom: 0 }}
        renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
        className={moveableClassName}
        // Drag events - use dist (cumulative) not delta (per-frame)
        onDragStart={() => {
          log.debug('onDragStart', 'drag started', { x: geometry.x, y: geometry.y });
          startGeometryRef.current = { ...geometry };
          onDragStart();
        }}
        onDrag={({ dist }) => {
          const percentDelta = toPercentDelta(dist[0], dist[1]);
          onDrag(percentDelta);
        }}
        onDragEnd={() => {
          startGeometryRef.current = null;
          onDragEnd();
        }}
        // Resize events - use dist (cumulative) not delta (per-frame)
        onResizeStart={({ direction }) => {
          startGeometryRef.current = { ...geometry };
          const handle = directionToHandle(direction);
          currentHandleRef.current = handle;
          onResizeStart(handle);
        }}
        onResize={({ direction, dist }) => {
          const handle = directionToHandle(direction);
          const percentDelta = toPercentDelta(dist[0], dist[1]);
          onResize(handle, percentDelta);
        }}
        onResizeEnd={() => {
          startGeometryRef.current = null;
          currentHandleRef.current = null;
          onResizeEnd();
        }}
        // Rotate events — `rotation` from Moveable is cumulative degrees from start.
        onRotateStart={() => {
          log.debug('onRotateStart', 'rotate started', {
            rotation: geometry.rotation ?? 0,
          });
          onRotateStart?.();
        }}
        onRotate={({ rotation }) => {
          onRotate?.(rotation);
        }}
        onRotateEnd={() => {
          log.debug('onRotateEnd', 'rotate ended');
          onRotateEnd?.();
        }}
      />
    </>
  );
}

export default SelectionFrame;
