/**
 * Surfaces, generated.
 *
 * The fastest way to make a room look computer-generated is to give it flat
 * colour. Real marble has veins, real plaster has tooth, real satin has a weave,
 * and every one of those shows up as a thousand tiny variations in how light
 * comes back off the surface. Without them the eye reads "render" instantly,
 * however good the lighting is.
 *
 * All of it is drawn into canvases at load time rather than downloaded. The site
 * self-hosts on a free Cloudflare tier and a set of 2K PBR maps would be tens of
 * megabytes; this is a few hundred kilobytes of arithmetic and it never touches
 * the network.
 *
 * Each surface gets up to three maps, because that is what a physical material
 * actually needs:
 *   - colour, the pigment;
 *   - roughness, which is what separates polished stone from honed stone and is
 *     usually more convincing than the colour;
 *   - normal, the fine geometry too small to model, which is what catches a
 *     moving highlight and sells the surface as physical.
 */

import type * as THREE from "three";

/* ------------------------------------------------------------------- noise */

/** Deterministic hash, so a room looks the same on every visit. */
function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Smoothed value noise. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  // Smoothstep the interpolant; linear interpolation leaves visible grid lines.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal noise: several octaves of detail, each finer and fainter. */
function fbm(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;

  for (let index = 0; index < octaves; index += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + index) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext("2d", { willReadFrequently: true })!];
}

/* ------------------------------------------------------------ normal maps */

/**
 * Derive a normal map from a height field, by Sobel.
 *
 * Cheaper and more controllable than authoring normals directly: every surface
 * below is described once as bumpiness, and its normal map falls out of that, so
 * the colour and the relief can never disagree about where the veins are.
 */
function normalFromHeight(
  three: typeof THREE,
  height: Float32Array,
  size: number,
  strength: number
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));

      // Normalise the gradient into a unit normal.
      const nx = dx * strength;
      const ny = dy * strength;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);

      const index = (y * size + x) * 4;
      data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      data[index + 2] = ((nz / length) * 0.5 + 0.5) * 255;
      data[index + 3] = 255;
    }
  }

  const texture = new three.DataTexture(data, size, size, three.RGBAFormat);
  texture.wrapS = three.RepeatWrapping;
  texture.wrapT = three.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function toTexture(
  three: typeof THREE,
  canvas: HTMLCanvasElement,
  srgb: boolean
): THREE.CanvasTexture {
  const texture = new three.CanvasTexture(canvas);
  texture.wrapS = three.RepeatWrapping;
  texture.wrapT = three.RepeatWrapping;
  texture.colorSpace = srgb ? three.SRGBColorSpace : three.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export type Surface = {
  map?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  dispose: () => void;
};

/* ------------------------------------------------------------------ marble */

/**
 * Dark polished marble, for the floor.
 *
 * The veins are made by warping a noise field and taking a thin band of it, the
 * usual trick — a vein is where the field crosses a threshold, so it comes out
 * as a continuous meandering line rather than as blobs. The roughness map is
 * where most of the realism lives: polished stone is not uniformly polished, and
 * the faint variation is what makes a reflection break up the way a real floor
 * does.
 */
export function marbleSurface(three: typeof THREE, size = 1024): Surface {
  const [colourCanvas, colour] = canvasOf(size);
  const [roughCanvas, rough] = canvasOf(size);
  const height = new Float32Array(size * size);

  const colourData = colour.createImageData(size, size);
  const roughData = rough.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * 5;
      const v = (y / size) * 5;

      // Warp the sampling position, then band it: this is what turns blobs into
      // veins that wander the way mineral seams do.
      const warp = fbm(u * 1.6, v * 1.6, 4, 11) * 2.2;
      const field = fbm(u + warp, v * 0.6 + warp, 5, 3);
      const vein = Math.abs(field - 0.5);
      const veinMask = Math.max(0, 1 - vein * 14);

      const grain = fbm(u * 26, v * 26, 3, 71);

      // Espresso ground with paler seams, matching the house palette.
      const base = 26 + grain * 12;
      const bright = 132;
      const level = base + veinMask * (bright - base);

      const index = (y * size + x) * 4;
      colourData.data[index] = level * 1.06;
      colourData.data[index + 1] = level * 0.98;
      colourData.data[index + 2] = level * 0.92;
      colourData.data[index + 3] = 255;

      // Veins sit slightly prouder and read a touch less polished than the
      // ground around them, which is true of real stone and is the detail that
      // makes a reflection ripple as you walk.
      const roughness = 0.06 + veinMask * 0.14 + grain * 0.05;
      const r = roughness * 255;
      roughData.data[index] = r;
      roughData.data[index + 1] = r;
      roughData.data[index + 2] = r;
      roughData.data[index + 3] = 255;

      height[y * size + x] = veinMask * 0.6 + grain * 0.4;
    }
  }

  colour.putImageData(colourData, 0, 0);
  rough.putImageData(roughData, 0, 0);

  const map = toTexture(three, colourCanvas, true);
  const roughnessMap = toTexture(three, roughCanvas, false);
  const normalMap = normalFromHeight(three, height, size, 0.18);

  return {
    map,
    roughnessMap,
    normalMap,
    dispose() {
      map.dispose();
      roughnessMap.dispose();
      normalMap.dispose();
    }
  };
}

/* ----------------------------------------------------------------- plaster */

/**
 * Fine plaster tooth, for the walls.
 *
 * Almost invisible on its own and completely transformative in aggregate: it
 * gives a large flat wall something for the grazing light from the coves to
 * catch, so the wall stops reading as a solid fill.
 */
export function plasterSurface(three: typeof THREE, size = 512): Surface {
  const height = new Float32Array(size * size);
  const [roughCanvas, rough] = canvasOf(size);
  const roughData = rough.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * 18;
      const v = (y / size) * 18;

      const tooth = fbm(u * 8, v * 8, 4, 23);
      const trowel = fbm(u * 0.7, v * 0.7, 3, 5);

      height[y * size + x] = tooth * 0.75 + trowel * 0.25;

      const roughness = 0.86 + tooth * 0.1;
      const index = (y * size + x) * 4;
      const r = roughness * 255;
      roughData.data[index] = r;
      roughData.data[index + 1] = r;
      roughData.data[index + 2] = r;
      roughData.data[index + 3] = 255;
    }
  }

  rough.putImageData(roughData, 0, 0);

  const roughnessMap = toTexture(three, roughCanvas, false);
  const normalMap = normalFromHeight(three, height, size, 0.055);

  return {
    roughnessMap,
    normalMap,
    dispose() {
      roughnessMap.dispose();
      normalMap.dispose();
    }
  };
}

/* -------------------------------------------------------------------- cloth */

/**
 * A woven surface, for the gowns.
 *
 * Fabric is threads crossing threads, and at the distance a visitor stops from a
 * plinth that weave is right at the edge of visible. Modelling it as a normal
 * map is what stops satin reading as painted plastic: the highlight travelling
 * over it breaks into thousands of tiny facets instead of sliding as one sheet.
 */
export function weaveSurface(
  three: typeof THREE,
  tight: boolean,
  size = 512
): Surface {
  const height = new Float32Array(size * size);
  const threads = tight ? 150 : 78;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * threads;
      const v = (y / size) * threads;

      // Over-under: the warp rides high where the weft rides low.
      const warp = Math.sin(u * Math.PI * 2);
      const weft = Math.sin(v * Math.PI * 2);
      const interlace = warp * weft;

      // Real thread is not perfectly regular; slubs keep it from looking printed.
      const slub = fbm((x / size) * 40, (y / size) * 40, 2, 17) * 0.3;

      height[y * size + x] = interlace * 0.5 + 0.5 + slub * 0.2;
    }
  }

  const normalMap = normalFromHeight(three, height, size, tight ? 0.05 : 0.09);
  normalMap.wrapS = three.RepeatWrapping;
  normalMap.wrapT = three.RepeatWrapping;

  return {
    normalMap,
    dispose() {
      normalMap.dispose();
    }
  };
}

/* --------------------------------------------------------------- brushed */

/** Brushed metal, for the brass. Fine directional grain, not a mirror. */
export function brassSurface(three: typeof THREE, size = 256): Surface {
  const height = new Float32Array(size * size);
  const [roughCanvas, rough] = canvasOf(size);
  const roughData = rough.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Stretched along one axis, which is what "brushed" means.
      const grain = fbm((x / size) * 220, (y / size) * 5, 3, 41);
      height[y * size + x] = grain;

      const roughness = 0.22 + grain * 0.24;
      const index = (y * size + x) * 4;
      const r = roughness * 255;
      roughData.data[index] = r;
      roughData.data[index + 1] = r;
      roughData.data[index + 2] = r;
      roughData.data[index + 3] = 255;
    }
  }

  rough.putImageData(roughData, 0, 0);

  const roughnessMap = toTexture(three, roughCanvas, false);
  const normalMap = normalFromHeight(three, height, size, 0.04);

  return {
    roughnessMap,
    normalMap,
    dispose() {
      roughnessMap.dispose();
      normalMap.dispose();
    }
  };
}
