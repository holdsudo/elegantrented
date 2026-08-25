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
    // The demo collection mirrors the six gowns that have been photographed,
    // with the ledger fields filled in: what each cost, when it was bought, and
    // how it has to be handled. Costs sit at roughly four times the nightly
    // price, which is the ratio the reports page is built to show — a gown
    // clears its purchase in four or five rentals.
    const gowns = [
      {
        number: "087", description: "Blush ballgown, tulle skirt", size: "6", color: "Blush",
        price: 27500, cost: 115000, acquired: "2024-03-18",
        notes: "Full tulle skirt with a ruffled hem and sweep train. Needs the wide garment bag and a double hook. Steam only \u2014 the ruffles flatten under an iron."
      },
      {
        number: "118", description: "Ivory A-line, off-shoulder", size: "8", color: "Ivory",
        price: 22500, cost: 89000, acquired: "2024-07-02",
        notes: "Off-shoulder straps sit best pinned at the shoulder seam. Front slit; check the hem facing after every wear."
      },
      {
        number: "204", description: "Plum mermaid, sequined bodice", size: "10", color: "Plum",
        price: 31000, cost: 138000, acquired: "2025-01-21",
        notes: "Sequined bodice \u2014 inspect the boning and underarm seams after each rental. The satin skirt marks easily, spot clean only."
      },
      {
        number: "231", description: "Powder blue satin column", size: "4", color: "Powder blue",
        price: 19500, cost: 72000, acquired: "2025-04-09",
        notes: "Bias-cut satin: runs small and clings, recommend sizing up. Hang overnight to drop, never fold."
      },
      {
        number: "302", description: "Black sequined tiers, off-shoulder", size: "12", color: "Black",
        price: 24000, cost: 105000, acquired: "2025-06-14",
        notes: "Tiered sequined lace \u2014 the tiers catch on rings and bracelets. Count tiers on return and check the slit facing."
      },
      {
        number: "345", description: "Ivory crepe mermaid, lace sleeves", size: "8", color: "Ivory",
        price: 28500, cost: 124000, acquired: "2025-09-30",
        notes: "The lace sleeves are detached pieces: log them out and back with the gown. Lace-trimmed train, bustle on request."
      }
    ] as const;

    const gownIds = gowns.map(() => randomUUID());
    gowns.forEach((gown, index) => {
      lines.push(
        `INSERT OR IGNORE INTO Gown (id, number, description, size, color, priceCents, costCents, acquiredOn, notes, condition, published, createdAt, updatedAt)`,
        `VALUES (${q(gownIds[index])}, ${q(gown.number)}, ${q(gown.description)}, ${q(gown.size)}, ${q(gown.color)}, ${gown.price}, ${gown.cost}, ${q(`${gown.acquired}T00:00:00.000Z`)}, ${q(gown.notes)}, 'GOOD', 1, ${now()}, ${now()});`
      );
    });

    // Phone numbers are in the 555-01xx range and addresses on example.com, both
    // reserved so demo rows can never reach a real person.
    const demo = [
      {
        name: "Maria Colon", phone: "555-0134", email: "maria.colon@example.com",
        customerNotes: "Size 8. Prefers ivory and champagne. Second rental with us.",
        gown: 1, party: 24, price: 22500, paid: 10000, method: "Card", payNote: "Deposit",
        notes: "Sweet sixteen. Wants the hem checked before pickup \u2014 she'll be in flats."
      },
      {
        name: "Denise Ruiz", phone: "555-0198", email: "denise.ruiz@example.com",
        customerNotes: "Size 10. Referred by Alani Pierce.",
        gown: 2, party: 9, price: 31000, paid: 31000, method: "Card", payNote: "Paid in full at fitting",
        notes: "Engagement party. Taking the gown straight from the fitting; no alterations needed."
      },
      {
        name: "Alani Pierce", phone: "555-0172", email: "alani.pierce@example.com",
        customerNotes: "Size 6. Repeat customer, third gown.",
        gown: 0, party: -5, price: 27500, paid: 27500, method: "Cash", payNote: "Paid in full at pickup",
        notes: "Out now. Returning Monday, she asked to drop off after 5."
      },
      {
        name: "Jasmine Ortiz", phone: "555-0110", email: "jasmine.ortiz@example.com",
        customerNotes: "Size 4. First rental; her mother handles the payments.",
        gown: 3, party: 41, price: 19500, paid: 0, method: "Cash", payNote: "",
        notes: "Prom. Mother is paying on collection, balance still open."
      },
      {
        name: "Kelly Nguyen", phone: "555-0155", email: "kelly.nguyen@example.com",
        customerNotes: "Size 12. Found us through Instagram.",
        gown: 4, party: 62, price: 24000, paid: 5000, method: "Zelle", payNote: "Deposit",
        notes: "Winter formal. Deposit taken, wants a second fitting two weeks before."
      },
      {
        name: "Carla Mendez", phone: "555-0166", email: "carla.mendez@example.com",
        customerNotes: "Size 8. Enquired through the website form.",
        gown: 1, party: 50, price: 22500, paid: 0, method: "Cash", payNote: "",
        notes: "From website request"
      }
    ];

    demo.forEach((entry) => {
      lines.push(
        `INSERT OR IGNORE INTO Customer (id, name, phone, phoneKey, nameKey, email, notes, createdAt, updatedAt)`,
        `VALUES (${q(randomUUID())}, ${q(entry.name)}, ${q(entry.phone)}, ${q(entry.phone.replaceAll(/[^0-9]/g, ""))}, ${q(entry.name.toLowerCase())}, ${q(entry.email)}, ${q(entry.customerNotes)}, ${now()}, ${now()});`
      );
    });

    demo.forEach((entry, index) => {
      const id = randomUUID();
      const number = FIRST_RENTAL_NUMBER + index + 1;
      lines.push(
        `INSERT OR IGNORE INTO Rental (id, number, customerName, phone, email, notes, writtenDate, partyDate, pickupDate, returnDate, gownId, priceCents, status, createdAt, updatedAt)`,
        `VALUES (${q(id)}, ${number}, ${q(entry.name)}, ${q(entry.phone)}, ${q(entry.email)}, ${q(entry.notes)}, ${day(entry.party - 30)}, ${day(entry.party)}, ${day(entry.party - 2)}, ${day(entry.party + 2)}, ${q(gownIds[entry.gown])}, ${entry.price}, ${entry.party < 0 ? "'OUT'" : "'BOOKED'"}, ${now()}, ${now()});`
      );
      if (entry.paid > 0) {
        lines.push(
          `INSERT OR IGNORE INTO Payment (id, rentalId, amountCents, method, paidOn, note, createdAt)`,
          `VALUES (${q(randomUUID())}, ${q(id)}, ${entry.paid}, ${q(entry.method)}, ${day(entry.party - 30)}, ${q(entry.payNote)}, ${now()});`
        );
      }
    });

    lines.push(
      `UPDATE Counter SET value = ${FIRST_RENTAL_NUMBER + demo.length} WHERE name = 'rental';`
    );

    // Shop details. These are demo values and are deliberately gated behind
    // SEED_DEMO: a real first run must not have a fictional phone number
    // planted in it. The address fields stay empty on purpose — they feed
    // schema.org structured data, and an invented street would publish a
    // location that does not exist.
    const settings: Record<string, string> = {
      brandName: "Elegant Rented",
      brandTagline: "Couture gowns, rented beautifully.",
      brandPrimary: "#B08D57",
      shopPhone: "(201) 555-0142",
      shopEmail: "hello@elegantrental.com",
      instagramUrl: "https://instagram.com/elegantrental"
    };
    for (const [key, value] of Object.entries(settings)) {
      lines.push(
        `INSERT OR IGNORE INTO AppSetting (key, value, updatedAt) VALUES (${q(key)}, ${q(value)}, ${now()});`
      );
    }
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
