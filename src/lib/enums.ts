/**
 * SQLite has no enum type, so what used to be Postgres enums are string columns.
 * These unions are where the allowed values are defined and enforced now —
 * every write goes through a parse function, so a bad value can't reach the
 * database from a hand-crafted form post.
 */

export const RENTAL_STATUSES = ["BOOKED", "OUT", "RETURNED", "CANCELLED"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const GOWN_CONDITIONS = ["NEW", "GOOD", "FAIR", "RETIRED"] as const;
export type GownCondition = (typeof GOWN_CONDITIONS)[number];

export const PHOTO_STORAGES = ["DB", "R2"] as const;
export type PhotoStorage = (typeof PHOTO_STORAGES)[number];

function parser<T extends readonly string[]>(allowed: T, fallback: T[number]) {
  return (value: unknown): T[number] =>
    typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T[number])
      : fallback;
}

export const parseRentalStatus = parser(RENTAL_STATUSES, "BOOKED");
export const parseGownCondition = parser(GOWN_CONDITIONS, "GOOD");
export const parsePhotoStorage = parser(PHOTO_STORAGES, "DB");

export function statusLabel(status: string): string {
  switch (status) {
    case "BOOKED":
      return "Booked";
    case "OUT":
      return "Out";
    case "RETURNED":
      return "Returned";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function conditionLabel(condition: string): string {
  return condition.charAt(0) + condition.slice(1).toLowerCase();
}
