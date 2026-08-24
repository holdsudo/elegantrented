import { listSettings, upsertSetting } from "@/lib/queries";

/**
 * Every piece of branding and every default lives here, never in code.
 * Renaming the shop or changing the primary color is one row.
 */
export const SETTING_DEFAULTS = {
  brandName: "Elegant Rental",
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
