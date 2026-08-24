"use client";

/**
 * The collection, full-bleed, one gown at a time.
 *
 * This replaces compositing gowns into a synthetic room, and the reason is
 * worth stating plainly because it was learned the hard way: cutting a
 * photograph out of its room throws away the thing that made it look real. The
 * light falling through that shop's windows, the floor it stands on, the shadow
 * it casts — all of it goes, and what is left gets pasted into a gallery lit
 * from somewhere else entirely. The mismatch is not in the edges, so no amount
 * of better keying fixes it. It is in the light.
 *
 * Left whole, the same photograph is already the thing the room was trying to
 * imitate: someone standing in a shop, looking at a gown. So the walkthrough is
 * made of real rooms instead of a fake one, and it gets better with every
 * photograph the shop takes rather than needing anything from this file.
 *
 * There is no WebGL here at all. It costs a few kilobytes, runs on any phone,
 * and cannot fail to get a context.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { garmentSpec } from "@/lib/garment";
import { GownSilhouette } from "@/components/gown-silhouette";
import type { ShowroomGown } from "./atelier";

type Props = {
  gowns: ShowroomGown[];
  dateQuery: string;
  onExit: () => void;
};

/** How much wheel travel counts as "next gown". */
const WHEEL_THRESHOLD = 90;
/** And how much of a swipe. */
const SWIPE_THRESHOLD = 60;

export default function Lookbook({ gowns, dateQuery, onExit }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  // Accumulated wheel travel. A trackpad emits a continuous stream of small
  // deltas, so advancing on every event would fly through the collection; this
  // gathers them until they add up to a deliberate gesture.
  const travel = useRef(0);
  const cooling = useRef(false);
  const touchStart = useRef<number | null>(null);

  const current = gowns[index];

  const go = useCallback(
    (direction: 1 | -1) => {
      setIndex((previous) => {
        const next = previous + direction;
        if (next < 0 || next >= gowns.length) return previous;
        return next;
      });
    },
    [gowns.length]
  );

  /* ------------------------------------------------------------- gestures */

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (cooling.current) return;

      travel.current += event.deltaY;
      if (Math.abs(travel.current) < WHEEL_THRESHOLD) return;

      go(travel.current > 0 ? 1 : -1);
      travel.current = 0;

      // A single flick of a trackpad keeps emitting for a while after the
      // fingers lift; without this it would carry on past several gowns.
      cooling.current = true;
      window.setTimeout(() => {
        cooling.current = false;
      }, 420);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
      if (event.key === "ArrowRight" || event.key === "ArrowDown") go(1);
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(-1);
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStart.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchStart.current === null) return;
      const delta = touchStart.current - (event.touches[0]?.clientY ?? 0);
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      go(delta > 0 ? 1 : -1);
      touchStart.current = null;
    };
    const onTouchEnd = () => {
      touchStart.current = null;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [go, onExit]);

  /* ----------------------------------------------------------- page state */

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const body = document.body.style.overflow;
    const root = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = body;
      document.documentElement.style.overflow = root;
    };
  }, []);

  // Fetch the neighbours so moving between gowns never shows a blank frame.
  useEffect(() => {
    for (const offset of [1, -1, 2]) {
      const gown = gowns[index + offset];
      if (!gown?.photoUrl) continue;
      const image = new Image();
      image.src = gown.photoUrl;
    }
  }, [index, gowns]);

  const specs = useMemo(() => gowns.map((gown) => garmentSpec(gown)), [gowns]);

  if (!current) return null;

  return createPortal(
    <div className="lookbook" role="dialog" aria-modal="true" aria-label="The collection">
      {/* Every gown is mounted; only the current one is shown. Cross-fading
          between two already-decoded images is instant, where mounting on
          demand shows a blank frame on every move. */}
      {gowns.map((gown, position) => {
        const active = position === index;
        const spec = specs[position];

        return (
          <figure
            key={gown.id}
            className={active ? "lb-plate on" : "lb-plate"}
            aria-hidden={!active}
            style={
              gown.photoUrl
                ? undefined
                : {
                    // No photograph yet: the gown's own colourway becomes the
                    // ground, so the collection still reads as a collection.
                    background: `radial-gradient(120% 90% at 50% 20%, ${spec.palette.highlight}, ${spec.palette.base} 55%, ${spec.palette.shadow})`
                  }
            }
          >
            {gown.photoUrl ? (
              <>
                {/* The bed: the same photograph, blown up, blurred and dimmed.
                    A gown is shot portrait and a screen is usually landscape,
                    so filling the frame by cropping cuts the dress out of its
                    own picture. Showing it whole leaves bars instead — unless
                    something fills them, and the most sympathetic thing to fill
                    them with is the picture itself. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gown.photoUrl} alt="" aria-hidden="true" className="lb-bed" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gown.photoUrl}
                  alt={`${gown.description}${gown.color ? `, ${gown.color}` : ""}`}
                  className={reduced ? "lb-shot" : "lb-shot drift"}
                  loading={position === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              </>
            ) : (
              <GownSilhouette gown={gown} className="lb-drawn" />
            )}
          </figure>
        );
      })}

      {/* The scrim. Photographs are shot for the gown, not for type to sit on,
          so legibility has to be built rather than hoped for. */}
      <div className="lb-scrim" aria-hidden="true" />

      <button type="button" className="lb-leave" onClick={onExit}>
        Close
      </button>

      <div className="lb-caption" aria-live="polite">
        <span className="lb-no">No. {current.number}</span>
        <h2>{current.description}</h2>
        <p className="lb-detail">
          {[current.size ? `Size ${current.size}` : null, current.color]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="lb-price">
          {current.price}
          {current.availability !== "unknown" ? (
            <em className={current.availability}>
              {current.availability === "free" ? "Free that weekend" : "Spoken for"}
            </em>
          ) : null}
        </p>
        <button
          type="button"
          className="lb-open"
          onClick={() => router.push(`/browse/${current.id}${dateQuery}`)}
        >
          See this gown
        </button>
      </div>

      <nav className="lb-rail" aria-label="Gowns">
        <span className="lb-count">
          {String(index + 1).padStart(2, "0")}
          <em>/{String(gowns.length).padStart(2, "0")}</em>
        </span>
        <ol>
          {gowns.map((gown, position) => (
            <li key={gown.id}>
              <button
                type="button"
                className={position === index ? "on" : undefined}
                aria-label={`Show ${gown.description}`}
                aria-current={position === index ? "true" : undefined}
                onClick={() => setIndex(position)}
              />
            </li>
          ))}
        </ol>
      </nav>

      {index === 0 ? (
        <div className="lb-invite" aria-hidden="true">
          <span className="lb-invite-line" />
          Scroll through the collection
        </div>
      ) : null}
    </div>,
    document.body
  );
}
