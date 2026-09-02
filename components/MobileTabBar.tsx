"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Same shape as the sidebar's nav items, so AppShell hands the one list to both. */
export type TabItem = { label: string; href: string; icon: LucideIcon };

/**
 * The phone's bottom navigation.
 *
 * The selection is a **single pill that moves**, not a tint that blinks from one
 * cell to another — and it can be dragged. Put a finger on the bar and slide:
 * the pill comes with you, the tab under it lights up as you pass, and letting
 * go lands on whichever one you stopped over. Tapping still works exactly as it
 * did; a drag is only a drag once the finger has travelled past DRAG_THRESHOLD,
 * so a tap that wobbles a couple of pixels is still a tap.
 *
 * Why a drag at all: five destinations along the bottom edge of a large phone
 * are a thumb-stretch apart, and the reach to the far one is the whole width of
 * the screen. Sliding lets the thumb stay put and bring the bar to it, which is
 * how every native iOS bar of this shape behaves; without it the control looks
 * like one of those and then does not respond, which reads as broken rather
 * than as plain.
 *
 * On the house motion rule: nothing here scales, and there is no springy
 * overshoot. The pill only ever translates, because while a finger is down the
 * translation *is* the finger — that is direct manipulation, not decoration,
 * which is what the no-transform rule is about. During the drag it tracks 1:1
 * with no transition at all (a transition would make it lag behind the thumb);
 * on release it glides to the slot it landed on, and under
 * `prefers-reduced-motion` it simply arrives.
 */

/** Pixels of travel before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 8;

type Slot = { center: number; left: number; width: number };

export function MobileTabBar({
  items,
  activeIndex
}: {
  items: TabItem[];
  activeIndex: number;
}) {
  const router = useRouter();
  const rowRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const [slots, setSlots] = useState<Slot[]>([]);
  // While dragging, the pill's centre in row coordinates. Null the rest of the
  // time, when the pill simply sits on the active slot.
  const [dragCenter, setDragCenter] = useState<number | null>(null);

  // A press that has not yet travelled far enough to count as a drag. Kept in a
  // ref because every pointermove reads it and none of them should re-render.
  const press = useRef<{ id: number; startX: number; grabOffset: number } | null>(null);
  // Set the moment a press becomes a drag, and read by the click handler to
  // swallow the click the browser fires on the link underneath afterwards.
  const dragged = useRef(false);

  /** Measure the cells, so the pill's geometry comes from the DOM rather than
   *  from a guess about grid maths that a different screen width would break. */
  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const origin = row.getBoundingClientRect().left;
    const next = cellRefs.current.slice(0, items.length).map((cell) => {
      const rect = cell?.getBoundingClientRect();
      if (!rect) return { center: 0, left: 0, width: 0 };
      return { center: rect.left - origin + rect.width / 2, left: rect.left - origin, width: rect.width };
    });
    setSlots(next);
  }, [items.length]);

  useLayoutEffect(() => {
    measure();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure]);

  // Rotating the phone changes the row's width without resizing anything the
  // observer watches on some browsers, so re-measure on orientation too.
  useEffect(() => {
    window.addEventListener("orientationchange", measure);
    return () => window.removeEventListener("orientationchange", measure);
  }, [measure]);

  const nearestIndex = useCallback(
    (center: number) => {
      let best = 0;
      let bestDistance = Infinity;
      slots.forEach((slot, index) => {
        const distance = Math.abs(slot.center - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    },
    [slots]
  );

  // The tab that reads as selected: the one under the pill while dragging, the
  // real route the rest of the time. Dragging over a tab previews it — the
  // navigation itself waits for the finger to lift, so sliding across all five
  // does not fire four route changes on the way past.
  const highlighted = dragCenter === null ? activeIndex : nearestIndex(dragCenter);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!slots.length) return;
    dragged.current = false;
    const origin = rowRef.current?.getBoundingClientRect().left ?? 0;
    const x = event.clientX - origin;
    press.current = {
      id: event.pointerId,
      startX: x,
      // Grabbing the pill near its edge should not teleport its centre under the
      // finger; keep the offset the press started with.
      grabOffset: x - (slots[activeIndex]?.center ?? x)
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = press.current;
    if (!current || event.pointerId !== current.id || !slots.length) return;

    const origin = rowRef.current?.getBoundingClientRect().left ?? 0;
    const x = event.clientX - origin;

    if (!dragged.current) {
      if (Math.abs(x - current.startX) < DRAG_THRESHOLD) return;
      dragged.current = true;
      // Capture only once it is really a drag, so a plain tap never steals the
      // pointer from the link it landed on.
      event.currentTarget.setPointerCapture(current.id);
    }

    // Clamped to the first and last slot centres: the pill is a selection, and a
    // selection cannot sit off the end of the bar.
    const first = slots[0].center;
    const last = slots[slots.length - 1].center;
    setDragCenter(Math.min(Math.max(x - current.grabOffset, first), last));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const current = press.current;
    press.current = null;
    if (!current || !dragged.current) {
      setDragCenter(null);
      return;
    }

    const landed = dragCenter === null ? activeIndex : nearestIndex(dragCenter);
    setDragCenter(null);
    if (event.currentTarget.hasPointerCapture(current.id)) {
      event.currentTarget.releasePointerCapture(current.id);
    }
    if (landed !== activeIndex) router.push(items[landed].href);
  }

  function handlePointerCancel() {
    press.current = null;
    dragged.current = false;
    setDragCenter(null);
  }

  // A drag that ends over a link would otherwise fire that link's click as well,
  // navigating twice — and a drag that ends back where it started would navigate
  // when the user had decided not to.
  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragged.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragged.current = false;
  }

  const pill = slots[highlighted];
  const pillCenter = dragCenter ?? pill?.center ?? 0;

  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-50 rounded-[24px] border border-white/70 bg-surface/78 px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 shadow-[0_18px_48px_rgba(80,66,44,0.16)] backdrop-blur-2xl md:hidden"
      aria-label="Sections"
    >
      <div
        ref={rowRef}
        className="relative grid grid-cols-5 gap-1"
        // Horizontal movement is the bar's; vertical still scrolls the page, so
        // a flick that starts on the bar does not trap the scroll.
        style={{ touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
      >
        {/* One pill that moves, rather than five tints that take turns. */}
        {pill ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 rounded-[18px] bg-accent-soft ring-1 ring-inset ring-accent/45",
              // No transition while the finger is down: the pill is the finger,
              // and easing it would make it trail behind the thumb.
              dragCenter === null &&
                "transition-transform duration-[260ms] ease-out motion-reduce:transition-none"
            )}
            style={{
              width: pill.width,
              transform: `translateX(${pillCenter - pill.width / 2}px)`
            }}
          />
        ) : null}

        {items.map((item, index) => {
          const Icon = item.icon;
          const on = index === highlighted;
          return (
            <Link
              key={item.href}
              ref={(node) => {
                cellRefs.current[index] = node;
              }}
              href={item.href}
              aria-current={index === activeIndex ? "page" : undefined}
              draggable={false}
              className={cn(
                "relative z-10 flex min-h-14 select-none flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] transition-colors duration-200 ease-out",
                on ? "font-semibold text-accent" : "font-medium text-text-tertiary"
              )}
            >
              <Icon size={21} strokeWidth={on ? 2.1 : 1.6} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
