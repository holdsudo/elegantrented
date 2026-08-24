/**
 * The garment grammar.
 *
 * A gown in the ledger is seven fields and a sentence — "Champagne mermaid, low
 * back". That sentence is not decoration: it is the shop describing the physical
 * object in the language the trade actually uses. This module reads it and turns
 * it into a shape.
 *
 * Everything here is pure and dependency-free so the same spec drives three
 * things that must never disagree: the walkable showroom's 3D garment, the flat
 * catalogue's placeholder art, and the colour a gown's card is tinted with. One
 * gown, one description, one silhouette, everywhere.
 *
 * Nothing here invents detail the shop did not write. A description with no
 * silhouette word gets the house default, not a guess dressed up as fact — the
 * same principle the JSON-LD builders follow.
 */

export type Silhouette = "ballgown" | "aline" | "mermaid" | "column" | "sheath" | "empire";
export type Fabric = "tulle" | "satin" | "silk" | "beaded" | "chiffon" | "velvet" | "lace";
export type Neckline =
  | "strapless"
  | "offShoulder"
  | "vneck"
  | "halter"
  | "sweetheart"
  | "highneck";

export type Palette = {
  /** The body of the cloth. */
  base: string;
  /** Where it folds away from the light. */
  shadow: string;
  /** Where the light catches a fold. */
  highlight: string;
  /** Beading, embroidery, trim. */
  accent: string;
};

export type GarmentSpec = {
  silhouette: Silhouette;
  fabric: Fabric;
  neckline: Neckline;
  /** A low or open back changes the bodice, so it is part of the shape. */
  openBack: boolean;
  palette: Palette;
  /** 0 = matte, 1 = mirror-bright satin. Drives specular response. */
  sheen: number;
  /** Physical roughness, the inverse axis of sheen but not its exact opposite. */
  roughness: number;
  /** How far the skirt travels from the hip. 0 = column, 1 = full ballgown. */
  flare: number;
  /** How many vertical folds the cloth carries. */
  folds: number;
  /** Stable per-gown randomness, so a gown looks the same on every visit. */
  seed: number;
};

/* ------------------------------------------------------------------ colour */

/**
 * The colourways the shop actually stocks, as a four-step ramp each.
 *
 * Hand-tuned rather than computed: a satin navy in shadow goes violet, and an
 * ivory in shadow goes warm grey, and no generic darken() knows that.
 */
const COLOURWAYS: Record<string, Palette> = {
  blush: { base: "#E8C4C6", shadow: "#B07C82", highlight: "#FBEAEA", accent: "#C89094" },
  ivory: { base: "#F0E4D2", shadow: "#B9A588", highlight: "#FDF8EF", accent: "#CDBB9E" },
  champagne: { base: "#E7D4B4", shadow: "#AD8F5E", highlight: "#FAF1DE", accent: "#C1A472" },
  navy: { base: "#2F3F63", shadow: "#161E33", highlight: "#7285AC", accent: "#B9C4DC" },
  emerald: { base: "#2F6B4B", shadow: "#16352A", highlight: "#6FA98A", accent: "#B7D9C4" },
  black: { base: "#22201F", shadow: "#0C0B0B", highlight: "#5E5955", accent: "#B7ADA0" },
  burgundy: { base: "#6B2233", shadow: "#360F1B", highlight: "#A85C6C", accent: "#D8A9B3" },
  red: { base: "#9B2226", shadow: "#4D0F12", highlight: "#CE6266", accent: "#E9B4B5" },
  silver: { base: "#C9CBD0", shadow: "#8A8D94", highlight: "#F2F3F5", accent: "#FFFFFF" },
  gold: { base: "#C7A252", shadow: "#8A6C2C", highlight: "#EBD79C", accent: "#F6EDD2" },
  rose: { base: "#D9A6A0", shadow: "#A06B68", highlight: "#F5DDD9", accent: "#E8C4C0" },
  lilac: { base: "#B9A6CE", shadow: "#7B6A91", highlight: "#E4D9EE", accent: "#D4C6E4" },
  sage: { base: "#A3B39A", shadow: "#6B7A64", highlight: "#DCE4D7", accent: "#C6D2C0" },
  white: { base: "#F4F1EC", shadow: "#BFB9AF", highlight: "#FFFFFF", accent: "#E2DCD1" }
};

/** The house colourway, used when the shop left the colour blank. */
const DEFAULT_PALETTE: Palette = COLOURWAYS.ivory;

function paletteFor(colour: string | null): Palette {
  if (!colour) return DEFAULT_PALETTE;
  const key = colour.trim().toLowerCase();

  // Exact colourway first, then any colourway named inside a longer phrase
  // ("dusty rose", "midnight navy") — longest name wins so "rose gold" picks
  // gold over rose only if gold is genuinely the later, dominant word.
  if (COLOURWAYS[key]) return COLOURWAYS[key];

  const hit = Object.keys(COLOURWAYS)
    .filter((name) => key.includes(name))
    .sort((a, b) => key.lastIndexOf(b) - key.lastIndexOf(a))[0];

  return hit ? COLOURWAYS[hit] : DEFAULT_PALETTE;
}

/* ---------------------------------------------------------------- grammar */

/** Trade words for a shape, longest phrase first so "a-line" beats "line". */
const SILHOUETTES: [RegExp, Silhouette][] = [
  [/\bball\s?gown\b|\bball\b/i, "ballgown"],
  [/\ba[-\s]?line\b/i, "aline"],
  [/\bmermaid\b|\btrumpet\b|\bfishtail\b/i, "mermaid"],
  [/\bcolumn\b|\bslip\b/i, "column"],
  [/\bsheath\b|\bpencil\b/i, "sheath"],
  [/\bempire\b/i, "empire"]
];

const FABRICS: [RegExp, Fabric][] = [
  [/\btulle\b|\borganza\b/i, "tulle"],
  [/\bsatin\b|\bmikado\b/i, "satin"],
  [/\bbead(ed|ing)?\b|\bsequin(ed|s)?\b|\bcrystal\b/i, "beaded"],
  [/\bchiffon\b|\bgeorgette\b/i, "chiffon"],
  [/\bvelvet\b/i, "velvet"],
  [/\blace\b|\bguipure\b/i, "lace"],
  [/\bsilk\b|\bcrepe\b/i, "silk"]
];

const NECKLINES: [RegExp, Neckline][] = [
  [/\boff[-\s]?(the[-\s]?)?shoulder\b|\bbardot\b/i, "offShoulder"],
  [/\bstrapless\b/i, "strapless"],
  [/\bv[-\s]?neck\b|\bplunge\b|\bplunging\b/i, "vneck"],
  [/\bhalter\b/i, "halter"],
  [/\bsweetheart\b/i, "sweetheart"],
  [/\bhigh[-\s]?neck\b|\bturtle\b|\bmock\b/i, "highneck"]
];

function match<T>(table: [RegExp, T][], text: string): T | null {
  for (const [pattern, value] of table) if (pattern.test(text)) return value;
  return null;
}

/** How far each silhouette throws the skirt out from the hip. */
const FLARE: Record<Silhouette, number> = {
  ballgown: 1,
  aline: 0.62,
  empire: 0.55,
  mermaid: 0.42,
  column: 0.12,
  sheath: 0.08
};

/** Cloth behaviour: how bright it reads, how rough it is, how much it folds. */
const CLOTH: Record<Fabric, { sheen: number; roughness: number; folds: number }> = {
  satin: { sheen: 0.95, roughness: 0.16, folds: 14 },
  silk: { sheen: 0.72, roughness: 0.3, folds: 18 },
  beaded: { sheen: 0.88, roughness: 0.24, folds: 10 },
  velvet: { sheen: 0.34, roughness: 0.62, folds: 12 },
  tulle: { sheen: 0.28, roughness: 0.72, folds: 34 },
  chiffon: { sheen: 0.4, roughness: 0.55, folds: 26 },
  lace: { sheen: 0.36, roughness: 0.6, folds: 20 }
};

/**
 * A small deterministic hash. The showroom needs each gown's folds to fall the
 * same way on every visit — random folds that reshuffle on reload look like a
 * bug, not like cloth — so the randomness is seeded from the gown's own id.
 */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

/**
 * Read a gown record into a shape.
 *
 * The description is the source of truth; colour is a separate field and is read
 * separately, because a shop writes "Navy satin column" in one place and "Navy"
 * in the other and both must land on the same navy.
 */
export function garmentSpec(gown: {
  id: string;
  description: string;
  color: string | null;
}): GarmentSpec {
  const text = gown.description ?? "";

  const silhouette = match(SILHOUETTES, text) ?? "aline";
  const fabric = match(FABRICS, text) ?? "silk";
  const neckline = match(NECKLINES, text) ?? "sweetheart";
  const cloth = CLOTH[fabric];

  return {
    silhouette,
    fabric,
    neckline,
    openBack: /\blow\s?back\b|\bopen\s?back\b|\bbackless\b|\bcowl\b/i.test(text),
    palette: paletteFor(gown.color),
    sheen: cloth.sheen,
    roughness: cloth.roughness,
    flare: FLARE[silhouette],
    folds: cloth.folds,
    seed: hash(gown.id || text)
  };
}

/* --------------------------------------------------------------- silhouette */

/** One point down the centre line of the garment. */
export type ProfilePoint = {
  /** Distance from the centre line, 0..1, where 1 is the widest a skirt gets. */
  radius: number;
  /** Height up the figure, 0 at the hem, 1 at the shoulder. */
  height: number;
};

/**
 * The garment's outline, as the profile that gets swept around the vertical axis.
 *
 * Read bottom to top: hem, knee, hip, waist, bust, shoulder. Each silhouette is
 * the same six landmarks at different radii — which is genuinely how the shapes
 * differ on a pattern table, so the 3D and the flat art derive from one source.
 */
export function silhouetteProfile(spec: GarmentSpec): ProfilePoint[] {
  const { silhouette, flare } = spec;

  // Waist and bust barely move between silhouettes; the skirt is the story.
  const waist = 0.3;
  const bust = 0.37;

  switch (silhouette) {
    case "ballgown":
      return [
        { radius: 1.0, height: 0 },
        { radius: 0.94, height: 0.16 },
        { radius: 0.72, height: 0.38 },
        { radius: 0.46, height: 0.58 },
        { radius: waist, height: 0.72 },
        { radius: bust, height: 0.86 },
        { radius: 0.3, height: 1 }
      ];

    case "aline":
      return [
        { radius: 0.78, height: 0 },
        { radius: 0.68, height: 0.2 },
        { radius: 0.55, height: 0.42 },
        { radius: 0.41, height: 0.6 },
        { radius: waist, height: 0.74 },
        { radius: bust, height: 0.87 },
        { radius: 0.3, height: 1 }
      ];

    case "empire":
      return [
        { radius: 0.72, height: 0 },
        { radius: 0.64, height: 0.22 },
        { radius: 0.52, height: 0.45 },
        { radius: 0.42, height: 0.64 },
        { radius: 0.33, height: 0.78 },
        { radius: bust, height: 0.88 },
        { radius: 0.3, height: 1 }
      ];

    // The mermaid is the one shape that goes in before it goes out: narrow
    // through the thigh, then a sudden flute below the knee.
    case "mermaid":
      return [
        { radius: 0.82, height: 0 },
        { radius: 0.62, height: 0.12 },
        { radius: 0.34, height: 0.28 },
        { radius: 0.29, height: 0.46 },
        { radius: 0.31, height: 0.62 },
        { radius: waist, height: 0.76 },
        { radius: bust, height: 0.88 },
        { radius: 0.3, height: 1 }
      ];

    case "column":
    case "sheath":
    default: {
      const width = 0.3 + flare * 0.5;
      return [
        { radius: width, height: 0 },
        { radius: width * 0.98, height: 0.24 },
        { radius: width * 0.95, height: 0.46 },
        { radius: 0.33, height: 0.62 },
        { radius: waist, height: 0.76 },
        { radius: bust, height: 0.88 },
        { radius: 0.3, height: 1 }
      ];
    }
  }
}

/**
 * Where the cloth stops and skin begins, as a height 0..1 up the figure.
 *
 * The bodice is cut here. A strapless gown ends below the shoulder; a high neck
 * runs past it. The showroom uses this to know where to end the garment and the
 * flat art uses it to know where to stop drawing.
 */
export function bodiceTop(spec: GarmentSpec): number {
  switch (spec.neckline) {
    case "highneck":
      return 1.06;
    case "halter":
      return 1.02;
    case "offShoulder":
      return 0.93;
    case "vneck":
      return 0.9;
    case "sweetheart":
      return 0.88;
    case "strapless":
    default:
      return 0.86;
  }
}

/** A short, human label — "Mermaid · satin" — for captions and alt text. */
export function garmentLabel(spec: GarmentSpec): string {
  const shapes: Record<Silhouette, string> = {
    ballgown: "Ballgown",
    aline: "A-line",
    mermaid: "Mermaid",
    column: "Column",
    sheath: "Sheath",
    empire: "Empire"
  };
  const cloths: Record<Fabric, string> = {
    tulle: "tulle",
    satin: "satin",
    silk: "silk",
    beaded: "beaded",
    chiffon: "chiffon",
    velvet: "velvet",
    lace: "lace"
  };
  return `${shapes[spec.silhouette]} · ${cloths[spec.fabric]}`;
}
