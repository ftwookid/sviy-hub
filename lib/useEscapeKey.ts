"use client";

import { useEffect, useRef } from "react";

/**
 * Close on Escape, topmost overlay first.
 *
 * Half the overlays in the app wired this up by hand and half never did, which
 * made Escape feel broken rather than absent. The other half of the problem is
 * nesting: a confirm modal over a slide-over meant two listeners on `document`,
 * and one keypress closed both.
 *
 * So every overlay registers into a shared stack on mount. Each still owns its
 * own listener — a single shared one needs an "is it attached?" flag, and that
 * flag drifts out of step with reality the moment a mount order is unusual, in
 * which case Escape silently stops working everywhere. Instead the listeners
 * all fire and all but the last-registered one bows out, which is self-checking:
 * nothing to keep in sync, and the top of the stack is the top of the screen.
 *
 * Pass `enabled: false` while a press should do nothing at all — mid-scan, say,
 * when there is nothing safe to close to.
 */
const stack: object[] = [];

export function useEscapeKey(onEscape: () => void, enabled = true) {
  // Held in a ref so a fresh inline closure on each render does not tear the
  // listener down and re-register it at the top of the stack.
  const callback = useRef(onEscape);
  callback.current = onEscape;

  useEffect(() => {
    if (!enabled) return;

    const entry = {};
    stack.push(entry);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (stack[stack.length - 1] !== entry) return;
      event.stopPropagation();
      callback.current();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [enabled]);
}
