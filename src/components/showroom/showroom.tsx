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
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as THREE from "three";
import { garmentLabel } from "@/lib/garment";
import {
  buildAtelier,
  PLINTH_COLLISION_RADIUS,
  REACH,
  type Atelier,
  type ShowroomGown
} from "./atelier";
import { createControls, type Controls } from "./controls";

type Props = {
  gowns: ShowroomGown[];
  /** Carried through to the gown page so the visitor keeps their date. */
  dateQuery: string;
  onExit: () => void;
  /** Told when the room cannot be built, so the page can fall back for good. */
  onUnsupported: () => void;
};

/** What the visitor is standing in front of, if anything. */
type Focus = {
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
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [stick, setStick] = useState<{ x: number; y: number } | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  // The focused gown is read by the click handler, which is created once. A ref
  // keeps it current without rebuilding the whole scene on every focus change.
  const focusRef = useRef<Focus | null>(null);
  focusRef.current = focus;

  const open = useCallback(() => {
    const current = focusRef.current;
    if (!current) return;
    router.push(`/browse/${current.id}${dateQuery}`);
  }, [router, dateQuery]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let atelier: Atelier | null = null;
    let controls: Controls | null = null;
    let onResize: (() => void) | null = null;

    const mount = mountRef.current;
    if (!mount) return;

    setIsTouch(window.matchMedia("(pointer: coarse)").matches);

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

      // A context can be created and still be a software rasteriser that will
      // not hold 30fps. There is no honest way to detect that up front, so the
      // frame-rate governor below handles it instead.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = quality === "high";
      renderer.shadowMap.type = three.PCFSoftShadowMap;
      renderer.toneMapping = three.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.outputColorSpace = three.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      const camera = new three.PerspectiveCamera(
        62,
        window.innerWidth / window.innerHeight,
        0.1,
        140
      );

      atelier = buildAtelier(three, renderer, gowns, quality);

      controls = createControls(three, camera, renderer.domElement, atelier.entrance, {
        bounds: atelier.bounds,
        obstacles: atelier.stands.map((stand) => ({
          x: stand.position.x,
          z: stand.position.z,
          radius: PLINTH_COLLISION_RADIUS
        })),
        reducedMotion
      });

      onResize = () => {
        if (!renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      setReady(true);

      /* ------------------------------------------------------- the loop */

      const clock = new three.Clock();
      const facing = new three.Vector3();
      const toStand = new three.Vector3();

      // Frame-rate governor: if the device cannot hold up, drop resolution once
      // rather than letting it grind. Measured over a second so a single slow
      // frame during load does not trigger it.
      let sampleStart = performance.now();
      let sampleFrames = 0;
      let degraded = false;

      let focusPoll = 0;
      let lastFocusId: string | null = null;

      const tick = () => {
        if (disposed || !renderer || !atelier || !controls) return;
        frame = requestAnimationFrame(tick);

        const delta = clock.getDelta();
        controls.update(delta);

        // What is the visitor standing in front of? Proximity and facing, not a
        // raycast — in a room you turn toward a gown to consider it, and the
        // cheaper test matches that behaviour more closely than a pixel-exact
        // crosshair would.
        focusPoll += delta;
        if (focusPoll > 0.1) {
          focusPoll = 0;
          camera.getWorldDirection(facing);

          let best: (typeof atelier.stands)[number] | null = null;
          let bestScore = 0;

          for (const stand of atelier.stands) {
            toStand.set(
              stand.position.x - camera.position.x,
              0,
              stand.position.z - camera.position.z
            );
            const distance = toStand.length();
            if (distance > REACH) continue;
            toStand.normalize();
            const alignment = toStand.dot(facing);
            if (alignment < 0.35) continue;
            const score = alignment * (1 - distance / REACH);
            if (score > bestScore) {
              bestScore = score;
              best = stand;
            }
          }

          const nextId = best?.gown.id ?? null;
          if (nextId !== lastFocusId) {
            lastFocusId = nextId;
            setFocus(
              best
                ? {
                    id: best.gown.id,
                    number: best.gown.number,
                    description: best.gown.description,
                    detail: [
                      best.gown.size ? `Size ${best.gown.size}` : null,
                      garmentLabel(best.spec)
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    price: best.gown.price,
                    availability: best.gown.availability
                  }
                : null
            );
          }

          setStick(controls.stick());
        }

        renderer.render(atelier.scene, camera);

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
      controls?.dispose();
      atelier?.dispose();
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
        // Without this the context lingers and the browser eventually refuses to
        // grant new ones — a real failure after a few open/close cycles.
        renderer.forceContextLoss();
      }
    };
  }, [gowns, onUnsupported]);

  // The page behind must not scroll while the visitor is walking, and Escape
  // should always get them out.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
      if (event.key === "Enter" && focusRef.current) open();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onExit, open]);

  return (
    <div className="showroom" role="dialog" aria-modal="true" aria-label="The atelier, in three dimensions">
      <div className="showroom-canvas" ref={mountRef} onClick={focus ? open : undefined} />

      {!ready ? (
        <div className="showroom-loading">
          <span className="sr-mark" aria-hidden="true" />
          <p>Lighting the room…</p>
        </div>
      ) : null}

      {ready ? (
        <>
          {/* The reticle. Small, and it only asserts itself when there is
              something to look at. */}
          <div className={focus ? "sr-reticle on" : "sr-reticle"} aria-hidden="true" />

          <button type="button" className="sr-exit" onClick={onExit}>
            Leave the atelier
            <kbd>Esc</kbd>
          </button>

          <div className="sr-hint" aria-hidden="true">
            {isTouch ? (
              <span>Left thumb to walk · drag to look</span>
            ) : (
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> to walk · drag to look
              </span>
            )}
          </div>

          {/* The thumb-stick, drawn only while a thumb is actually down. */}
          {stick ? (
            <div className="sr-stick" aria-hidden="true">
              <span
                className="sr-stick-knob"
                style={{ transform: `translate(${stick.x * 22}px, ${stick.y * 22}px)` }}
              />
            </div>
          ) : null}

          {/* The card for the gown in front of you. This is the whole point of
              the room, so it is the only element allowed to be loud. */}
          <div className={focus ? "sr-card in" : "sr-card"} aria-live="polite">
            {focus ? (
              <>
                <span className="sr-card-no">No. {focus.number}</span>
                <strong>{focus.description}</strong>
                <span className="sr-card-detail">{focus.detail}</span>
                <span className="sr-card-price">{focus.price}</span>
                {focus.availability !== "unknown" ? (
                  <span className={`sr-card-status ${focus.availability}`}>
                    {focus.availability === "free" ? "Free that weekend" : "Spoken for"}
                  </span>
                ) : null}
                <span className="sr-card-cue">
                  {isTouch ? "Tap to see it properly" : "Click to see it properly"}
                </span>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
