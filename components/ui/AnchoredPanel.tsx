"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/cn";

/**
 * A panel pinned to a control, portalled to the body.
 *
 * Anything that opens over the page has to live outside the page's own boxes.
 * An absolutely positioned panel works right up until the field sits in
 * something that clips — and most places in this app do: the Finances setup
 * card is `overflow-hidden` for its 20px corners, every slide-over is
 * `overflow-y-auto`. Either one cuts the panel in half. Nothing an ancestor
 * does can clip a fixed element in a body portal.
 *
 * The height is measured rather than guessed, in a layout effect before paint,
 * so a six-row menu and a calendar both decide correctly whether they have room
 * below. Until it has measured, the panel is hidden — placed, not moved.
 */

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

export function AnchoredPanel({
  anchorRef,
  open,
  onClose,
  width,
  className,
  children
}: {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  /** Panel width in px, clamped to the viewport. Defaults to the anchor's own width. */
  width?: number;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(width ?? rect.width, window.innerWidth - VIEWPORT_MARGIN * 2);
    const panelHeight = panel.offsetHeight;

    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - panelWidth - VIEWPORT_MARGIN)
    );

    const below = rect.bottom + ANCHOR_GAP;
    const roomBelow = window.innerHeight - below - VIEWPORT_MARGIN;
    // Flip above only where there is genuinely more room, so a control near the
    // bottom of a sheet opens upwards instead of running off the screen.
    const flip = panelHeight > roomBelow && rect.top - ANCHOR_GAP > roomBelow;
    const top = flip
      ? Math.max(VIEWPORT_MARGIN, rect.top - ANCHOR_GAP - panelHeight)
      : Math.max(VIEWPORT_MARGIN, Math.min(below, window.innerHeight - panelHeight - VIEWPORT_MARGIN));

    // Only on a real move: this runs after every render, and handing back a
    // fresh object each time would re-render forever.
    setPosition((current) =>
      current && current.left === left && current.top === top && current.width === panelWidth
        ? current
        : { left, top, width: panelWidth }
    );
  }, [anchorRef, width]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition((current) => (current === null ? current : null));
      return;
    }

    place();

    // The panel's own height decides whether it opens up or down, so a panel
    // that changes size while open — the calendar switching between days and
    // months — has to be placed again rather than left where it started.
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Capture, so the panel follows a control inside a scrolling sheet.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className={cn(
        "popover-panel fixed z-[200] rounded-2xl border border-border bg-surface shadow-[0_18px_48px_rgba(80,66,44,0.14)]",
        className
      )}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: position?.width ?? width,
        visibility: position ? "visible" : "hidden"
      }}
    >
      {children}
    </div>,
    document.body
  );
}
