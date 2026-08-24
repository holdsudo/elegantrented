"use client";

/**
 * One gown, on a turntable.
 *
 * The gown page's job is to let someone look properly at the thing they are
 * about to ask for. With no photograph, the honest options are a grey box with a
 * number in it or the garment itself — the same garment that stands in the
 * atelier, built from the same description, lit like a product shot instead of
 * like a room.
 *
 * This is the fallback, not the goal. The moment a gown has a real photograph
 * the page shows the photograph and this never mounts.
 */

import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { garmentSpec, type GarmentSpec } from "@/lib/garment";
import { buildGarment, type BuiltGarment } from "./garment3d";

type Props = {
  gown: { id: string; description: string; color: string | null };
  /** Shown while it loads, and left in place for good if WebGL is missing. */
  fallbackLabel: string;
};

/**
 * A soft-box studio, painted into an equirectangular canvas.
 *
 * Deliberately not the gallery's environment: a room full of pilasters and
 * coves reflected in a product shot is noise. This is what a photographer would
 * actually put around a gown — one big soft source above, a weaker fill
 * opposite, dark below so the silhouette stays readable.
 */
function studioEnvironment(three: typeof THREE, renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;

  const base = context.createLinearGradient(0, 0, 0, 128);
  base.addColorStop(0, "#FFFDF8");
  base.addColorStop(0.45, "#E9E0D2");
  base.addColorStop(0.75, "#6A6058");
  base.addColorStop(1, "#211D19");
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 128);

  // The key soft box, front-left and high.
  const key = context.createRadialGradient(70, 34, 2, 70, 34, 46);
  key.addColorStop(0, "rgba(255,252,244,1)");
  key.addColorStop(1, "rgba(255,252,244,0)");
  context.fillStyle = key;
  context.fillRect(24, 0, 92, 92);

  // A cooler, weaker fill opposite it, so the shadow side is not dead.
  const fill = context.createRadialGradient(190, 52, 2, 190, 52, 40);
  fill.addColorStop(0, "rgba(226,234,244,0.62)");
  fill.addColorStop(1, "rgba(226,234,244,0)");
  context.fillStyle = fill;
  context.fillRect(150, 12, 80, 80);

  const texture = new three.CanvasTexture(canvas);
  texture.mapping = three.EquirectangularReflectionMapping;
  texture.colorSpace = three.SRGBColorSpace;

  const pmrem = new three.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  texture.dispose();
  return target.texture;
}

/** The soft pool of shade a garment sits in, painted rather than cast. */
function groundShadow(three: typeof THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, "rgba(26,21,17,0.5)");
  gradient.addColorStop(0.55, "rgba(26,21,17,0.16)");
  gradient.addColorStop(1, "rgba(26,21,17,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

export default function GownViewer({ gown, fallbackLabel }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let built: BuiltGarment | null = null;
    let environment: THREE.Texture | null = null;
    let onResize: (() => void) | null = null;
    let detachPointer: (() => void) | null = null;
    const extra: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] } = {
      geometries: [],
      materials: [],
      textures: []
    };

    const mount = mountRef.current;
    if (!mount) return;

    (async () => {
      const three = await import("three");
      if (disposed) return;

      try {
        renderer = new three.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return; // the number stands
      }

      const size = () => ({
        width: mount.clientWidth || 600,
        height: mount.clientHeight || 800
      });

      const { width, height } = size();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = three.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = three.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "pan-y";

      const scene = new three.Scene();
      environment = studioEnvironment(three, renderer);
      scene.environment = environment;

      // Framed the way a lookbook plate is: the gown filling most of the height,
      // seen from just below its own shoulder so the skirt reads at full length
      // and the hem is not foreshortened into the floor.
      const camera = new three.PerspectiveCamera(34, width / height, 0.1, 40);
      camera.position.set(0, 0.98, 3.25);
      camera.lookAt(0, 0.8, 0);

      const spec: GarmentSpec = garmentSpec(gown);
      built = buildGarment(three, spec);
      scene.add(built.group);

      // A little real light on top of the environment, to give the folds an
      // edge the image-based lighting alone leaves soft.
      const key = new three.DirectionalLight(new three.Color("#FFF6EA"), 1.5);
      key.position.set(2.2, 3.4, 2.6);
      scene.add(key);
      scene.add(new three.HemisphereLight(new three.Color("#FFFAF0"), new three.Color("#2A231D"), 0.5));

      const shadowTexture = groundShadow(three);
      const shadowMaterial = new three.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false
      });
      const shadowGeometry = new three.PlaneGeometry(2.1, 2.1);
      extra.textures.push(shadowTexture);
      extra.materials.push(shadowMaterial);
      extra.geometries.push(shadowGeometry);

      const shade = new three.Mesh(shadowGeometry, shadowMaterial);
      shade.rotation.x = -Math.PI / 2;
      shade.position.y = 0.004;
      scene.add(shade);

      onResize = () => {
        if (!renderer) return;
        const next = size();
        camera.aspect = next.width / next.height;
        camera.updateProjectionMatrix();
        renderer.setSize(next.width, next.height);
      };
      window.addEventListener("resize", onResize);

      /* ------------------------------------------------------ turntable */

      let spin = 0.5;
      let velocity = 0;
      let dragging = false;
      let lastX = 0;
      let touched = false;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const down = (x: number) => {
        dragging = true;
        touched = true;
        lastX = x;
      };
      const move = (x: number) => {
        if (!dragging) return;
        velocity = (x - lastX) * 0.01;
        spin += velocity;
        lastX = x;
      };
      const up = () => {
        dragging = false;
      };

      const onPointerDown = (event: PointerEvent) => down(event.clientX);
      const onPointerMove = (event: PointerEvent) => move(event.clientX);

      const canvasElement = renderer.domElement;
      canvasElement.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);

      // These live on window, not on the canvas, so removing the canvas does not
      // take them with it — they have to be handed back explicitly or every
      // visit to a gown page leaves another pair behind.
      detachPointer = () => {
        canvasElement.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };

      setReady(true);

      const tick = () => {
        if (disposed || !renderer || !built) return;
        frame = requestAnimationFrame(tick);

        if (dragging) {
          // driven by the hand
        } else {
          // Coast to a stop, then resume the slow presentation turn — unless
          // the visitor has taken hold of it, in which case leave it where they
          // put it, or asked for less motion.
          velocity *= 0.94;
          spin += velocity;
          if (Math.abs(velocity) < 0.0005 && !touched && !reduced) spin += 0.0022;
        }

        built.group.rotation.y = spin;
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(tick);

    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (onResize) window.removeEventListener("resize", onResize);
      detachPointer?.();
      if (built) {
        for (const geometry of built.disposables.geometries) geometry.dispose();
        for (const material of built.disposables.materials) material.dispose();
      }
      for (const geometry of extra.geometries) geometry.dispose();
      for (const material of extra.materials) material.dispose();
      for (const texture of extra.textures) texture.dispose();
      environment?.dispose();
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
        renderer.forceContextLoss();
      }
    };
  }, [gown]);

  return (
    <div className="gown-viewer">
      <div className="gown-viewer-stage" ref={mountRef} />
      {!ready ? <span className="gown-viewer-number">{fallbackLabel}</span> : null}
      {ready ? <span className="gown-viewer-cue">Drag to turn</span> : null}
    </div>
  );
}
