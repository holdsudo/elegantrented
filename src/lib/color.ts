/**
 * The primary color is a setting, so the two colors derived from it — the darker
 * step used for text, and the tint used for fills — have to be derived at runtime
 * rather than hand-picked in the stylesheet.
 */

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** amount 0..1 toward black. */
export function darken(hex: string, amount: number): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return toHex(rgb.map((channel) => channel * (1 - amount)) as [number, number, number]);
}

/** amount 0..1 toward white. */
export function lighten(hex: string, amount: number): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return toHex(
    rgb.map((channel) => channel + (255 - channel) * amount) as [number, number, number]
  );
}

/** Relative luminance, for deciding whether text on this color should be white or dark. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The three custom properties a chosen primary color needs, or null if the value
 * isn't a usable hex color (in which case the stylesheet's defaults stand).
 */
export function primaryTheme(hex: string): {
  primary: string;
  primaryInk: string;
  primarySoft: string;
  onPrimary: string;
} | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return {
    primary: toHex(rgb),
    primaryInk: darken(hex, 0.28)!,
    primarySoft: lighten(hex, 0.86)!,
    onPrimary: luminance(rgb) > 0.55 ? "#2B2118" : "#FFFFFF"
  };
}
