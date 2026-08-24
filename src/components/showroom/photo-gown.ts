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

/**
 * Estimate the backdrop from the border of the frame.
 *
 * The median of the border rather than the mean: a mean is dragged around by
 * the gown wherever it touches an edge, and a shop will hang a hem out of
 * frame at the bottom more often than not.
 */
function borderColour(
  data: Uint8ClampedArray,
  seen: Uint8Array,
  width: number,
  height: number
) {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];

  const sample = (x: number, y: number) => {
    const pixel = y * width + x;
    // Already keyed on an earlier pass — it is not what is left on the border.
    if (seen[pixel]) return;
    const index = pixel * 4;
    reds.push(data[index]);
    greens.push(data[index + 1]);
    blues.push(data[index + 2]);
  };

  const step = Math.max(1, Math.floor(width / 64));
  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }

  if (reds.length === 0) return null;

  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };

  return { r: median(reds), g: median(greens), b: median(blues) };
}

/**
 * Cut the gown out of its backdrop.
 *
 * Tolerance is generous because a plain wall is never one flat colour — it has
 * a gradient across it from whatever light is in the room — but the flood fill
 * keeps that generosity safe, since it can only ever eat backdrop that reaches
 * the edge of the frame.
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

  // Working resolution. Big enough to stand two metres from, small enough that
  // the flood fill is instant.
  const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
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

  // Key the backdrop in passes.
  //
  // One pass is not enough, because a photograph of a gown standing in a room
  // has at least two backdrops: the wall behind it and the floor under it, and
  // usually a skirting board between them. A single colour key takes the wall
  // and leaves a band of floor hanging off the bottom of the cut-out.
  //
  // So the estimate is re-run against whatever is still attached to the edge of
  // the frame after the previous pass, and keyed again — wall, then floor, then
  // whatever else reaches a border. It stops when a pass stops finding
  // anything, and it stays safe for the same reason a single pass was safe:
  // only regions actually connected to the edge are ever taken.
  const seen = new Uint8Array(width * height);
  const limit = tolerance * tolerance;

  for (let pass = 0; pass < 3; pass += 1) {
    const backdrop = borderColour(data, seen, width, height);
    if (!backdrop) break;

    const queue: number[] = [];
    const consider = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const pixel = y * width + x;
      if (seen[pixel]) return;
      if (distance2(data, pixel * 4, backdrop.r, backdrop.g, backdrop.b) > limit) return;
      seen[pixel] = 1;
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

    // Nothing left attached to the border worth taking.
    if (taken < width * height * 0.004) break;
  }

  // Feather: a pixel keeps partial alpha if it borders kept pixels, so the
  // silhouette does not read as a sticker cut with scissors.
  let kept = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!seen[pixel]) {
        kept += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        continue;
      }

      let neighbours = 0;
      if (x > 0 && !seen[pixel - 1]) neighbours += 1;
      if (x < width - 1 && !seen[pixel + 1]) neighbours += 1;
      if (y > 0 && !seen[pixel - width]) neighbours += 1;
      if (y < height - 1 && !seen[pixel + width]) neighbours += 1;

      data[pixel * 4 + 3] = neighbours > 0 ? 110 : 0;
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  context.putImageData(frame, 0, 0);

  // Crop to what survived.
  //
  // The panel that goes on the plinth is sized from this, so it has to be the
  // bounding box of the GOWN and not of the photograph. Otherwise the framing
  // sets the scale: a gown shot with a metre of wall above it stands a metre
  // shorter than one shot tight, and the room's gowns end up at unrelated
  // sizes for reasons that have nothing to do with the dresses.
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
