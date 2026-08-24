/**
 * Emits SQL that creates or resets one admin login.
 *
 * D1 isn't reachable from Node — it only exists as a Worker binding — so this
 * prints SQL for wrangler to apply:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npx tsx scripts/make-admin.ts > admin.sql
 *   npx wrangler d1 execute rental-ledger --remote --file=admin.sql
 *   rm admin.sql
 *
 * If the email already exists its password is reset and every outstanding
 * session cookie is invalidated, so this doubles as password recovery.
 */

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const login = (process.env.ADMIN_LOGIN ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = process.env.ADMIN_NAME ?? "Owner";

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function main() {
  if (!login) {
    throw new Error("Set ADMIN_LOGIN to the username or email to sign in with.");
  }
  if (!password) {
    throw new Error("Set ADMIN_PASSWORD.");
  }

  const hash = await bcrypt.hash(password, 12);
  const stamp = new Date().toISOString();

  console.log(`-- admin login for ${login}`);
  console.log(
    `INSERT INTO User (id, email, name, passwordHash, sessionVersion, createdAt, updatedAt)`,
    `\nVALUES (${q(randomUUID())}, ${q(login)}, ${q(name)}, ${q(hash)}, 1, ${q(stamp)}, ${q(stamp)})`,
    `\nON CONFLICT(email) DO UPDATE SET`,
    `\n  passwordHash = excluded.passwordHash,`,
    `\n  name = excluded.name,`,
    // Bumping the version signs out anyone holding an old cookie.
    `\n  sessionVersion = User.sessionVersion + 1,`,
    `\n  updatedAt = excluded.updatedAt;`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
