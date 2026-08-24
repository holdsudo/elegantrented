/**
 * A photographed gown, standing in the room.
 *
 * This is the path to the room actually looking real, and it is the reason the
 * generated garments were only ever described as a floor rather than a ceiling.
 * A dress is flat panels cut and sewn together — seams, darts, straps, cloth
 * colliding with itself under gravity — and no swept surface with a fold
 * formula painted on it reaches that. A photograph of the real gown does,
 * trivially, and it has the further advantage of showing the actual thing a
 * customer would be renting.
 *
 * The one thing standing between "phone photo against a wall" and "gown
 * standing in a boutique" is the wall. So it is removed here, automatically:
 *
 *   - The backdrop colour is estimated from the border of the frame, not
 *     assumed to be white. Shops photograph against whatever wall they have.
 *   - Removal is a flood fill inwards from the edges, NOT a colour threshold
 *     over the whole image. That distinction is the whole algorithm: an ivory
 *     gown against an ivory wall is the normal case here, and a global
 *     threshold would punch straight through the dress. Only backdrop that is
 *     actually connected to the edge of the frame is taken.
 *   - The resulting edge is feathered by a pixel or two, because a hard alpha
 *     cut reads as a sticker.
 *
 * If the key fails badly the caller still has the generated garment to fall
 * back on, and nothing is destroyed.
 */

import type * as THREE from "three";

export type Cutout = {
  texture: THREE.CanvasTexture;
  /** width / height of the photograph. */
  aspect: number;
  /** How much of the frame survived the key, 0..1. */
  coverage: number;
};

/** Squared distance in RGB, cheap and good enough for a backdrop test. */
function distance2(
  data: Uint8ClampedArray,
  index: number,
  r: number,
  g: number,
  b: number
): number {
  const dr = data[index] - r;
  const dg = data[index + 1] - g;
  const db = data[index + 2] - b;
  return dr * dr + dg * dg + db * db;
}

/** Hue in degrees, saturation and lightness, all 0..1 except hue. */
function hsl(data: Uint8ClampedArray, index: number): [number, number, number] {
  const r = data[index] / 255;
  const g = data[index + 1] / 255;
  const b = data[index + 2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;

  let hue = 0;
  if (chroma > 1e-6) {
    if (max === r) hue = ((g - b) / chroma + 6) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    hue *= 60;
  }

  const saturation = chroma < 1e-6 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1) + 1e-9);
  return [hue, saturation, lightness];
}

/** Shortest angle between two hues. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/** The largest connected run of true pixels, everything else discarded. */
function largestRegion(mask: Uint8Array, width: number, height: number): Uint8Array {
  const label = new Int32Array(width * height).fill(-1);
  let best = -1;
  let bestSize = 0;
  let next = 0;

  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = next;
    next += 1;
    const stack = [start];
    label[start] = id;
    let size = 0;

    while (stack.length > 0) {
      const pixel = stack.pop()!;
      size += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
      const visit = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighbour = ny * width + nx;
        if (!mask[neighbour] || label[neighbour] >= 0) return;
        label[neighbour] = id;
        stack.push(neighbour);
      };
      visit(x + 1, y);
      visit(x - 1, y);
      visit(x, y + 1);
      visit(x, y - 1);
    }

    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }

  const out = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    out[pixel] = label[pixel] === best ? 1 : 0;
  }
  return out;
}


/**
 * Shrink a mask by `radius`, then grow it back — a morphological opening.
 *
 * This is what severs the gown from the room. Keying by hue leaves the wood
 * floor attached under the hem, because a warm floor lit by the same lamp
 * shares enough of the gown's hue at the boundary to bridge across; and once
 * the floor is attached, anything the floor touches comes too. The bridges are
 * only a few pixels wide, so eroding breaks them, the largest surviving region
 * is the gown alone, and dilating restores its true outline.
 *
 * Growing back is clamped to the original mask so the outline can never end up
 * larger than what was actually keyed.
 */
function openMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const erode = (source: Uint8Array) => {
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (!source[pixel]) continue;
        // A pixel survives only if all four neighbours are also set, so an
        // isthmus one pixel wide disappears on the first pass.
        const kept =
          x > 0 && source[pixel - 1] &&
          x < width - 1 && source[pixel + 1] &&
          y > 0 && source[pixel - width] &&
          y < height - 1 && source[pixel + width];
        out[pixel] = kept ? 1 : 0;
      }
    }
    return out;
  };

  const dilate = (source: Uint8Array, within: Uint8Array) => {
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (source[pixel]) {
          out[pixel] = 1;
          continue;
        }
        if (!within[pixel]) continue;
        const touching =
          (x > 0 && source[pixel - 1]) ||
          (x < width - 1 && source[pixel + 1]) ||
          (y > 0 && source[pixel - width]) ||
          (y < height - 1 && source[pixel + width]);
        out[pixel] = touching ? 1 : 0;
      }
    }
    return out;
  };

  let shrunk = mask;
  for (let step = 0; step < radius; step += 1) shrunk = erode(shrunk);

  let core = largestRegion(shrunk, width, height);
  for (let step = 0; step < radius; step += 1) core = dilate(core, mask);
  return core;
}

/**
 * Read the gown's own colour, from the middle of the frame.
 *
 * Hue is a circular quantity and averaging it as a number is meaningless — the
 * mean of 350 degrees and 10 degrees is 180, which is the exact opposite of the
 * right answer. So the samples are averaged as vectors on the colour wheel.
 */
function subjectColour(data: Uint8ClampedArray, width: number, height: number) {
  let x = 0;
  let y = 0;
  let saturation = 0;
  let lightness = 0;
  let count = 0;

  // Down the centre column, where a gown on a stand always is.
  for (const at of [0.45, 0.58, 0.7, 0.82]) {
    const cy = Math.round(height * at);
    const cx = Math.round(width * 0.5);
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        const index = ((cy + dy) * width + (cx + dx)) * 4;
        const [hue, s, l] = hsl(data, index);
        if (s <= 0.08) continue;
        const radians = (hue * Math.PI) / 180;
        x += Math.cos(radians);
        y += Math.sin(radians);
        saturation += s;
        lightness += l;
        count += 1;
      }
    }
  }

  if (count === 0) return null;
  return {
    hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    saturation: saturation / count,
    lightness: lightness / count
  };
}


/**
 * Cut the gown out of its surroundings.
 *
 * Two strategies, chosen from the photograph itself, because the two situations
 * are genuinely different problems:
 *
 *   - A gown with a clear colour is keyed by HUE. This is what makes a busy
 *     background survivable: a pink gown standing on a wood floor is only about
 *     47 apart in RGB, which no colour-distance test can separate, but they are
 *     313 degrees apart in hue and trivially separable. The gown is grown from
 *     its own colour rather than the room being eaten away.
 *   - A gown with almost no colour — ivory, white, champagne — has no hue to
 *     key on, and for those the backdrop is flood-filled inward from the edges
 *     of the frame instead. That only works against a plain wall, which is
 *     exactly the case those gowns have to be shot in anyway.
 *
 * Either way it refuses work it cannot do, and the caller keeps its fallback.
 */
export async function loadCutout(
  three: typeof THREE,
  url: string,
  tolerance = 46
): Promise<Cutout | null> {
  const image = new Image();
  // Same-origin (/api/public/photos/…), so the canvas is never tainted and the
  // pixels can actually be read back.
  image.crossOrigin = "anonymous";
  image.src = url;

  try {
    await image.decode();
  } catch {
    return null;
  }

  const scale = Math.min(1, 1100 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(2, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  const data = frame.data;

  const subject = subjectColour(data, width, height);
  /** 1 where the gown is. */
  let keep: Uint8Array;

  if (subject && subject.saturation > 0.16) {
    /* ------------------------------------------------- keyed by hue ----- */

    const mask = new Uint8Array(width * height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const [hue, saturation, lightness] = hsl(data, pixel * 4);
      // Same hue family, colourful enough to mean it, and not so much darker
      // than the gown that it is obviously something in shadow behind it.
      mask[pixel] =
        saturation > 0.1 &&
        hueGap(hue, subject.hue) < 46 &&
        lightness > subject.lightness * 0.45
          ? 1
          : 0;
    }

    // Open before choosing the region: the floor is joined to the hem by a
    // few pixels of shared warm hue, and without breaking that bridge the
    // "largest region" is the gown AND the room it is standing in.
    keep = openMask(mask, width, height, 3);

    // Recover the pale highlights on tulle and satin, which lose their hue
    // where they blow out. Strictly bright AND desaturated: a wood floor is
    // also bright, but it is not desaturated, and letting it in drags the
    // whole room along with it.
    for (let pass = 0; pass < 4; pass += 1) {
      const add: number[] = [];
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        if (keep[pixel]) continue;
        const x = pixel % width;
        const y = (pixel - x) / width;
        const touching =
          (x > 0 && keep[pixel - 1]) ||
          (x < width - 1 && keep[pixel + 1]) ||
          (y > 0 && keep[pixel - width]) ||
          (y < height - 1 && keep[pixel + width]);
        if (!touching) continue;

        const [hue, saturation, lightness] = hsl(data, pixel * 4);
        // Bright AND either genuinely colourless or still the gown's own hue.
        // A wood floor is bright and warm, and a looser test here is precisely
        // what let it back in after the opening had removed it.
        if (lightness > 0.72 && (saturation < 0.13 || hueGap(hue, subject.hue) < 22)) {
          add.push(pixel);
        }
      }
      for (const pixel of add) keep[pixel] = 1;
    }

    keep = openMask(keep, width, height, 2);
  } else {
    /* ------------------------------------ keyed by flooding the backdrop */

    const background = new Uint8Array(width * height);
    const limit = tolerance * tolerance;

    // In passes, because a gown photographed in a room has at least two
    // backdrops — the wall behind it and the floor under it.
    for (let pass = 0; pass < 4; pass += 1) {
      const reds: number[] = [];
      const greens: number[] = [];
      const blues: number[] = [];
      const step = Math.max(1, Math.floor(width / 64));

      const sample = (x: number, y: number) => {
        const pixel = y * width + x;
        if (background[pixel]) return;
        const index = pixel * 4;
        reds.push(data[index]);
        greens.push(data[index + 1]);
        blues.push(data[index + 2]);
      };
      for (let x = 0; x < width; x += step) {
        sample(x, 0);
        sample(x, height - 1);
      }
      for (let y = 0; y < height; y += step) {
        sample(0, y);
        sample(width - 1, y);
      }
      if (reds.length === 0) break;

      const median = (values: number[]) => {
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
      };
      const backdrop = { r: median(reds), g: median(greens), b: median(blues) };

      const queue: number[] = [];
      const consider = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const pixel = y * width + x;
        if (background[pixel]) return;
        if (distance2(data, pixel * 4, backdrop.r, backdrop.g, backdrop.b) > limit) return;
        background[pixel] = 1;
        queue.push(pixel);
      };
      for (let x = 0; x < width; x += 1) {
        consider(x, 0);
        consider(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        consider(0, y);
        consider(width - 1, y);
      }

      let taken = 0;
      while (queue.length > 0) {
        const pixel = queue.pop()!;
        taken += 1;
        const x = pixel % width;
        const y = (pixel - x) / width;
        consider(x + 1, y);
        consider(x - 1, y);
        consider(x, y + 1);
        consider(x, y - 1);
      }
      if (taken < width * height * 0.004) break;
    }

    const foreground = new Uint8Array(width * height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      foreground[pixel] = background[pixel] ? 0 : 1;
    }
    keep = openMask(foreground, width, height, 2);
  }

  /* ------------------------------------------------- alpha, edge, crop */

  let kept = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (keep[pixel]) {
        kept += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        continue;
      }

      // Feather: a discarded pixel touching a kept one holds partial alpha, so
      // the silhouette does not read as cut with scissors.
      const touching =
        (x > 0 && keep[pixel - 1]) ||
        (x < width - 1 && keep[pixel + 1]) ||
        (y > 0 && keep[pixel - width]) ||
        (y < height - 1 && keep[pixel + width]);
      data[pixel * 4 + 3] = touching ? 110 : 0;
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  context.putImageData(frame, 0, 0);

  // Crop to the gown, not to the photograph. Otherwise framing sets scale, and
  // a gown shot with a metre of wall above it stands a metre shorter than one
  // shot tight.
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropped = document.createElement("canvas");
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return null;
  croppedContext.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  const texture = new three.CanvasTexture(cropped);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return {
    texture,
    aspect: cropWidth / cropHeight,
    coverage: kept / (width * height)
  };
}

export type PhotoGown = {
  group: THREE.Group;
  dispose: () => void;
};

/**
 * Stand a cut-out photograph on the plinth.
 *
 * A retail standee, not a framed print: the panel is the gown's own silhouette,
 * lit by the room. It is given a little emissive of its own so the photograph
 * keeps its exposure instead of being multiplied down into the gloom by a
 * gallery that is deliberately dim, and a painted contact shadow so it is
 * standing on the plinth rather than hovering over it.
 */
export function buildPhotoGown(
  three: typeof THREE,
  cutout: Cutout,
  height: number
): PhotoGown {
  const group = new three.Group();

  const width = height * cutout.aspect;
  const geometry = new three.PlaneGeometry(width, height);

  const material = new three.MeshStandardMaterial({
    map: cutout.texture,
    transparent: true,
    // Kills the faint halo the feather would otherwise leave, while keeping the
    // partially-transparent rim that stops the edge looking cut with scissors.
    alphaTest: 0.35,
    roughness: 0.86,
    metalness: 0,
    side: three.DoubleSide,
    emissiveMap: cutout.texture,
    emissive: new three.Color(0xffffff),
    emissiveIntensity: 0.34
  });

  const panel = new three.Mesh(geometry, material);
  panel.position.y = height / 2;
  panel.castShadow = true;
  group.add(panel);

  // The shade it stands in.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext("2d")!;
  const gradient = shadowContext.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, "rgba(12,9,7,0.55)");
  gradient.addColorStop(1, "rgba(12,9,7,0)");
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 64, 64);

  const shadowTexture = new three.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = three.SRGBColorSpace;
  const shadowMaterial = new three.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false
  });
  const shadowGeometry = new three.PlaneGeometry(width * 0.9, width * 0.5);
  const shade = new three.Mesh(shadowGeometry, shadowMaterial);
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.004;
  group.add(shade);

  return {
    group,
    dispose() {
      geometry.dispose();
      material.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      cutout.texture.dispose();
    }
  };
}
