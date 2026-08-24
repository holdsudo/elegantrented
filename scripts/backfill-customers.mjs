/**
 * Builds Customer records from the rentals already in the book, and links each
 * rental to the right one.
 *
 *   npx wrangler d1 execute rental-ledger --remote --json \
 *     --command "SELECT id, customerName, phone, email, createdAt FROM Rental" \
 *     | node scripts/backfill-customers.mjs > backfill.sql
 *   npx wrangler d1 execute rental-ledger --remote --file=backfill.sql
 *
 * Grouping happens here rather than in SQL because phone normalisation and
 * "same person, different spelling" are far easier to get right in JavaScript,
 * and this only ever runs once.
 */

import { randomUUID } from "crypto";

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const nul = (value) => (value == null || value === "" ? "NULL" : sql(value));

/** Digits only. "(555) 013-4" and "555-0134" are the same person. */
function phoneKey(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

function nameKey(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  const payload = JSON.parse(raw);
  const rentals = Array.isArray(payload) ? (payload[0]?.results ?? []) : (payload.results ?? []);

  // Newest last, so the most recent spelling of a name wins.
  rentals.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const byKey = new Map();
  const assignment = [];

  for (const rental of rentals) {
    const phone = phoneKey(rental.phone);
    const key = phone ? `p:${phone}` : `n:${nameKey(rental.customerName)}`;

    let customer = byKey.get(key);
    if (!customer) {
      customer = { id: randomUUID(), phoneKey: phone || null, count: 0 };
      byKey.set(key, customer);
    }

    // Later rentals refresh the details we hold.
    customer.name = rental.customerName;
    customer.phone = rental.phone || customer.phone || null;
    customer.email = rental.email || customer.email || null;
    customer.count += 1;

    assignment.push({ rentalId: rental.id, customerId: customer.id });
  }

  const stamp = new Date().toISOString();
  const lines = [`-- ${byKey.size} customers from ${rentals.length} rentals`];

  for (const customer of byKey.values()) {
    lines.push(
      `INSERT INTO Customer (id, name, phone, phoneKey, nameKey, email, createdAt, updatedAt)`,
      `VALUES (${sql(customer.id)}, ${sql(customer.name)}, ${nul(customer.phone)}, ${nul(customer.phoneKey)},`,
      `        ${sql(nameKey(customer.name))}, ${nul(customer.email)}, ${sql(stamp)}, ${sql(stamp)});`
    );
  }

  for (const link of assignment) {
    lines.push(
      `UPDATE Rental SET customerId = ${sql(link.customerId)} WHERE id = ${sql(link.rentalId)};`
    );
  }

  console.log(lines.join("\n"));
  process.stderr.write(`${byKey.size} customers, ${assignment.length} rentals linked\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
