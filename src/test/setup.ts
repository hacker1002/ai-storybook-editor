import { afterEach, vi } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';

// Setup global mocks
afterEach(() => {
  vi.clearAllMocks();
});

// Mock react-moveable for tests
vi.mock('react-moveable', () => {
  const Moveable = React.forwardRef(({
    target,
    draggable,
    onDragStart,
    onDrag,
    onDragEnd,
    className,
    // Consume props that are not used in mock
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resizable,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onResizeStart,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onResize,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onResizeEnd,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    throttleDrag,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    throttleResize,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    edge,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    keepRatio,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    origin,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    renderDirections,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    padding,
    ...props
  }: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      updateRect: vi.fn(),
      getRect: vi.fn(() => ({ left: 0, top: 0, width: 100, height: 100 })),
    }));

    React.useEffect(() => {
      const targetElement = target?.current;
      if (!targetElement) return;

      const handleMouseDown = (e: MouseEvent) => {
        if (!draggable) return;
        onDragStart?.();

        const startX = e.clientX;
        const startY = e.clientY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const dist = [
            moveEvent.clientX - startX,
            moveEvent.clientY - startY,
          ];
          onDrag?.({ dist, distX: dist[0], distY: dist[1] });
        };

        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          onDragEnd?.();
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      };

      targetElement.addEventListener('mousedown', handleMouseDown);

      return () => {
        targetElement.removeEventListener('mousedown', handleMouseDown);
      };
    }, [target, draggable, onDragStart, onDrag, onDragEnd]);

    // Filter out react-moveable-specific props before passing to div
    const divProps = {
      ...props,
      className,
      'data-testid': 'moveable-mock',
    };

    return React.createElement('div', divProps);
  });

  Moveable.displayName = 'Moveable';

  return { default: Moveable };
});
