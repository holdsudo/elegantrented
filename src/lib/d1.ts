import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Thin typed access to Cloudflare D1.
 *
 * This replaced Prisma, which cannot run on Workers: its query compiler ships as
 * WebAssembly that neither webpack nor wrangler place where the runtime can read
 * it (opennextjs-cloudflare#471, prisma#27486). D1's own API is the supported
 * path, and for a schema this size it costs less than the ORM did.
 *
 * Conventions this file enforces, so no caller has to think about them:
 *
 *  * Dates are stored as ISO-8601 UTC text. Because every value has the same
 *    fixed width, SQLite's lexicographic comparison is also chronological — so
 *    `WHERE partyDate >= ?` behaves exactly as it did under Postgres.
 *  * Booleans are 0/1.
 *  * Money is integer cents, untouched.
 *  * Ids are UUIDs, generated here rather than by the database.
 */

export function db(): D1Database {
  const { env } = getCloudflareContext();
  if (!env.DB) {
    throw new Error("No D1 binding. Run `npm run dev` for local bindings, or deploy with wrangler.");
  }
  return env.DB;
}

/** The R2 bucket holding gown photos, when one is bound. */
export function photoBucket(): R2Bucket | null {
  try {
    return getCloudflareContext().env.PHOTOS ?? null;
  } catch {
    return null;
  }
}

export type Param = string | number | null;

export async function all<T>(sql: string, params: Param[] = []): Promise<T[]> {
  const { results } = await db()
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return results ?? [];
}

export async function first<T>(sql: string, params: Param[] = []): Promise<T | null> {
  return (await db()
    .prepare(sql)
    .bind(...params)
    .first<T>()) as T | null;
}

export async function run(sql: string, params: Param[] = []): Promise<void> {
  await db()
    .prepare(sql)
    .bind(...params)
    .run();
}

/** One round trip for several statements. D1 runs them in order. */
export async function batch(statements: Array<{ sql: string; params?: Param[] }>): Promise<void> {
  const prepared = statements.map((statement) =>
    db()
      .prepare(statement.sql)
      .bind(...(statement.params ?? []))
  );
  await db().batch(prepared);
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Date -> column value. */
export function toDb(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Column value -> Date. Tolerates the epoch-number form in case old rows exist. */
export function fromDb(value: string | number | null | undefined): Date | null {
  if (value == null) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Column value -> Date, for columns that are NOT NULL. */
export function fromDbRequired(value: string | number): Date {
  return fromDb(value) ?? new Date(0);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Builds `(?, ?, ?)` for an IN clause of the given length. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
