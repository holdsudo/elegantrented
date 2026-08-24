/**
 * Emits the first-run SQL: the admin user, the rental counter, and optionally
 * some demo rows.
 *
 * D1 isn't reachable from Node — it only exists as a Worker binding — so seeding
 * happens as SQL applied through wrangler rather than through Prisma:
 *
 *   npx tsx scripts/seed-sql.ts > seed.sql
 *   npx wrangler d1 execute rental-ledger --remote --file=seed.sql
 *
 * The output contains a password hash. It's gitignored; delete it when done.
 */

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123456";
const WITH_DEMO = process.env.SEED_DEMO === "1";
const FIRST_RENTAL_NUMBER = 1000;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Prisma's D1 adapter reads DateTime columns as ISO-8601 text — not epoch
 * numbers, and not SQLite's space-separated form. Calendar days sit at UTC
 * midnight, matching src/lib/dates.ts.
 */
const sqliteDate = (date: Date) => q(date.toISOString());
const now = () => sqliteDate(new Date());

function day(offsetDays: number): string {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return sqliteDate(new Date(`${base.toISOString().slice(0, 10)}T00:00:00.000Z`));
}

async function main() {
  const lines: string[] = [];
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  lines.push("-- Rental Ledger first-run seed");
  lines.push(
    `INSERT OR IGNORE INTO User (id, email, name, passwordHash, sessionVersion, createdAt, updatedAt)`,
    `VALUES (${q(randomUUID())}, ${q(ADMIN_EMAIL.toLowerCase())}, 'Owner', ${q(hash)}, 1, ${now()}, ${now()});`
  );
  lines.push(
    `INSERT OR IGNORE INTO Counter (name, value) VALUES ('rental', ${FIRST_RENTAL_NUMBER});`
  );

  if (WITH_DEMO) {
    const gowns = [
      ["087", "Blush ballgown, tulle skirt", "6", "Blush", 27500],
      ["118", "Ivory A-line, beaded bodice", "8", "Ivory", 22500],
      ["204", "Champagne mermaid, low back", "10", "Champagne", 31000],
      ["231", "Navy satin column", "4", "Navy", 19500],
      ["302", "Emerald off-shoulder", "12", "Emerald", 24000]
    ] as const;

    const gownIds = gowns.map(() => randomUUID());
    gowns.forEach(([number, description, size, color, price], index) => {
      lines.push(
        `INSERT OR IGNORE INTO Gown (id, number, description, size, color, priceCents, condition, createdAt, updatedAt)`,
        `VALUES (${q(gownIds[index])}, ${q(number)}, ${q(description)}, ${q(size)}, ${q(color)}, ${price}, 'GOOD', ${now()}, ${now()});`
      );
    });

    const demo = [
      { name: "Maria Colon", phone: "555-0134", gown: 1, party: 24, price: 22500, paid: 10000 },
      { name: "Denise Ruiz", phone: "555-0198", gown: 2, party: 9, price: 31000, paid: 31000 },
      { name: "Alani Pierce", phone: "555-0172", gown: 0, party: -5, price: 27500, paid: 27500 },
      { name: "Jasmine Ortiz", phone: "555-0110", gown: 3, party: 41, price: 19500, paid: 0 },
      { name: "Kelly Nguyen", phone: "555-0155", gown: 4, party: 62, price: 24000, paid: 5000 }
    ];

    demo.forEach((entry, index) => {
      const id = randomUUID();
      const number = FIRST_RENTAL_NUMBER + index + 1;
      lines.push(
        `INSERT OR IGNORE INTO Rental (id, number, customerName, phone, writtenDate, partyDate, pickupDate, returnDate, gownId, priceCents, status, createdAt, updatedAt)`,
        `VALUES (${q(id)}, ${number}, ${q(entry.name)}, ${q(entry.phone)}, ${day(entry.party - 30)}, ${day(entry.party)}, ${day(entry.party - 2)}, ${day(entry.party + 2)}, ${q(gownIds[entry.gown])}, ${entry.price}, ${entry.party < 0 ? "'OUT'" : "'BOOKED'"}, ${now()}, ${now()});`
      );
      if (entry.paid > 0) {
        lines.push(
          `INSERT OR IGNORE INTO Payment (id, rentalId, amountCents, method, paidOn, note, createdAt)`,
          `VALUES (${q(randomUUID())}, ${q(id)}, ${entry.paid}, 'Cash', ${day(entry.party - 30)}, 'Demo data', ${now()});`
        );
      }
    });

    lines.push(
      `UPDATE Counter SET value = ${FIRST_RENTAL_NUMBER + demo.length} WHERE name = 'rental';`
    );
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
