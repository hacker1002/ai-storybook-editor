// selection-frame.tsx - Selection overlay with drag/resize using react-moveable
'use client';

import { useRef, useEffect } from 'react';
import Moveable from 'react-moveable';
import type { Geometry, Point, ResizeHandle } from '@/types/canvas-types';
import { createLogger } from '@/utils/logger';
import { Z_INDEX } from '@/constants/spread-constants';

const log = createLogger('Editor', 'SelectionFrame');

interface SelectionFrameProps {
  geometry: Geometry;
  zoomLevel: number;
  showHandles: boolean;
  activeHandle: ResizeHandle | null;

  // Feature flags
  canDrag?: boolean;
  canResize?: boolean;
  // When true, only border edges capture drag (for textbox editing). Otherwise full area is draggable.
  borderOnlyDrag?: boolean;

  // Drag callbacks
  onDragStart: () => void;
  onDrag: (delta: Point) => void;
  onDragEnd: () => void;

  // Resize callbacks
  onResizeStart: (handle: ResizeHandle) => void;
  onResize: (handle: ResizeHandle, delta: Point) => void;
  onResizeEnd: () => void;
}

export function SelectionFrame({
  geometry,
  zoomLevel,
  showHandles,
  activeHandle,
  canDrag = true,
  canResize = true,
  borderOnlyDrag = false,
  onDragStart,
  onDrag,
  onDragEnd,
  onResizeStart,
  onResize,
  onResizeEnd,
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
  }, [geometry.x, geometry.y, geometry.w, geometry.h]);

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

  // Border width for drag zone in border-only mode (textbox)
  const DRAG_BORDER_WIDTH = 30;

  // Compute className for active handle visual feedback (use prop directly)
  const moveableClassName = activeHandle
    ? `moveable-selection active-${activeHandle}`
    : 'moveable-selection';

  return (
    <>
      {/* Frame container — drag zone depends on borderOnlyDrag mode */}
      <div
        ref={targetRef}
        className="absolute"
        style={{
          left: `${geometry.x}%`,
          top: `${geometry.y}%`,
          width: `${geometry.w}%`,
          height: `${geometry.h}%`,
          zIndex: Z_INDEX.SELECTION_FRAME,
          pointerEvents: borderOnlyDrag ? 'none' : 'auto',
          cursor: borderOnlyDrag ? undefined : 'move',
        }}
      >
        {/* Border-only drag zones (textbox): edges capture drag, center passes through for editing */}
        {borderOnlyDrag && (
          <>
            <div
              className="absolute left-0 right-0 top-0 cursor-move"
              style={{ height: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 cursor-move"
              style={{ height: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
            />
            <div
              className="absolute left-0 top-0 bottom-0 cursor-move"
              style={{ width: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 cursor-move"
              style={{ width: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
            />
          </>
        )}
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
        throttleDrag={0}
        throttleResize={0}
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
      />
    </>
  );
}

export default SelectionFrame;
