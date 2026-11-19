"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Horizontal lane with hidden scrollbars and desktop drag-to-scroll.
 *
 * Touch devices keep native momentum scrolling. A mouse drag starts only after a short horizontal
 * movement, captures the pointer, and suppresses the click that follows so a drag never opens a
 * product/category link. Keyboard focus and native wheel/trackpad scrolling are unchanged.
 */
export function DragScroll({
  children,
  className = "",
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    dragged: false,
  });
  const [dragging, setDragging] = useState(false);

  const finish = (event?: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    setDragging(false);
    if (event && ref.current?.hasPointerCapture(event.pointerId)) {
      ref.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={ref}
      className={`drag-scroll ${className}${dragging ? " is-dragging" : ""}`}
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        const node = ref.current;
        if (!node) return;
        drag.current = {
          active: true,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: node.scrollLeft,
          dragged: false,
        };
      }}
      onPointerMove={(event) => {
        const node = ref.current;
        const state = drag.current;
        if (!node || !state.active) return;
        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        if (!state.dragged) {
          if (Math.abs(deltaX) < 5 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
          state.dragged = true;
          setDragging(true);
          node.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        node.scrollLeft = state.startLeft - deltaX;
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={(event) => {
        if (!drag.current.dragged) finish(event);
      }}
      onClickCapture={(event) => {
        if (!drag.current.dragged) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current.dragged = false;
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
