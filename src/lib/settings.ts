import { listSettings, upsertSetting } from "@/lib/queries";
import { BASE_PATH } from "@/lib/base-path";

/**
 * Every piece of branding and every default lives here, never in code.
 * Renaming the shop or changing the primary color is one row.
 */
export const SETTING_DEFAULTS = {
  brandName: "Elegant Rented",
  brandTagline: "Couture gowns, rented beautifully.",
  brandPrimary: "#B08D57",
  currency: "USD",
  shopPhone: "",
  shopEmail: "",
  shopAddress: "",
  /** Used for canonical URLs, Open Graph and structured data. */
  siteUrl: "https://rental-ledger.elegentrented.workers.dev",
  /** Optional, for local-business structured data. Left blank rather than invented. */
  shopStreet: "",
  shopCity: "",
  shopRegion: "",
  shopPostal: "",
  instagramUrl: "",
  /** Pickup is suggested this many days before the party. */
  pickupOffsetDays: "2",
  /** Return is suggested this many days after the party. */
  returnOffsetDays: "2",
  /** Warn if the same gown is booked within this many days of another party. */
  conflictWindowDays: "3"
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await listSettings();
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const result = { ...SETTING_DEFAULTS } as Settings;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const value = stored.get(key);
    if (value != null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

export async function setSetting(key: SettingKey, value: string) {
  await upsertSetting(key, value);
}

export function settingNumber(settings: Settings, key: SettingKey, fallback: number): number {
  const parsed = Number.parseInt(settings[key], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The public prefix every absolute URL is built from: the origin recorded in
 * `siteUrl`, plus the sub-path the app is mounted at. `siteUrl` holds the origin
 * alone — the base path comes from the build — but a value that already carries
 * the prefix is left as-is so an operator can paste a full URL without breaking
 * every canonical tag.
 */
export function siteBase(settings: { siteUrl?: string }): string {
  const origin = settings.siteUrl?.replace(/\/+$/, "") ?? "";
  if (!origin) return "";
  if (!BASE_PATH || origin.endsWith(BASE_PATH)) return origin;
  return `${origin}${BASE_PATH}`;
}
