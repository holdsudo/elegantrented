/**
 * Cloth geometry that is not a solid of revolution.
 *
 * The previous garments were lathes — a profile swept around an axis — and that
 * is the single reason they read as turned vases rather than as dresses. Three
 * things follow from a lathe and all three are fatal:
 *
 *   - The cross-section is a circle. No torso is circular. A body is an ellipse
 *     about seven parts wide to five deep, and getting that one ratio right
 *     does more for the read than any material work.
 *   - It is perfectly symmetric. Real cloth hangs unevenly, leans, and never
 *     matches itself across the middle.
 *   - Folds applied to it are a sine wave: the same depth, evenly spaced, all
 *     the way round. Real gathers are irregular, and they *converge* — many
 *     shallow folds at the hem merging into fewer deep ones at the waist,
 *     because that is where the fabric is being held.
 *
 * So the skirt is built as a proper grid here, and the folds are a field rather
 * than a wave. It costs more vertices and it is worth every one of them.
 */

import type * as THREE from "three";
import { bodiceTop, silhouetteProfile, type GarmentSpec } from "@/lib/garment";

/**
 * How deep a body is relative to how wide.
 *
 * The most important constant in this file. A circular cross-section is what
 * makes a swept garment look like it was turned on a lathe; roughly 0.72 is
 * what a human torso and a tailor's form actually measure.
 */
export const DEPTH_RATIO = 0.72;

/** A tiny seeded generator, so every gown falls the same way on every visit. */
function rng(seed: number) {
  let state = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/** Smooth periodic noise around the body, built from harmonics. */
type FoldField = {
  /** Displacement at angle theta, at height fraction h (0 hem, 1 shoulder). */
  at: (theta: number, h: number) => number;
};

/**
 * The fold field.
 *
 * Built as a stack of harmonics with random phases and uneven amplitudes, so no
 * two folds are the same depth and they do not sit at regular intervals. The
 * frequency is interpolated by height: high near the hem where the fabric has
 * spread out into many small gathers, low near the waist where it has been
 * pulled together into a few deep ones. That convergence is the thing the eye
 * reads as "gathered", and a fixed-frequency wave can never produce it.
 */
function foldField(spec: GarmentSpec): FoldField {
  const random = rng(spec.seed);

  // Frequencies must be whole numbers or the fold does not close on itself and
  // leaves a visible seam down one side of the skirt.
  const hemFolds = Math.max(6, Math.round(spec.folds));
  const waistFolds = Math.max(3, Math.round(spec.folds * 0.38));

  // Three harmonics per band, each with its own phase and weight.
  const harmonics = [1, 2, 3].map((multiple) => ({
    multiple,
    phase: random() * Math.PI * 2,
    weight: 1 / multiple + random() * 0.22
  }));

  // A slow irregular envelope so some quarters of the skirt carry deeper
  // gathers than others, the way a real skirt does when it has been dressed.
  const envelopePhase = random() * Math.PI * 2;

  return {
    at(theta, h) {
      // Fabric held at the waist and released toward the hem.
      const spread = 1 - h;
      const frequency = waistFolds + (hemFolds - waistFolds) * spread;

      let value = 0;
      let total = 0;
      for (const harmonic of harmonics) {
        // Rounding keeps every component periodic over a full turn.
        const f = Math.max(1, Math.round(frequency * harmonic.multiple));
        value += Math.sin(theta * f + harmonic.phase) * harmonic.weight;
        total += harmonic.weight;
      }
      value /= total;

      const envelope = 0.72 + 0.28 * Math.sin(theta * 2 + envelopePhase);

      // Remapped to add only: cloth gathers away from the body it hangs on, it
      // never passes through it.
      return (value * 0.5 + 0.5) * envelope;
    }
  };
}

export type ClothOptions = {
  /** Metres from hem to shoulder. */
  height: number;
  /** Metres at profile radius 1.0. */
  radius: number;
  /** Vertical divisions. More gives smoother folds down the drop. */
  rings?: number;
  /** Divisions around the body. */
  columns?: number;
};

/**
 * Build a skirt-and-bodice shell as a grid.
 *
 * Returned open at the top and closed at nothing — it is a shell, and the
 * material renders it double-sided, which is correct for cloth: you can see the
 * inside of a hem.
 */
export function buildClothGeometry(
  three: typeof THREE,
  spec: GarmentSpec,
  options: ClothOptions
): THREE.BufferGeometry {
  const rings = options.rings ?? 72;
  const columns = options.columns ?? 128;

  const profile = silhouetteProfile(spec);
  const curve = new three.CatmullRomCurve3(
    profile.map((point) => new three.Vector3(point.radius, point.height, 0)),
    false,
    "catmullrom",
    0.5
  );
  const sampled = curve.getPoints(rings - 1);

  const folds = foldField(spec);
  const random = rng(spec.seed + 0.37);

  // A gown on a stand is never perfectly plumb. A slight lean, and a hem that
  // is a little lower on one side, is most of what stops it reading as a
  // machined object.
  const swayAngle = random() * Math.PI * 2;
  const swayAmount = 0.014 + random() * 0.012;
  const hemPhase = random() * Math.PI * 2;

  const top = bodiceTop(spec);
  const depth = spec.fabric === "tulle" ? 0.02 : spec.fabric === "satin" ? 0.036 : 0.028;

  const positions: number[] = [];
  const uvs: number[] = [];

  for (let ring = 0; ring < rings; ring += 1) {
    const point = sampled[Math.min(ring, sampled.length - 1)];
    const h = Math.min(Math.max(point.y, 0), 1);
    const baseRadius = Math.max(point.x, 0.02) * options.radius;

    // Slack accumulates downward — a bodice is fitted and stays smooth.
    const heightFraction = Math.min(Math.max(h / Math.max(top, 0.01), 0), 1);
    const slack = (1 - heightFraction) ** 1.5;

    // The hem does not sit level; a full skirt undulates where it breaks.
    const hemDrop = ring === 0 ? 0 : 0;

    for (let column = 0; column <= columns; column += 1) {
      const theta = (column / columns) * Math.PI * 2;

      const fold = folds.at(theta, h) * depth * slack;
      const radius = baseRadius + fold;

      // Elliptical, not circular. This is the line that stops it being a vase.
      let x = Math.cos(theta) * radius;
      let z = Math.sin(theta) * radius * DEPTH_RATIO;

      // Lean, growing toward the hem where the weight is.
      const lean = swayAmount * (1 - heightFraction) ** 2;
      x += Math.cos(swayAngle) * lean;
      z += Math.sin(swayAngle) * lean;

      const y =
        h * options.height +
        hemDrop +
        // Hem undulation, only right at the bottom of the drop.
        (ring < 3 ? Math.sin(theta * 3 + hemPhase) * 0.012 * (1 - ring / 3) : 0);

      positions.push(x, y, z);
      uvs.push(column / columns, h);
    }
  }

  const indices: number[] = [];
  const stride = columns + 1;
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = ring * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new three.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A dress form with human proportions.
 *
 * Also elliptical, and cut with an actual waist, bust and shoulder rather than
 * the gentle bulge a lathe profile gives. It is only ever seen above the
 * neckline, but that is exactly the part a viewer reads as "a body" or "a
 * bottle", so it is worth the landmarks.
 */
export function buildFormGeometry(
  three: typeof THREE,
  scale: number,
  height: number
): THREE.BufferGeometry {
  // Landmarks up a real form: hip, waist, under-bust, bust, chest, shoulder,
  // and the cut where the neck begins.
  const landmarks: [number, number][] = [
    [0.2, 0.0],
    [0.205, 0.08],
    [0.183, 0.2],
    [0.163, 0.32],
    [0.178, 0.42],
    [0.203, 0.52],
    [0.196, 0.62],
    [0.166, 0.72],
    [0.118, 0.82],
    [0.086, 0.92],
    [0.078, 1.0]
  ];

  const curve = new three.CatmullRomCurve3(
    landmarks.map(([radius, y]) => new three.Vector3(radius * scale, y, 0)),
    false,
    "catmullrom",
    0.5
  );

  const rings = 56;
  const columns = 64;
  const sampled = curve.getPoints(rings - 1);

  const positions: number[] = [];
  const uvs: number[] = [];

  for (let ring = 0; ring < rings; ring += 1) {
    const point = sampled[Math.min(ring, sampled.length - 1)];
    for (let column = 0; column <= columns; column += 1) {
      const theta = (column / columns) * Math.PI * 2;
      // Slightly flatter front-to-back than the cloth, as a body is.
      positions.push(
        Math.cos(theta) * point.x,
        point.y * height,
        Math.sin(theta) * point.x * (DEPTH_RATIO - 0.04)
      );
      uvs.push(column / columns, point.y);
    }
  }

  const indices: number[] = [];
  const stride = columns + 1;
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = ring * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new three.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
