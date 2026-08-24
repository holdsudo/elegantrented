"use client";

/**
 * The collection, scrolled through in place.
 *
 * This was a modal you opened with a button. It is now simply part of the page:
 * you read the opening lines, keep scrolling, and the gowns come to you one at
 * a time before the page carries on to the filters at the bottom.
 *
 * The mechanism is a tall section with a sticky viewport inside it. Scrolling
 * moves through the section's height in the normal way — nothing is hijacked,
 * nothing is intercepted, the scrollbar means what it says, and a keyboard,
 * a trackpad, a mouse wheel and a screen reader all behave exactly as they
 * already did. The only thing the script does is read how far through the
 * section the page has got and light the matching plate.
 *
 * That matters more than it sounds: the earlier version listened for wheel
 * events and swallowed them, which is the kind of thing that feels clever for
 * one scroll and hostile for the next.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { garmentSpec } from "@/lib/garment";
import { GownSilhouette } from "@/components/gown-silhouette";
import type { CollectionGown } from "@/lib/collection";

type Props = {
  gowns: CollectionGown[];
  dateQuery: string;
};

export function CollectionReel({ gowns, dateQuery }: Props) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  /** How far through the current plate, 0..1, for the slow push. */
  const [within, setWithin] = useState(0);
  const [reduced, setReduced] = useState(false);

  const specs = useMemo(() => gowns.map((gown) => garmentSpec(gown)), [gowns]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (gowns.length === 0) return;
    let ticking = false;

    const measure = () => {
      ticking = false;
      const element = frame.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      // Distance scrolled into the section, over the distance available.
      const travelled = -rect.top;
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;

      const progress = Math.min(Math.max(travelled / total, 0), 1);
      const scaled = progress * gowns.length;
      const next = Math.min(Math.floor(scaled), gowns.length - 1);

      setIndex(next);
      setWithin(Math.min(Math.max(scaled - next, 0), 1));
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [gowns.length]);

  if (gowns.length === 0) return null;

  const current = gowns[index];

  return (
    <section
      className="reel"
      ref={frame}
      // One viewport of scroll per gown, plus one so the last plate can be
      // read before the page moves on to the collection.
      style={{ height: `${(gowns.length + 1) * 100}vh` }}
      aria-label="The collection"
    >
      <div className="reel-stage">
        {gowns.map((gown, position) => {
          const active = position === index;
          const spec = specs[position];

          return (
            <figure
              key={gown.id}
              className={active ? "reel-plate on" : "reel-plate"}
              aria-hidden={!active}
              style={
                gown.photoUrl
                  ? undefined
                  : {
                      // Not photographed yet: its own colourway becomes the
                      // ground, so the run still reads as one collection.
                      background: `radial-gradient(120% 90% at 50% 20%, ${spec.palette.highlight}, ${spec.palette.base} 55%, ${spec.palette.shadow})`
                    }
              }
            >
              {gown.photoUrl ? (
                <>
                  {/* A gown is shot portrait and a screen is usually landscape.
                      Cropping to fill cuts the dress out of its own picture, so
                      it is shown whole and the margins are filled with the same
                      photograph, blown up and blurred. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gown.photoUrl} alt="" aria-hidden="true" className="reel-bed" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gown.photoUrl}
                    alt={`${gown.description}${gown.color ? `, ${gown.color}` : ""}`}
                    className="reel-shot"
                    loading={position < 2 ? "eager" : "lazy"}
                    decoding="async"
                    style={
                      reduced || !active
                        ? undefined
                        : // Tied to scroll rather than to a clock, so the push
                          // is something the visitor is doing rather than
                          // something happening at them.
                          { transform: `scale(${(1 + within * 0.05).toFixed(4)})` }
                    }
                  />
                </>
              ) : (
                <GownSilhouette gown={gown} className="reel-drawn" />
              )}
            </figure>
          );
        })}

        <div className="reel-scrim" aria-hidden="true" />

        <div className="reel-caption" aria-live="polite">
          <span className="reel-no">No. {current.number}</span>
          <h2>{current.description}</h2>
          <p className="reel-detail">
            {[current.size ? `Size ${current.size}` : null, current.color]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="reel-price">
            {current.price}
            {current.availability !== "unknown" ? (
              <em className={current.availability}>
                {current.availability === "free" ? "Free that weekend" : "Spoken for"}
              </em>
            ) : null}
          </p>
          <Link className="reel-open" href={`/browse/${current.id}${dateQuery}`}>
            See this gown
          </Link>
        </div>

        <div className="reel-rail" aria-hidden="true">
          <span className="reel-count">
            {String(index + 1).padStart(2, "0")}
            <em>/{String(gowns.length).padStart(2, "0")}</em>
          </span>
          <ol>
            {gowns.map((gown, position) => (
              <li key={gown.id} className={position === index ? "on" : undefined} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
