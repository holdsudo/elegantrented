/**
 * A gown, drawn flat.
 *
 * The third and simplest rendering of the same garment grammar. The atelier
 * sweeps the silhouette into cloth and the gown page turns it on a stand; this
 * draws the same outline as an SVG, on the server, with no JavaScript and no
 * WebGL — which is what a catalogue card and a back-office thumbnail actually
 * need. A grid of forty gowns cannot afford forty WebGL contexts, and the shop
 * scrolling its own stock on a phone should not be waiting for a renderer.
 *
 * The point is that all three agree. One description, one silhouette, whether
 * you are walking the room, looking at the gown, or scanning the list.
 */

import {
  bodiceTop,
  garmentSpec,
  silhouetteProfile,
  type GarmentSpec,
  type ProfilePoint
} from "@/lib/garment";

const WIDTH = 300;
const HEIGHT = 400;
const CENTRE = WIDTH / 2;
/** Where the hem and the shoulder sit on the canvas. */
const HEM_Y = 352;
const SHOULDER_Y = 96;
/** What profile radius 1.0 is worth in pixels — a full ballgown hem. */
const SPAN = 104;

type Point = { x: number; y: number };

function place(point: ProfilePoint, side: 1 | -1): Point {
  return {
    x: CENTRE + side * point.radius * SPAN,
    y: HEM_Y - point.height * (HEM_Y - SHOULDER_Y)
  };
}

/**
 * Catmull-Rom through the landmarks, emitted as cubic beziers.
 *
 * The same reason the 3D sweep splines its profile: drawn straight between the
 * seven landmarks a gown reads as a folded paper cut-out. This is the 2D form of
 * the identical curve, so the flat drawing and the swept mesh describe the same
 * shape rather than two approximations of it.
 */
function spline(points: Point[]): string {
  if (points.length < 2) return "";

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;

    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };

    path += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

/** The outline of the whole garment: up one side, across, down the other. */
function outline(spec: GarmentSpec): string {
  const profile = silhouetteProfile(spec);
  const top = bodiceTop(spec);

  // Cut the profile at the neckline so a strapless gown does not draw itself a
  // pair of shoulders it does not have.
  const cut = profile.filter((point) => point.height <= top);
  const highest = cut[cut.length - 1] ?? profile[0];

  const left = cut.map((point) => place(point, -1)).reverse();
  const right = cut.map((point) => place(point, 1));

  // Up the right side, across the neckline, down the left, and the hem closes it.
  const up = spline(right);
  const across = `L ${place({ radius: highest.radius, height: highest.height }, -1).x.toFixed(2)} ${place(highest, -1).y.toFixed(2)}`;
  const down = spline(left).replace(/^M[^C]*/, " ");

  return `${up} ${across}${down} Z`;
}

/** Fold lines, at the same count and phase the 3D cloth uses. */
function folds(spec: GarmentSpec): string[] {
  const profile = silhouetteProfile(spec);
  const top = bodiceTop(spec);
  const cut = profile.filter((point) => point.height <= top);

  // A handful of the folds, not all of them — thirty-four tulle gathers drawn as
  // lines is a hatch pattern, not a skirt.
  const count = Math.min(7, Math.max(3, Math.round(spec.folds / 4)));
  const lines: string[] = [];

  for (let index = 1; index <= count; index += 1) {
    // Spread across the width, avoiding the outline itself.
    const across = -0.72 + (index / (count + 1)) * 1.44;
    const points = cut
      .filter((point) => point.height < 0.74)
      .map((point) => ({
        x: CENTRE + across * point.radius * SPAN,
        y: HEM_Y - point.height * (HEM_Y - SHOULDER_Y)
      }));
    if (points.length > 1) lines.push(spline(points));
  }

  return lines;
}

export function GownSilhouette({
  gown,
  className
}: {
  gown: { id: string; description: string; color: string | null; number?: string };
  className?: string;
}) {
  const spec = garmentSpec(gown);
  const { palette } = spec;

  // Ids must be unique per instance or a grid of gowns all inherit the first
  // card's gradient — SVG defs are document-global.
  const key = `g${gown.id.replace(/[^a-zA-Z0-9]/g, "")}`;

  const beaded = spec.fabric === "beaded";
  const sheer = spec.fabric === "tulle" || spec.fabric === "chiffon";

  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${gown.description}${gown.color ? `, ${gown.color}` : ""}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`${key}-cloth`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0%" stopColor={palette.shadow} />
          <stop offset="34%" stopColor={palette.base} />
          <stop offset="58%" stopColor={palette.highlight} />
          <stop offset="100%" stopColor={palette.shadow} />
        </linearGradient>

        <linearGradient id={`${key}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.highlight} stopOpacity="0.26" />
          <stop offset="100%" stopColor={palette.shadow} stopOpacity="0.13" />
        </linearGradient>

        <radialGradient id={`${key}-shade`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={palette.shadow} stopOpacity="0.34" />
          <stop offset="100%" stopColor={palette.shadow} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill={`url(#${key}-ground)`} />

      {/* The shade the gown stands in, which is what stops it floating. */}
      <ellipse cx={CENTRE} cy={HEM_Y + 8} rx={SPAN * 1.05} ry="20" fill={`url(#${key}-shade)`} />

      {/* No stand is drawn above the gown. The obvious touch — a little arc for
          the neck of the form — is anchored to the shoulder line, but a
          strapless or sweetheart neckline ends well below that, so the arc
          detaches and floats over the gown as a stray pencil mark. A silhouette
          is stronger with nothing above it than with something not quite
          touching it. */}

      <path d={outline(spec)} fill={`url(#${key}-cloth)`} fillOpacity={sheer ? 0.9 : 1} />

      {/* Folds, drawn in the cloth's own shadow rather than in grey. */}
      <g
        stroke={palette.shadow}
        strokeOpacity={sheer ? 0.2 : 0.28}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      >
        {folds(spec).map((path, index) => (
          <path key={index} d={path} />
        ))}
      </g>

      {/* Beading sits at the waist, the same place the 3D scatter puts it. */}
      {beaded ? (
        <g fill={palette.accent} fillOpacity="0.85">
          {Array.from({ length: 26 }, (_, index) => {
            const a = Math.sin(index * 12.9898 + spec.seed * 78.233) * 43758.5453;
            const b = Math.sin(index * 39.3467 + spec.seed * 11.135) * 24634.6345;
            const u = a - Math.floor(a);
            const v = b - Math.floor(b);
            const height = 0.74 + v * (bodiceTop(spec) - 0.76);
            return (
              <circle
                key={index}
                cx={CENTRE + (u - 0.5) * 2 * 0.3 * SPAN}
                cy={HEM_Y - height * (HEM_Y - SHOULDER_Y)}
                r="2"
              />
            );
          })}
        </g>
      ) : null}

      {/* The outline last, so nothing drawn inside crosses it. */}
      <path
        d={outline(spec)}
        fill="none"
        stroke={palette.shadow}
        strokeOpacity="0.42"
        strokeWidth="1.6"
      />
    </svg>
  );
}
