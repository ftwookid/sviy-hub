"use client";

import { useEffect } from "react";

/**
 * Hold the page still while a panel is open.
 *
 * Every overlay in this app is a scroller inside a `fixed inset-0` box, and
 * nothing underneath it was ever pinned — so the page behind kept its own
 * scroll the whole time it was covered. Two ways out of the panel, both of them
 * the reader doing an ordinary thing:
 *
 * - **Scroll chaining.** A scroller that has hit its end hands the rest of the
 *   gesture to its parent, and the parent here is the document. So reaching the
 *   bottom of a timeline and carrying on scrolling walks the month underneath
 *   instead, which is what Ivan hit. `overscroll-contain` on the scroller is the
 *   fix for that half, and it is on every panel scroller now.
 * - **Anywhere that is not the scroller.** A drag on the backdrop, or on the
 *   panel's own fixed header — which on `DetailSheet` is the name, the figure
 *   and the month, about 100px of a phone screen — never reaches the scroller
 *   at all, so no `overscroll-behavior` anywhere can help. The document is the
 *   thing that has to stop.
 *
 * **Why `position: fixed` and not `overflow: hidden`.** `overflow: hidden` on
 * the body does not stop a touch drag on iOS Safari, which is the browser this
 * app is actually used in; it works on a desktop and looks fixed until it is
 * held in a hand. Taking the body out of flow is what iOS honours, and it costs
 * the scroll position — hence `top: -scrollY` on the way in and a `scrollTo` on
 * the way out, so the page is exactly where it was left.
 *
 * **No scrollbar compensation, deliberately.** The usual pairing is a
 * `padding-right` for the scrollbar that vanishes when the document stops
 * overflowing, and here it would shift the page the wrong way: `globals.css`
 * sets `scrollbar-gutter: stable` on `html`, so the gutter is reserved whether
 * or not anything is scrolling, and there is no width to give back.
 *
 * **Ref-counted**, because these nest: `ConfirmDialog` opens over `SetupSheet`,
 * and the mileage preview over the uploader. Releasing the inner one must not
 * unpin the page while the outer is still on screen, and the scroll position to
 * restore is the one from before the *first* lock.
 *
 * The argument is "is this overlay on screen", which is **not** the same
 * question `useEscapeKey`'s `enabled` answers. That one is "should Escape do
 * something", and it goes false mid-save on half these panels — coupling them
 * would unpin the page underneath a dialog that is still very much up.
 */
type Restore = {
  position: string;
  top: string;
  left: string;
  right: string;
  scrollY: number;
};

let depth = 0;
let restore: Restore | null = null;

function lock() {
  depth += 1;
  if (depth > 1) return;

  const { style } = document.body;
  restore = {
    position: style.position,
    top: style.top,
    left: style.left,
    right: style.right,
    scrollY: window.scrollY
  };

  style.position = "fixed";
  style.top = `-${restore.scrollY}px`;
  style.left = "0";
  style.right = "0";
}

function release() {
  if (depth === 0) return;
  depth -= 1;
  if (depth > 0 || !restore) return;

  const { style } = document.body;
  style.position = restore.position;
  style.top = restore.top;
  style.left = restore.left;
  style.right = restore.right;
  window.scrollTo(0, restore.scrollY);
  restore = null;
}

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return release;
  }, [active]);
}
