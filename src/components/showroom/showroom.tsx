"use client";

/**
 * The showroom, as a React component.
 *
 * This file owns the lifecycle — canvas, renderer, render loop, teardown — and
 * nothing about how the room looks; that is `atelier.ts`. Three.js is imported
 * dynamically inside the effect rather than at module scope, which is what keeps
 * it out of the server bundle and off the critical path of a page that must
 * still render instantly for someone who never opens the showroom.
 *
 * The room is an enhancement. Every gown in it is also a server-rendered link in
 * the catalogue underneath, so a crawler, a reader with JavaScript off, and a
 * visitor whose GPU refuses the context all still get the whole collection.
 *
 * On the chrome: there is deliberately no crosshair, no key hints and no
 * on-screen stick. See `tour.ts` — this is a walkthrough, and everything the
 * visitor sees on top of the room is a caption or a way to move between gowns,
 * not an instrument panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type * as THREE from "three";
import { garmentLabel } from "@/lib/garment";
import { buildAtelier, type Atelier, type ShowroomGown } from "./atelier";
import { createTour, type Station, type Tour } from "./tour";
import { createPost, type Post } from "./post";

type Props = {
  gowns: ShowroomGown[];
  /** Carried through to the gown page so the visitor keeps their date. */
  dateQuery: string;
  onExit: () => void;
  /** Told when the room cannot be built, so the page can fall back for good. */
  onUnsupported: () => void;
};

/** The gown the visitor has walked up to. */
type Focus = {
  index: number;
  id: string;
  number: string;
  description: string;
  detail: string;
  price: string;
  availability: ShowroomGown["availability"];
};

export default function Showroom({ gowns, dateQuery, onExit, onUnsupported }: Props) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const tourRef = useRef<Tour | null>(null);

  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [moved, setMoved] = useState(false);

  const focusRef = useRef<Focus | null>(null);
  focusRef.current = focus;

  const open = useCallback(
    (id: string) => {
      router.push(`/browse/${id}${dateQuery}`);
    },
    [router, dateQuery]
  );

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let atelier: Atelier | null = null;
    let tour: Tour | null = null;
    let post: Post | null = null;
    let onResize: (() => void) | null = null;
    let detachClick: (() => void) | null = null;

    const mount = mountRef.current;
    if (!mount) return;

    (async () => {
      const three = await import("three");
      if (disposed) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Quality is decided once, from what the device admits to. A phone gets no
      // shadow pass and a capped pixel ratio; the room is lit well enough by the
      // environment map that the difference is smaller than the frame rate gain.
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const cores = navigator.hardwareConcurrency ?? 4;
      const quality: "high" | "low" = coarse || cores <= 4 ? "low" : "high";

      try {
        renderer = new three.WebGLRenderer({
          antialias: quality === "high",
          powerPreference: "high-performance"
        });
      } catch {
        onUnsupported();
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = quality === "high";
      renderer.shadowMap.type = three.PCFSoftShadowMap;
      renderer.toneMapping = three.ACESFilmicToneMapping;
      // Pulled down deliberately. Bloom and ambient occlusion both add energy to
      // the image, and the ivory palette has very little headroom before the
      // walls clip to pure white and take the shadow detail with them.
      renderer.toneMappingExposure = 0.86;
      renderer.outputColorSpace = three.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      // About a 45mm lens. Games run wide — 70 to 90 degrees — because
      // peripheral vision matters when something might be behind you. Nothing
      // is behind you here, and wide angles bend verticals and stretch whatever
      // is near the edge of frame, which is exactly the look being avoided.
      // Interiors and fashion are both shot long.
      const camera = new three.PerspectiveCamera(
        44,
        window.innerWidth / window.innerHeight,
        0.1,
        140
      );

      atelier = buildAtelier(three, renderer, gowns, quality);

      // Where the visitor stands for each gown, and what they look at there.
      //
      // Two things are being balanced. The stop leans toward the gown's own side
      // of the aisle so the walk weaves between them rather than running straight
      // down the middle — and it stays short of the gown, about two and a half
      // metres back, so the whole garment is in frame with room around it.
      // Standing any closer puts the visitor's nose in the skirt: the gown fills
      // the screen, the silhouette is lost, and you cannot see the thing you
      // came to look at.
      const stations: Station[] = atelier.stands.map((stand) => ({
        stop: new three.Vector3(stand.position.x * 0.3, 0, stand.position.z + 1.9),
        regard: new three.Vector3(stand.position.x, 1.12, stand.position.z),
        object: stand.group
      }));

      tour = createTour(three, camera, renderer.domElement, atelier.entrance, stations, {
        reducedMotion
      });
      tourRef.current = tour;

      post = createPost(renderer, atelier.scene, camera, quality);

      /* ------------------------------------------------- click to walk */

      const raycaster = new three.Raycaster();
      const pointer = new three.Vector2();
      let downAt = { x: 0, y: 0 };

      const onPointerDown = (event: PointerEvent) => {
        downAt = { x: event.clientX, y: event.clientY };
      };

      const onClick = (event: MouseEvent) => {
        if (!atelier || !tour) return;
        // A drag that ended over a gown is a glance, not a choice.
        if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 6) return;

        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const hits = raycaster.intersectObjects(
          atelier.stands.map((stand) => stand.group),
          true
        );
        if (hits.length === 0) return;

        // Which stand did we hit? Walk up to the group we registered.
        let node: THREE.Object3D | null = hits[0].object;
        while (node && !stations.some((station) => station.object === node)) {
          node = node.parent;
        }
        if (!node) return;

        const index = stations.findIndex((station) => station.object === node);
        if (index < 0) return;

        // Clicking the gown you are already standing at opens it; clicking one
        // further down the aisle walks you there first. Nobody should have to
        // arrive before they are allowed to say "that one".
        if (focusRef.current?.index === index) {
          open(atelier.stands[index].gown.id);
        } else {
          tour.goTo(index);
        }
      };

      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("click", onClick);
      detachClick = () => {
        renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer?.domElement.removeEventListener("click", onClick);
      };

      onResize = () => {
        if (!renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        post?.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      setReady(true);

      /* ------------------------------------------------------- the loop */

      const clock = new three.Clock();

      let sampleStart = performance.now();
      let sampleFrames = 0;
      let degraded = false;

      let poll = 0;
      let lastIndex: number | null = null;
      let lastMoved = false;

      // Focus is pulled, never cut. A camera operator racks focus over about a
      // third of a second as the subject changes; snapping it between gowns
      // reads as a glitch rather than as a lens.
      const subject = new three.Vector3();
      let focusDistance = 3;

      const tick = () => {
        if (disposed || !renderer || !atelier || !tour) return;
        frame = requestAnimationFrame(tick);

        const delta = clock.getDelta();
        tour.update(delta);

        poll += delta;
        if (poll > 0.08) {
          poll = 0;

          const index = tour.focusIndex();
          if (index !== lastIndex) {
            lastIndex = index;
            if (index === null) {
              setFocus(null);
            } else {
              const stand = atelier.stands[index];
              setFocus({
                index,
                id: stand.gown.id,
                number: stand.gown.number,
                description: stand.gown.description,
                detail: [stand.gown.size ? `Size ${stand.gown.size}` : null, garmentLabel(stand.spec)]
                  .filter(Boolean)
                  .join(" · "),
                price: stand.gown.price,
                availability: stand.gown.availability
              });
            }
          }

          const hasMoved = tour.hasMoved();
          if (hasMoved !== lastMoved) {
            lastMoved = hasMoved;
            setMoved(hasMoved);
          }
        }

        // Whatever the visitor is regarding is what the lens is focused on; if
        // they are between gowns, focus rests down the aisle.
        const regarded = tour.focusIndex();
        const wanted =
          regarded === null
            ? 6.5
            : camera.position.distanceTo(subject.copy(stations[regarded].regard));
        focusDistance += (wanted - focusDistance) * Math.min(1, delta * 3.2);
        post?.setFocus(focusDistance);

        if (post) post.render();
        else renderer.render(atelier.scene, camera);

        sampleFrames += 1;
        const elapsed = performance.now() - sampleStart;
        if (elapsed >= 1000) {
          // A backgrounded tab stops receiving frames entirely, so a window that
          // spans a tab switch pairs a handful of frames with a minute of clock
          // and measures near-zero fps for a perfectly capable device. Such a
          // window is not a measurement of anything and is thrown away, not
          // acted on: only a window of roughly the intended length, with enough
          // frames in it to mean something, may condemn the hardware.
          const fps = (sampleFrames * 1000) / elapsed;
          const measured = elapsed < 3000 && sampleFrames >= 12;
          if (!degraded && measured && fps < 24) {
            degraded = true;
            renderer.setPixelRatio(1);
            renderer.shadowMap.enabled = false;
          }
          sampleFrames = 0;
          sampleStart = performance.now();
        }
      };

      frame = requestAnimationFrame(tick);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (onResize) window.removeEventListener("resize", onResize);
      detachClick?.();
      tour?.dispose();
      tourRef.current = null;
      post?.dispose();
      atelier?.dispose();
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
        // Without this the context lingers and the browser eventually refuses to
        // grant new ones — a real failure after a few open/close cycles.
        renderer.forceContextLoss();
      }
    };
  }, [gowns, onUnsupported, open]);

  // The page behind must not scroll while the visitor is in the room, and the
  // arrow keys should move between gowns the way the buttons do.
  useEffect(() => {
    // Both elements, not just body: which one actually scrolls depends on the
    // document, and locking the wrong one leaves the page free to scroll away
    // underneath the room.
    const previousBody = document.body.style.overflow;
    const previousRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
      if (event.key === "ArrowRight" || event.key === "ArrowDown") tourRef.current?.step(1);
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") tourRef.current?.step(-1);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousRoot;
      window.removeEventListener("keydown", onKey);
    };
  }, [onExit]);

  // Rendered into <body>, not where it sits in the tree.
  //
  // The door lives in `.hero-actions`, and `.hero` declares both
  // `isolation: isolate` and `overflow: hidden`. A fullscreen overlay left
  // inside it is clipped to the hero and its z-index is scoped to the hero's
  // stacking context, so the catalogue further down the page paints straight
  // over the top of the room. No z-index can win that argument from inside;
  // the overlay has to leave the subtree.
  return createPortal(
    <div
      className="showroom"
      role="dialog"
      aria-modal="true"
      aria-label="The atelier — a walkthrough of the collection"
    >
      <div className="showroom-canvas" ref={mountRef} />

      {!ready ? (
        <div className="showroom-loading">
          <span className="sr-mark" aria-hidden="true" />
          <p>Lighting the room…</p>
        </div>
      ) : null}

      {ready ? (
        <>
          <button type="button" className="sr-leave" onClick={onExit}>
            Leave the atelier
          </button>

          {/* The invitation to start walking, retired the moment they do. */}
          <div className={moved ? "sr-invite gone" : "sr-invite"} aria-hidden="true">
            <span className="sr-invite-line" />
            Scroll to walk through
          </div>

          {/* The caption for the gown you have stopped at. Editorial, not a
              heads-up display: a name, what it is, what it costs, and a way in. */}
          <div className={focus ? "sr-plate in" : "sr-plate"} aria-live="polite">
            {focus ? (
              <>
                <span className="sr-plate-no">No. {focus.number}</span>
                <strong>{focus.description}</strong>
                <span className="sr-plate-detail">{focus.detail}</span>
                <span className="sr-plate-price">
                  {focus.price}
                  {focus.availability !== "unknown" ? (
                    <em className={focus.availability}>
                      {focus.availability === "free" ? "Free that weekend" : "Spoken for"}
                    </em>
                  ) : null}
                </span>
                <button type="button" className="sr-plate-open" onClick={() => open(focus.id)}>
                  See this gown
                </button>
              </>
            ) : null}
          </div>

          {/* Where you are in the collection, and a way to step between gowns
              without walking the whole aisle. */}
          <nav className="sr-rail" aria-label="Gowns in the collection">
            <button
              type="button"
              className="sr-rail-step"
              onClick={() => tourRef.current?.step(-1)}
              aria-label="Previous gown"
            >
              ‹
            </button>
            <ol>
              {gowns.map((gown, index) => (
                <li key={gown.id}>
                  <button
                    type="button"
                    className={focus?.index === index ? "on" : undefined}
                    onClick={() => tourRef.current?.goTo(index)}
                    aria-label={`Walk to ${gown.description}`}
                    aria-current={focus?.index === index ? "true" : undefined}
                  />
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="sr-rail-step"
              onClick={() => tourRef.current?.step(1)}
              aria-label="Next gown"
            >
              ›
            </button>
          </nav>
        </>
      ) : null}
    </div>,
    document.body
  );
}
