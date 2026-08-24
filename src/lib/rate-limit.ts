import { headers } from "next/headers";
import { clearFailures, countLoginFailures, pruneAttempts, recordAttempt } from "@/lib/queries";

/**
 * Login throttling.
 *
 * Once this is on the public internet, one password is the only thing between a
 * stranger and every customer's name and phone number. Counters live in the
 * database because serverless gives each request its own process — an in-memory
 * counter would reset out from under us constantly.
 */

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_ACCOUNT = 8;
const MAX_FAILURES_PER_IP = 25;

export async function clientIp(): Promise<string> {
  const store = await headers();
  // Vercel sets x-forwarded-for; take the first hop, which is the real client.
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return store.get("x-real-ip") ?? "unknown";
}

export type RateVerdict = { blocked: false } | { blocked: true; minutes: number };

export async function checkLoginRate(identifier: string, ip: string): Promise<RateVerdict> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const failures = await countLoginFailures(identifier, ip, since);

  if (failures.account >= MAX_FAILURES_PER_ACCOUNT || failures.ip >= MAX_FAILURES_PER_IP) {
    return { blocked: true, minutes: WINDOW_MINUTES };
  }
  return { blocked: false };
}

export async function recordLoginAttempt(identifier: string, ip: string, success: boolean) {
  await recordAttempt(identifier, ip, success);

  // A successful sign-in clears that account's failures so a legitimate user
  // isn't still throttled by their own typos.
  if (success) {
    await clearFailures(identifier);
  }

  // Opportunistic pruning — cheap, and keeps the table from growing forever.
  if (Math.random() < 0.02) {
    await pruneAttempts(new Date(Date.now() - 24 * 60 * 60_000));
  }
}
