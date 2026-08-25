import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { findUserByLogin, findUserById } from "@/lib/queries";
import { BASE_PATH } from "@/lib/base-path";

/**
 * Signed-cookie sessions, carried over from the CRM's lib/auth.ts:
 * base64url payload + HMAC-SHA256, timing-safe compare, session versioning so
 * a password change invalidates outstanding cookies, and a fail-closed secret.
 */

const SESSION_COOKIE = "rental_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEV_SESSION_SECRET = "local-development-secret";

export type SessionPayload = {
  userId: string;
  sessionVersion: number;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;

  // Never sign a production session with a constant that lives in source control.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  return DEV_SESSION_SECRET;
}

export function encodeSessionToken(payload: SessionPayload, secret = getSecret()): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

export function decodeSessionToken(token: string, secret = getSecret()): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, signatureBuf)) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Returns the user on success, null on bad credentials. */
export async function verifyCredentials(login: string, password: string) {
  const user = await findUserByLogin(login.trim().toLowerCase());

  // Hash even when the user is missing, so a bad address and a bad password
  // take the same amount of time.
  const hash = user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await bcrypt.compare(password, hash);

  return user && ok ? user : null;
}

export async function startSession(userId: string, sessionVersion: number) {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSessionToken({ userId, sessionVersion }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Scoped to the app's own sub-path. The domain also serves unrelated sites
    // from other paths, and none of them have any business seeing this cookie.
    path: BASE_PATH || "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function endSession() {
  const store = await cookies();
  // Must match the path the cookie was set with, or the browser keeps it.
  store.delete({ name: SESSION_COOKIE, path: BASE_PATH || "/" });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = decodeSessionToken(token);
  if (!payload) return null;

  const user = await findUserById(payload.userId);
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;

  return { id: user.id, email: user.email, name: user.name };
}

/** Use at the top of every protected layout/action. Redirects if signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
