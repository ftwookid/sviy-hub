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
 *
 * What makes it read as glass is the **material**, not extra movement: a fill
 * that is lighter at the top than the bottom, a white specular hairline along
 * its top edge, a shaded bottom edge, and a soft bloom of its own colour
 * underneath — so it sits *above* the bar rather than being a patch of tint cut
 * into it. Plus one thing that only exists while it is moving: a soft light
 * band inside the pill that lags behind the travel (SHEEN_LAG), as though the
 * highlight belonged to the room and the glass were sliding under it. It
 * settles back to centre a moment after the finger stops.
 *
 * **The one scale in the app.** The pill stretches along its direction of
 * travel and thins slightly across it, then springs back — the squash-and-
 * stretch that is most of what makes Apple's version read as liquid rather
 * than as a rectangle that slides. The house rule is that nothing scales, and
 * this is a deliberate, scoped exception to it, recorded in CLAUDE.md.
 *
 * It is safe *here* for the reason the rule exists elsewhere: that rule was
 * written after a tile inside a bordered card kept its border while its
 * contents scaled away from it, flashing white gutters down both edges. This
 * pill carries its own ring and its own background and has nothing hugging it,
 * so it deforms as one object and no gutter can open. The exception does not
 * generalise: it is this element, driven by a finger, and nothing else.
 *
 * The settle is a spring rather than an ease. Real glass does not glide to a
 * halt, and a linear ease-out is the tell that separates "animated" from
 * "physical" — so the release overshoots its slot by a hair and comes back.
 */

/** Pixels of travel before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 8;

/** How far the specular band lags behind the pill, at most, in pixels. */
const SHEEN_LAG = 9;
/** Milliseconds of stillness after which the sheen and the stretch relax. */
const SETTLE_MS = 140;
/** The most the pill may stretch along its travel: 1.14 = 14% longer. */
const MAX_STRETCH = 0.14;
/** Speed, in px per millisecond, at which the stretch reaches its maximum. */
const STRETCH_AT_SPEED = 2.6;
/**
 * The settle. A spring would be better still, but a CSS transition cannot run
 * one — this curve overshoots by roughly 8% and returns, which is what the eye
 * reads as weight. Reduced motion gets a plain ease and no overshoot.
 */
const SPRING = "cubic-bezier(0.34, 1.42, 0.64, 1)";

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

  // What the pill's speed is doing to it: how far the light band is displaced,
  // and how far it is stretched along its travel. Both are functions of how
  // fast it is moving, not of where it is.
  const [sheen, setSheen] = useState(0);
  const [stretch, setStretch] = useState(0);
  // True while the pill is relaxing rather than tracking: the finger has
  // stopped or lifted, so the transition goes back on and it springs.
  const [settling, setSettling] = useState(false);
  const lastX = useRef(0);
  const lastAt = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

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
    setSettling(false);
    const origin = rowRef.current?.getBoundingClientRect().left ?? 0;
    const x = event.clientX - origin;
    lastX.current = x;
    lastAt.current = event.timeStamp;
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
      lastX.current = x;
      lastAt.current = event.timeStamp;
      // Capture only once it is really a drag, so a plain tap never steals the
      // pointer from the link it landed on.
      event.currentTarget.setPointerCapture(current.id);
    }

    const step = x - lastX.current;
    // Speed in px/ms, so the stretch means the same thing on a 120Hz phone as
    // on a 60Hz one — per-event distance would be half as large on the faster
    // screen for the identical gesture.
    const elapsed = Math.max(1, event.timeStamp - lastAt.current);
    const speed = Math.abs(step) / elapsed;
    lastX.current = x;
    lastAt.current = event.timeStamp;

    setSettling(false);
    // The band lags *against* the direction of travel, which is what selling
    // the glass depends on: the light stays where it is and the pill moves
    // under it.
    setSheen(Math.max(-SHEEN_LAG, Math.min(SHEEN_LAG, -step * 0.9)));
    setStretch(Math.min(1, speed / STRETCH_AT_SPEED) * MAX_STRETCH);

    // A finger that stops moving stops sending events, so nothing else would
    // ever relax the stretch — it would sit there elongated under a stationary
    // thumb. The timer puts it back, with the transition on so it springs.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setSettling(true);
      setSheen(0);
      setStretch(0);
    }, SETTLE_MS);

    // Clamped to the first and last slot centres: the pill is a selection, and a
    // selection cannot sit off the end of the bar.
    const first = slots[0].center;
    const last = slots[slots.length - 1].center;
    setDragCenter(Math.min(Math.max(x - current.grabOffset, first), last));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const current = press.current;
    press.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setSettling(true);
    setSheen(0);
    setStretch(0);
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
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setSettling(true);
    setDragCenter(null);
    setSheen(0);
    setStretch(0);
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
  const dragging = dragCenter !== null;
  // Transform runs free only while the pill is tracking the finger. The moment
  // it is relaxing — finger lifted, or stopped mid-drag — the transition goes
  // back on so the stretch springs out instead of snapping.
  const eased = !dragging || settling;
  // Volume is roughly preserved: what it gains along its travel it gives up
  // across it, which is what stops the stretch reading as "it got bigger".
  const scaleX = 1 + stretch;
  const scaleY = 1 - stretch * 0.55;

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
        {/* One pill that moves, rather than five tints that take turns. It is
            built as glass: lit along the top edge, shaded along the bottom, and
            blooming its own colour onto the bar beneath it. No backdrop-filter
            of its own — the bar already carries one, and a nested backdrop
            filter is what makes translucent elements flicker on iOS Safari
            while they are being transformed, which is precisely when this one
            is being looked at. */}
        {pill ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[18px] ring-1 ring-inset ring-accent/45",
              // Under reduced motion the pill still moves — it has to, it is
              // the selection — but it neither stretches nor overshoots.
              "motion-reduce:!scale-100 motion-reduce:transition-none"
            )}
            style={{
              width: pill.width,
              // Origin at the centre: the pill grows from its middle in both
              // directions, the way a squashed drop does, rather than shooting
              // one edge out ahead of the other.
              transformOrigin: "center",
              transform: `translateX(${pillCenter - pill.width / 2}px) scale(${scaleX}, ${scaleY})`,
              // Free while tracking the finger; springs while relaxing.
              transition: eased ? `transform 380ms ${SPRING}, box-shadow 200ms ease-out` : "box-shadow 200ms ease-out",
              background:
                "linear-gradient(180deg, rgba(255,252,246,0.96) 0%, #F0E8D8 42%, #EADFC9 100%)",
              boxShadow: dragging
                ? // Lifted while held: the bloom deepens and spreads, so the
                  // pill reads as picked up off the bar. Light, not geometry —
                  // the lift costs no movement of its own.
                  "inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(160,127,66,0.20), 0 6px 18px rgba(201,169,110,0.42), 0 2px 6px rgba(120,95,52,0.16)"
                : "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(160,127,66,0.16), 0 2px 10px rgba(201,169,110,0.30), 0 1px 2px rgba(120,95,52,0.10)"
            }}
          >
            {/* The light band. Wide and very soft, so at rest it is only a
                gentle brightening down the middle rather than a stripe. */}
            <span
              className="absolute inset-y-0 left-1/2 w-[70%] -translate-x-1/2 motion-reduce:transition-none"
              style={{
                background:
                  "radial-gradient(60% 120% at 50% 0%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.28) 45%, rgba(255,255,255,0) 100%)",
                // Counter-scaled, so the light does not stretch with the glass —
                // a highlight that deforms with the object it sits on stops
                // reading as a reflection and starts reading as paint.
                transform: `translateX(calc(-50% + ${sheen}px)) scale(${1 / scaleX}, ${1 / scaleY})`,
                transition: eased ? `transform 380ms ${SPRING}` : "transform 90ms ease-out"
              }}
            />
          </span>
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
