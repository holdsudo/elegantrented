/**
 * Cloth geometry, from simulation rather than description.
 *
 * Two things were wrong with every earlier version and both are fixed here.
 *
 * The first was that the garments were lathes — a profile swept around an axis.
 * A lathe is a vase: circular in section, mirror-symmetric, and no torso is
 * either. A body is an ellipse about seven parts wide to five deep, and that one
 * ratio does more for the read than any material work.
 *
 * The second, and the bigger one, was that the folds came from a formula. A
 * formula gives you the folds you asked for, evenly, forever. Cloth does not
 * fold because someone specified folds; it folds because it has more material
 * than it needs and gravity has to put the surplus somewhere. So the fullness is
 * declared here — how much more fabric than the silhouette strictly needs — and
 * `simulate.ts` is left to find out where it goes.
 *
 * That is the whole difference between fabric and a moulded shell.
 */

import type * as THREE from "three";
import { necklineAt, silhouetteProfile, type GarmentSpec } from "@/lib/garment";
import { drape } from "./simulate";

/**
 * How deep a body is relative to how wide.
 *
 * The most important constant in this file. A circular cross-section is what
 * makes a garment look turned on a lathe; roughly 0.72 is what a human torso
 * and a tailor's form actually measure.
 */
export const DEPTH_RATIO = 0.72;

/** A tiny seeded generator, so every gown drapes the same way on every visit. */
function rng(seed: number) {
  let state = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/**
 * The landmarks of a dress form, as radius against height 0..1.
 *
 * Hip, waist, under-bust, bust, chest, shoulder, and the cut where the neck
 * begins. Shared by the form's own geometry and by the solver's collision test,
 * so cloth can never end up inside the body it is hanging on.
 */
const FORM_LANDMARKS: [number, number][] = [
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

/** Linear lookup down the landmarks. */
function formRadius(fraction: number): number {
  if (fraction <= 0) return FORM_LANDMARKS[0][0];
  if (fraction >= 1) return FORM_LANDMARKS[FORM_LANDMARKS.length - 1][0];

  for (let index = 0; index < FORM_LANDMARKS.length - 1; index += 1) {
    const [r0, h0] = FORM_LANDMARKS[index];
    const [r1, h1] = FORM_LANDMARKS[index + 1];
    if (fraction >= h0 && fraction <= h1) {
      const t = (fraction - h0) / Math.max(h1 - h0, 1e-6);
      return r0 + (r1 - r0) * t;
    }
  }
  return FORM_LANDMARKS[FORM_LANDMARKS.length - 1][0];
}

/**
 * How much more fabric than the silhouette needs, at the hem.
 *
 * This is the single number that decides whether a skirt reads as fabric or as
 * a moulded shell, and it is a real quantity a cutter works in: a circle skirt
 * carries far more cloth than its hem circumference strictly requires, a
 * column carries almost none. Everything the solver produces follows from it.
 */
function hemFullness(spec: GarmentSpec): number {
  const bySilhouette: Record<GarmentSpec["silhouette"], number> = {
    ballgown: 1.55,
    aline: 1.3,
    empire: 1.28,
    mermaid: 1.18,
    column: 1.08,
    sheath: 1.05
  };

  const byFabric: Record<GarmentSpec["fabric"], number> = {
    tulle: 1.16,
    chiffon: 1.12,
    lace: 1.04,
    silk: 1.02,
    satin: 1.0,
    beaded: 0.97,
    velvet: 0.94
  };

  return 1 + (bySilhouette[spec.silhouette] - 1) * byFabric[spec.fabric];
}

export type ClothOptions = {
  /** Metres from hem to shoulder. */
  height: number;
  /** Metres at profile radius 1.0. */
  radius: number;
  /** Vertical divisions. */
  rings?: number;
  /** Divisions around the body. */
  columns?: number;
  /** Extra fullness on top of the fabric's own, for overlay layers. */
  fullnessScale?: number;
};

/**
 * Build a draped garment and hand back the settled mesh.
 *
 * Open at the top and closed at nothing — it is a shell, and the material
 * renders it double-sided, which is correct for cloth: you can see the inside
 * of a hem.
 */
export function buildClothGeometry(
  three: typeof THREE,
  spec: GarmentSpec,
  options: ClothOptions
): THREE.BufferGeometry {
  const rings = options.rings ?? 56;
  const columns = options.columns ?? 96;

  // Resample the silhouette landmarks into a smooth profile. Straight lines
  // between landmarks read as a stack of cones.
  const profile = silhouetteProfile(spec);
  const curve = new three.CatmullRomCurve3(
    profile.map((point) => new three.Vector3(point.radius, point.height, 0)),
    false,
    "catmullrom",
    0.5
  );
  const sampled = curve.getPoints(rings - 1);

  const at = (ring: number) => sampled[Math.min(Math.max(ring, 0), sampled.length - 1)];

  /** Silhouette radius at a height fraction, by linear scan of the samples. */
  const silhouetteRadiusAt = (h: number) => {
    for (let index = 0; index < sampled.length - 1; index += 1) {
      const a = sampled[index];
      const b = sampled[index + 1];
      if (h >= a.y && h <= b.y) {
        const t = (h - a.y) / Math.max(b.y - a.y, 1e-6);
        return a.x + (b.x - a.x) * t;
      }
    }
    return h <= sampled[0].y ? sampled[0].x : sampled[sampled.length - 1].x;
  };

  const fullness = hemFullness(spec) * (options.fullnessScale ?? 1);

  const settled = drape({
    rings,
    columns,
    heightAt: (ring) => Math.min(Math.max(at(ring).y, 0), 1) * options.height,
    radiusAt: (ring) => Math.max(at(ring).x, 0.02) * options.radius,
    // Full at the hem, easing to nothing at the waist: a well-cut gown is
    // smooth where it is held and carries its surplus lower down. A skirt
    // gathered evenly all the way up is a dirndl, not a gown.
    fullnessAt: (ring) => {
      const h = Math.min(Math.max(at(ring).y, 0), 1);
      // Clamp BEFORE the exponent, not after. Above the waist the base goes
      // negative, and a negative number to a fractional power is NaN in
      // JavaScript — which then propagates into every rest length and quietly
      // deletes the entire garment.
      const towardHem = Math.max(0, 1 - h / 0.74);
      return 1 + (fullness - 1) * Math.min(1, towardHem ** 1.3);
    },
    depthRatio: DEPTH_RATIO,

    // The understructure, and it is the reason the gown has a shape at all.
    //
    // Cloth hung on a bare form falls straight down — correct physics, wrong
    // dress. A real ballgown is held out by a petticoat, a mermaid by its own
    // cut and lining. So the silhouette itself is the floor the fabric cannot
    // fall inside: it drapes over that shape and puts its surplus into folds
    // outside it, which is exactly what happens over a real underskirt.
    formRadiusAt: (height) => {
      const h = Math.min(Math.max(height / options.height, 0), 1);
      const understructure = silhouetteRadiusAt(h) * options.radius * 0.97;

      // Above the waist the body is wider than any lining, so the torso wins.
      const fraction = (height - options.height * 0.5) / (options.height * 0.55);
      const body = fraction < 0 ? 0 : formRadius(Math.min(fraction, 1)) * 0.7;

      return Math.max(understructure, body);
    },

    // The bodice is seamed to shape and does not drape; only the skirt is free.
    isPinned: (ring) => at(ring).y >= 0.74,

    // Cut a real neckline instead of ending in a flat band, which is what made
    // every gown in the collection strapless regardless of its description.
    necklineAt: (theta) => necklineAt(spec, theta),
    radiusAtHeight: (h) => silhouetteRadiusAt(h) * options.radius,
    height: options.height,

    random: rng(spec.seed),
    iterations: 8
  });

  const positions = new Float32Array(rings * (columns + 1) * 3);
  const uvs = new Float32Array(rings * (columns + 1) * 2);

  // Re-emit with a duplicated seam column so the texture wraps without a join.
  for (let ring = 0; ring < rings; ring += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const source = (ring * columns + (column % columns)) * 3;
      const target = (ring * (columns + 1) + column) * 3;
      positions[target] = settled[source];
      positions[target + 1] = settled[source + 1];
      positions[target + 2] = settled[source + 2];

      const uv = (ring * (columns + 1) + column) * 2;
      uvs[uv] = column / columns;
      uvs[uv + 1] = ring / (rings - 1);
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
  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new three.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A dress form with human proportions.
 *
 * Elliptical, and cut with an actual waist, bust and shoulder rather than the
 * gentle bulge a lathe profile gives. It is only ever seen above the neckline,
 * but that is exactly the part a viewer reads as "a body" or "a bottle".
 */
export function buildFormGeometry(
  three: typeof THREE,
  scale: number,
  height: number
): THREE.BufferGeometry {
  const curve = new three.CatmullRomCurve3(
    FORM_LANDMARKS.map(([radius, y]) => new three.Vector3(radius * scale, y, 0)),
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
