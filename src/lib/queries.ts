import { all, first, fromDb, fromDbRequired, newId, nowIso, placeholders, run, toDb, type Param } from "@/lib/d1";
import { today } from "@/lib/dates";

/**
 * Every SQL statement in the app lives here.
 *
 * Keeping them together means call sites read like domain functions rather than
 * queries, and there is exactly one place to look when the schema moves.
 */

// ---------------------------------------------------------------- row types

export type GownSummary = {
  id: string;
  number: string;
  description: string;
  size: string | null;
  color: string | null;
};

export type Gown = GownSummary & {
  priceCents: number;
  condition: string;
  published: boolean;
  notes: string | null;
  acquiredOn: Date | null;
  costCents: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Rental = {
  id: string;
  number: number;
  customerName: string;
  phone: string | null;
  email: string | null;
  writtenDate: Date;
  partyDate: Date;
  pickupDate: Date | null;
  returnDate: Date | null;
  gownId: string | null;
  gownText: string | null;
  priceCents: number;
  status: string;
  notes: string | null;
  customerId: string | null;
  gown: GownSummary | null;
};

export type Payment = {
  id: string;
  rentalId: string;
  amountCents: number;
  method: string;
  paidOn: Date;
  note: string | null;
};

export type GownPhoto = {
  id: string;
  gownId: string;
  filename: string;
  contentType: string;
  bytes: number;
  storage: string;
  data: string | null;
  storageKey: string | null;
};

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  sessionVersion: number;
};

// ------------------------------------------------------------------ mapping

type RawRental = Record<string, string | number | null>;

const RENTAL_COLUMNS = `
  r.id, r.number, r.customerName, r.phone, r.email, r.writtenDate, r.partyDate,
  r.pickupDate, r.returnDate, r.gownId, r.gownText, r.priceCents, r.status, r.notes, r.customerId,
  g.number AS g_number, g.description AS g_description, g.size AS g_size, g.color AS g_color
`;

const RENTAL_FROM = `FROM Rental r LEFT JOIN Gown g ON g.id = r.gownId`;

function mapRental(row: RawRental): Rental {
  return {
    id: String(row.id),
    number: Number(row.number),
    customerName: String(row.customerName),
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    writtenDate: fromDbRequired(row.writtenDate as string),
    partyDate: fromDbRequired(row.partyDate as string),
    pickupDate: fromDb(row.pickupDate),
    returnDate: fromDb(row.returnDate),
    gownId: (row.gownId as string) ?? null,
    gownText: (row.gownText as string) ?? null,
    priceCents: Number(row.priceCents ?? 0),
    status: String(row.status),
    notes: (row.notes as string) ?? null,
    customerId: (row.customerId as string) ?? null,
    gown: row.gownId
      ? {
          id: String(row.gownId),
          number: String(row.g_number ?? ""),
          description: String(row.g_description ?? ""),
          size: (row.g_size as string) ?? null,
          color: (row.g_color as string) ?? null
        }
      : null
  };
}

function mapGown(row: Record<string, string | number | null>): Gown {
  return {
    id: String(row.id),
    number: String(row.number),
    description: String(row.description),
    size: (row.size as string) ?? null,
    color: (row.color as string) ?? null,
    priceCents: Number(row.priceCents ?? 0),
    condition: String(row.condition ?? "GOOD"),
    published: Number(row.published ?? 1) === 1,
    notes: (row.notes as string) ?? null,
    acquiredOn: fromDb(row.acquiredOn),
    costCents: Number(row.costCents ?? 0),
    createdAt: fromDbRequired(row.createdAt as string),
    updatedAt: fromDbRequired(row.updatedAt as string)
  };
}

// ----------------------------------------------------------------- settings

export async function listSettings(): Promise<Array<{ key: string; value: string }>> {
  return all<{ key: string; value: string }>(`SELECT key, value FROM AppSetting`);
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  await run(
    `INSERT INTO AppSetting (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    [key, value, nowIso()]
  );
}

// --------------------------------------------------------------------- users

/**
 * Look a user up by whatever they typed. The `email` column is really a login
 * column — it holds an address or a plain username, whichever was set up.
 */
export async function findUserByLogin(login: string): Promise<User | null> {
  return first<User>(
    `SELECT id, email, name, passwordHash, sessionVersion FROM User WHERE email = ?`,
    [login]
  );
}

export async function findUserById(id: string): Promise<User | null> {
  return first<User>(
    `SELECT id, email, name, passwordHash, sessionVersion FROM User WHERE id = ?`,
    [id]
  );
}

/** Returns the bumped session version, which invalidates other devices' cookies. */
export async function updateUserPassword(id: string, passwordHash: string): Promise<number> {
  await run(
    `UPDATE User SET passwordHash = ?, sessionVersion = sessionVersion + 1, updatedAt = ? WHERE id = ?`,
    [passwordHash, nowIso(), id]
  );
  const user = await findUserById(id);
  return user?.sessionVersion ?? 1;
}

// ------------------------------------------------------------ login attempts

export async function countLoginFailures(identifier: string, ip: string, since: Date) {
  const sinceIso = toDb(since)!;
  const [byAccount, byIp] = await Promise.all([
    first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM LoginAttempt WHERE identifier = ? AND success = 0 AND createdAt >= ?`,
      [identifier, sinceIso]
    ),
    first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM LoginAttempt WHERE ip = ? AND success = 0 AND createdAt >= ?`,
      [ip, sinceIso]
    )
  ]);
  return { account: byAccount?.n ?? 0, ip: byIp?.n ?? 0 };
}

export async function recordAttempt(identifier: string, ip: string, success: boolean) {
  await run(
    `INSERT INTO LoginAttempt (id, identifier, ip, success, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [newId(), identifier, ip, success ? 1 : 0, nowIso()]
  );
}

export async function clearFailures(identifier: string) {
  await run(`DELETE FROM LoginAttempt WHERE identifier = ? AND success = 0`, [identifier]);
}

export async function pruneAttempts(before: Date) {
  await run(`DELETE FROM LoginAttempt WHERE createdAt < ?`, [toDb(before)!]);
}

// ------------------------------------------------------------------- counter

/** Atomic: the UPDATE and the read happen in one statement. */
export async function nextRentalNumber(firstNumber: number): Promise<number> {
  const updated = await first<{ value: number }>(
    `UPDATE Counter SET value = value + 1 WHERE name = 'rental' RETURNING value`
  );
  if (updated) return updated.value;

  const startAt = firstNumber + 1;
  await run(`INSERT INTO Counter (name, value) VALUES ('rental', ?)`, [startAt]);
  return startAt;
}

// ------------------------------------------------------------------- rentals

export async function getRental(id: string): Promise<Rental | null> {
  const row = await first<RawRental>(`SELECT ${RENTAL_COLUMNS} ${RENTAL_FROM} WHERE r.id = ?`, [id]);
  return row ? mapRental(row) : null;
}

export type LedgerQuery = {
  search?: string;
  /** Inclusive lower bound on party date. */
  partyFrom?: Date;
  /** Exclusive upper bound on party date. */
  partyBefore?: Date;
  /** Inclusive upper bound on party date. */
  partyThrough?: Date;
  excludeCancelled?: boolean;
  statuses?: string[];
  order?: "asc" | "desc";
  limit?: number;
};

export async function listRentals(query: LedgerQuery = {}): Promise<Rental[]> {
  const where: string[] = [];
  const params: Param[] = [];

  if (query.search) {
    const like = `%${query.search}%`;
    const digits = query.search.replace(/\D/g, "");
    const clauses = [
      "r.customerName LIKE ?",
      "r.notes LIKE ?",
      "r.gownText LIKE ?",
      "g.number LIKE ?",
      "g.description LIKE ?"
    ];
    params.push(like, like, like, like, like);
    if (digits.length >= 3) {
      clauses.push("replace(replace(replace(ifnull(r.phone,''), '-', ''), ' ', ''), '.', '') LIKE ?");
      params.push(`%${digits}%`);
    }
    if (/^\d+$/.test(query.search)) {
      clauses.push("r.number = ?");
      params.push(Number.parseInt(query.search, 10));
    }
    where.push(`(${clauses.join(" OR ")})`);
  }

  if (query.partyFrom) {
    where.push("r.partyDate >= ?");
    params.push(toDb(query.partyFrom)!);
  }
  if (query.partyBefore) {
    where.push("r.partyDate < ?");
    params.push(toDb(query.partyBefore)!);
  }
  if (query.partyThrough) {
    where.push("r.partyDate <= ?");
    params.push(toDb(query.partyThrough)!);
  }
  if (query.excludeCancelled) {
    where.push("r.status <> 'CANCELLED'");
  }
  if (query.statuses?.length) {
    where.push(`r.status IN (${placeholders(query.statuses.length)})`);
    params.push(...query.statuses);
  }

  const sql = `
    SELECT ${RENTAL_COLUMNS} ${RENTAL_FROM}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.partyDate ${query.order === "desc" ? "DESC" : "ASC"}
    ${query.limit ? `LIMIT ${Number(query.limit)}` : ""}
  `;

  const rows = await all<RawRental>(sql, params);
  return rows.map(mapRental);
}

/** Just the fields the dashboard counters need, for every live rental. */
export async function listLiveRentalSummaries(): Promise<
  Array<{ id: string; priceCents: number; partyDate: Date; returnDate: Date | null; status: string }>
> {
  const rows = await all<RawRental>(
    `SELECT id, priceCents, partyDate, returnDate, status FROM Rental WHERE status <> 'CANCELLED'`
  );
  return rows.map((row) => ({
    id: String(row.id),
    priceCents: Number(row.priceCents ?? 0),
    partyDate: fromDbRequired(row.partyDate as string),
    returnDate: fromDb(row.returnDate),
    status: String(row.status)
  }));
}

export async function countUpcomingRentals(from: Date): Promise<number> {
  const row = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM Rental WHERE partyDate >= ? AND status <> 'CANCELLED'`,
    [toDb(from)!]
  );
  return row?.n ?? 0;
}

export async function listRentalsForGown(gownId: string, statuses?: string[]): Promise<Rental[]> {
  const params: Param[] = [gownId];
  let sql = `SELECT ${RENTAL_COLUMNS} ${RENTAL_FROM} WHERE r.gownId = ?`;
  if (statuses?.length) {
    sql += ` AND r.status IN (${placeholders(statuses.length)})`;
    params.push(...statuses);
  }
  sql += ` ORDER BY r.partyDate DESC`;
  const rows = await all<RawRental>(sql, params);
  return rows.map(mapRental);
}

/** Live rentals grouped by gown — drives the In / Out / Due back badges. */
export async function liveRentalsByGown(): Promise<
  Map<string, Array<{ id: string; partyDate: Date; pickupDate: Date | null; returnDate: Date | null }>>
> {
  const rows = await all<RawRental>(
    `SELECT id, gownId, partyDate, pickupDate, returnDate FROM Rental
     WHERE gownId IS NOT NULL AND status IN ('BOOKED', 'OUT')
     ORDER BY partyDate ASC`
  );

  const byGown = new Map<
    string,
    Array<{ id: string; partyDate: Date; pickupDate: Date | null; returnDate: Date | null }>
  >();
  for (const row of rows) {
    const gownId = String(row.gownId);
    const entry = {
      id: String(row.id),
      partyDate: fromDbRequired(row.partyDate as string),
      pickupDate: fromDb(row.pickupDate),
      returnDate: fromDb(row.returnDate)
    };
    const list = byGown.get(gownId);
    if (list) list.push(entry);
    else byGown.set(gownId, [entry]);
  }
  return byGown;
}

export type RentalWrite = {
  customerName: string;
  phone: string | null;
  email: string | null;
  customerId?: string | null;
  writtenDate: Date;
  partyDate: Date;
  pickupDate: Date | null;
  returnDate: Date | null;
  gownId: string | null;
  gownText: string | null;
  priceCents: number;
  status: string;
  notes: string | null;
};

export async function createRental(data: RentalWrite, number: number): Promise<string> {
  const id = newId();
  const stamp = nowIso();
  await run(
    `INSERT INTO Rental
       (id, number, customerName, phone, email, customerId, writtenDate, partyDate, pickupDate,
        returnDate, gownId, gownText, priceCents, status, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      number,
      data.customerName,
      data.phone,
      data.email,
      data.customerId ?? null,
      toDb(data.writtenDate)!,
      toDb(data.partyDate)!,
      toDb(data.pickupDate),
      toDb(data.returnDate),
      data.gownId,
      data.gownText,
      data.priceCents,
      data.status,
      data.notes,
      stamp,
      stamp
    ]
  );
  return id;
}

export async function updateRental(id: string, data: RentalWrite): Promise<void> {
  await run(
    `UPDATE Rental SET
       customerName = ?, phone = ?, email = ?, customerId = COALESCE(?, customerId),
       writtenDate = ?, partyDate = ?,
       pickupDate = ?, returnDate = ?, gownId = ?, gownText = ?, priceCents = ?,
       status = ?, notes = ?, updatedAt = ?
     WHERE id = ?`,
    [
      data.customerName,
      data.phone,
      data.email,
      data.customerId ?? null,
      toDb(data.writtenDate)!,
      toDb(data.partyDate)!,
      toDb(data.pickupDate),
      toDb(data.returnDate),
      data.gownId,
      data.gownText,
      data.priceCents,
      data.status,
      data.notes,
      nowIso(),
      id
    ]
  );
}

export async function setRentalStatus(id: string, status: string): Promise<void> {
  await run(`UPDATE Rental SET status = ?, updatedAt = ? WHERE id = ?`, [status, nowIso(), id]);
}

export async function deleteRental(id: string): Promise<void> {
  await run(`DELETE FROM Rental WHERE id = ?`, [id]);
}

// ------------------------------------------------------------------ payments

export async function listPayments(rentalId: string): Promise<Payment[]> {
  const rows = await all<Record<string, string | number | null>>(
    `SELECT id, rentalId, amountCents, method, paidOn, note FROM Payment
     WHERE rentalId = ? ORDER BY paidOn DESC, createdAt DESC`,
    [rentalId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    rentalId: String(row.rentalId),
    amountCents: Number(row.amountCents ?? 0),
    method: String(row.method ?? "Cash"),
    paidOn: fromDbRequired(row.paidOn as string),
    note: (row.note as string) ?? null
  }));
}

export async function paidTotal(rentalId: string): Promise<number> {
  const row = await first<{ total: number | null }>(
    `SELECT SUM(amountCents) AS total FROM Payment WHERE rentalId = ?`,
    [rentalId]
  );
  return row?.total ?? 0;
}

export async function paidTotalsFor(rentalIds: string[]): Promise<Map<string, number>> {
  if (rentalIds.length === 0) return new Map();
  const rows = await all<{ rentalId: string; total: number }>(
    `SELECT rentalId, SUM(amountCents) AS total FROM Payment
     WHERE rentalId IN (${placeholders(rentalIds.length)}) GROUP BY rentalId`,
    rentalIds
  );
  return new Map(rows.map((row) => [row.rentalId, Number(row.total ?? 0)]));
}

export async function totalCollected(): Promise<number> {
  const row = await first<{ total: number | null }>(`SELECT SUM(amountCents) AS total FROM Payment`);
  return row?.total ?? 0;
}

export async function createPayment(data: {
  rentalId: string;
  amountCents: number;
  method: string;
  paidOn: Date;
  note: string | null;
}): Promise<void> {
  await run(
    `INSERT INTO Payment (id, rentalId, amountCents, method, paidOn, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId(), data.rentalId, data.amountCents, data.method, toDb(data.paidOn)!, data.note, nowIso()]
  );
}

export async function deletePayment(id: string): Promise<void> {
  await run(`DELETE FROM Payment WHERE id = ?`, [id]);
}

export async function listRecentPayments(limit: number) {
  const rows = await all<Record<string, string | number | null>>(
    `SELECT p.id, p.amountCents, p.method, p.paidOn, p.note,
            r.id AS rentalId, r.number AS rentalNumber, r.customerName
     FROM Payment p JOIN Rental r ON r.id = p.rentalId
     ORDER BY p.paidOn DESC, p.createdAt DESC LIMIT ${Number(limit)}`
  );
  return rows.map((row) => ({
    id: String(row.id),
    amountCents: Number(row.amountCents ?? 0),
    method: String(row.method ?? "Cash"),
    paidOn: fromDbRequired(row.paidOn as string),
    note: (row.note as string) ?? null,
    rental: {
      id: String(row.rentalId),
      number: Number(row.rentalNumber),
      customerName: String(row.customerName)
    }
  }));
}

// --------------------------------------------------------------------- gowns

export async function getGown(id: string): Promise<Gown | null> {
  const row = await first<Record<string, string | number | null>>(
    `SELECT * FROM Gown WHERE id = ?`,
    [id]
  );
  return row ? mapGown(row) : null;
}

export async function findGownByNumber(number: string): Promise<{ id: string } | null> {
  return first<{ id: string }>(`SELECT id FROM Gown WHERE number = ?`, [number]);
}

export async function listGowns(search?: string): Promise<Gown[]> {
  const params: Param[] = [];
  let sql = `SELECT * FROM Gown`;
  if (search) {
    const like = `%${search}%`;
    sql += ` WHERE number LIKE ? OR description LIKE ? OR color LIKE ? OR size LIKE ?`;
    params.push(like, like, like, like);
  }
  const rows = await all<Record<string, string | number | null>>(sql, params);
  return rows.map(mapGown);
}

/** Gowns still in service, plus one specific gown even if retired. */
export async function listGownOptions(
  includeId?: string | null
): Promise<Array<GownSummary & { priceCents: number }>> {
  const params: Param[] = [];
  let sql = `SELECT id, number, description, size, color, priceCents FROM Gown WHERE condition <> 'RETIRED'`;
  if (includeId) {
    sql += ` OR id = ?`;
    params.push(includeId);
  }
  return all<GownSummary & { priceCents: number }>(sql, params);
}

export type GownWrite = {
  number: string;
  description: string;
  size: string | null;
  color: string | null;
  priceCents: number;
  condition: string;
  published: boolean;
  notes: string | null;
  acquiredOn: Date | null;
  costCents: number;
};

export async function createGown(data: GownWrite): Promise<string> {
  const id = newId();
  const stamp = nowIso();
  await run(
    `INSERT INTO Gown (id, number, description, size, color, priceCents, condition, published,
                        notes, acquiredOn, costCents, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.number,
      data.description,
      data.size,
      data.color,
      data.priceCents,
      data.condition,
      data.published ? 1 : 0,
      data.notes,
      toDb(data.acquiredOn),
      data.costCents,
      stamp,
      stamp
    ]
  );
  return id;
}

export async function updateGown(id: string, data: GownWrite): Promise<void> {
  await run(
    `UPDATE Gown SET number = ?, description = ?, size = ?, color = ?, priceCents = ?,
       condition = ?, published = ?, notes = ?, acquiredOn = ?, costCents = ?,
       updatedAt = ? WHERE id = ?`,
    [
      data.number,
      data.description,
      data.size,
      data.color,
      data.priceCents,
      data.condition,
      data.published ? 1 : 0,
      data.notes,
      toDb(data.acquiredOn),
      data.costCents,
      nowIso(),
      id
    ]
  );
}

export async function deleteGown(id: string): Promise<void> {
  // Rentals keep their history; the link just goes null.
  await run(`UPDATE Rental SET gownId = NULL WHERE gownId = ?`, [id]);
  await run(`DELETE FROM Gown WHERE id = ?`, [id]);
}

// ----------------------------------------------------------- public catalogue

/** Gowns the storefront may show: published, and not retired. */
export async function listPublicGowns(): Promise<Gown[]> {
  const rows = await all<Record<string, string | number | null>>(
    `SELECT * FROM Gown WHERE published = 1 AND condition <> 'RETIRED'`
  );
  return rows.map(mapGown);
}

export async function getPublicGown(id: string): Promise<Gown | null> {
  const row = await first<Record<string, string | number | null>>(
    `SELECT * FROM Gown WHERE id = ? AND published = 1 AND condition <> 'RETIRED'`,
    [id]
  );
  return row ? mapGown(row) : null;
}

/**
 * Gowns already spoken for across a date range.
 *
 * Reads Rentals only — never BookingRequests. That single fact is what makes a
 * customer request non-blocking: until the owner confirms one and a Rental
 * exists, the date stays open to everyone.
 */
export async function takenGownIds(from: Date, to: Date): Promise<Set<string>> {
  const rows = await all<{ gownId: string }>(
    `SELECT DISTINCT gownId FROM Rental
     WHERE gownId IS NOT NULL
       AND status <> 'CANCELLED'
       AND partyDate >= ? AND partyDate <= ?`,
    [toDb(from)!, toDb(to)!]
  );
  return new Set(rows.map((row) => row.gownId));
}

/** How many pending requests exist per gown, so the storefront can say so. */
export async function pendingRequestCounts(): Promise<Map<string, number>> {
  const rows = await all<{ gownId: string; n: number }>(
    `SELECT gownId, COUNT(*) AS n FROM BookingRequest
     WHERE status = 'PENDING' AND gownId IS NOT NULL GROUP BY gownId`
  );
  return new Map(rows.map((row) => [row.gownId, Number(row.n)]));
}

// ---------------------------------------------------------- booking requests

export type BookingRequest = {
  id: string;
  gownId: string | null;
  gownText: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  partyDate: Date;
  pickupDate: Date | null;
  returnDate: Date | null;
  notes: string | null;
  status: string;
  rentalId: string | null;
  createdAt: Date;
  gown: GownSummary | null;
};

function mapRequest(row: Record<string, string | number | null>): BookingRequest {
  return {
    id: String(row.id),
    gownId: (row.gownId as string) ?? null,
    gownText: (row.gownText as string) ?? null,
    customerName: String(row.customerName),
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    partyDate: fromDbRequired(row.partyDate as string),
    pickupDate: fromDb(row.pickupDate),
    returnDate: fromDb(row.returnDate),
    notes: (row.notes as string) ?? null,
    status: String(row.status),
    rentalId: (row.rentalId as string) ?? null,
    createdAt: fromDbRequired(row.createdAt as string),
    gown: row.gownId
      ? {
          id: String(row.gownId),
          number: String(row.g_number ?? ""),
          description: String(row.g_description ?? ""),
          size: (row.g_size as string) ?? null,
          color: (row.g_color as string) ?? null
        }
      : null
  };
}

const REQUEST_SELECT = `
  SELECT b.*, g.number AS g_number, g.description AS g_description,
         g.size AS g_size, g.color AS g_color
  FROM BookingRequest b LEFT JOIN Gown g ON g.id = b.gownId
`;

export async function listRequests(status?: string): Promise<BookingRequest[]> {
  const params: Param[] = [];
  let sql = REQUEST_SELECT;
  if (status) {
    sql += ` WHERE b.status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY b.createdAt DESC`;
  const rows = await all<Record<string, string | number | null>>(sql, params);
  return rows.map(mapRequest);
}

export async function getRequest(id: string): Promise<BookingRequest | null> {
  const row = await first<Record<string, string | number | null>>(
    `${REQUEST_SELECT} WHERE b.id = ?`,
    [id]
  );
  return row ? mapRequest(row) : null;
}

export async function countPendingRequests(): Promise<number> {
  const row = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM BookingRequest WHERE status = 'PENDING'`
  );
  return row?.n ?? 0;
}

export async function createRequest(data: {
  gownId: string | null;
  gownText: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  partyDate: Date;
  notes: string | null;
  ip: string | null;
}): Promise<string> {
  const id = newId();
  const stamp = nowIso();
  await run(
    `INSERT INTO BookingRequest
       (id, gownId, gownText, customerName, phone, email, partyDate, notes, status, ip, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    [
      id,
      data.gownId,
      data.gownText,
      data.customerName,
      data.phone,
      data.email,
      toDb(data.partyDate)!,
      data.notes,
      data.ip,
      stamp,
      stamp
    ]
  );
  return id;
}

export async function setRequestStatus(
  id: string,
  status: string,
  rentalId: string | null = null
): Promise<void> {
  await run(`UPDATE BookingRequest SET status = ?, rentalId = ?, updatedAt = ? WHERE id = ?`, [
    status,
    rentalId,
    nowIso(),
    id
  ]);
}

export async function deleteRequest(id: string): Promise<void> {
  await run(`DELETE FROM BookingRequest WHERE id = ?`, [id]);
}

/** Submissions from one address in a window — basic abuse control on a public form. */
export async function countRecentRequestsFromIp(ip: string, since: Date): Promise<number> {
  const row = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM BookingRequest WHERE ip = ? AND createdAt >= ?`,
    [ip, toDb(since)!]
  );
  return row?.n ?? 0;
}

// -------------------------------------------------------------------- photos

export async function listGownPhotos(gownId: string): Promise<GownPhoto[]> {
  return all<GownPhoto>(
    `SELECT id, gownId, filename, contentType, bytes, storage, data, storageKey
     FROM GownPhoto WHERE gownId = ? ORDER BY createdAt ASC`,
    [gownId]
  );
}

/**
 * Photos written by `scripts/make-placeholders.mjs` rather than by the shop.
 *
 * That script marks its output in the filename precisely so it can be found and
 * replaced later, which is the contract this honours: a generated stand-in is
 * not a photograph of the gown, so the drawn silhouette — which is at least
 * derived from the gown's real description — is shown in preference to it.
 *
 * Nothing is deleted. The rows stay, the admin still lists and can remove them,
 * and the moment a real photograph is uploaded it outranks both.
 */
export const PLACEHOLDER_PREFIX = "placeholder-";

export function isPlaceholderPhoto(photo: { filename: string }): boolean {
  return photo.filename.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * The thumbnail for each gown on list screens: its earliest real photograph.
 *
 * Note what this is not — `MIN(id)`. Grouping on the smallest id returns the
 * lexicographically smallest UUID, which has nothing to do with which photo the
 * shop uploaded first, and an ORDER BY inside the subquery does not survive the
 * GROUP BY to fix it. The window function actually orders by time, with the id
 * only as a tiebreak so the choice is at least stable between requests.
 */
export async function firstPhotoIds(gownIds: string[]): Promise<Map<string, string>> {
  if (gownIds.length === 0) return new Map();
  const rows = await all<{ gownId: string; id: string }>(
    `SELECT gownId, id FROM (
       SELECT gownId, id,
              ROW_NUMBER() OVER (PARTITION BY gownId ORDER BY createdAt ASC, id ASC) AS rn
       FROM GownPhoto
       WHERE gownId IN (${placeholders(gownIds.length)})
         AND filename NOT LIKE '${PLACEHOLDER_PREFIX}%'
     ) WHERE rn = 1`,
    gownIds
  );
  return new Map(rows.map((row) => [row.gownId, row.id]));
}

export async function getGownPhoto(id: string): Promise<GownPhoto | null> {
  return first<GownPhoto>(
    `SELECT id, gownId, filename, contentType, bytes, storage, data, storageKey
     FROM GownPhoto WHERE id = ?`,
    [id]
  );
}

export async function createGownPhoto(data: {
  gownId: string;
  filename: string;
  contentType: string;
  bytes: number;
  storage: string;
  data: string | null;
  storageKey: string | null;
}): Promise<void> {
  await run(
    `INSERT INTO GownPhoto (id, gownId, filename, contentType, bytes, storage, data, storageKey, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      data.gownId,
      data.filename,
      data.contentType,
      data.bytes,
      data.storage,
      data.data,
      data.storageKey,
      nowIso()
    ]
  );
}

export async function deleteGownPhoto(id: string): Promise<GownPhoto | null> {
  const photo = await getGownPhoto(id);
  if (photo) await run(`DELETE FROM GownPhoto WHERE id = ?`, [id]);
  return photo;
}

export async function listPhotoRefsForGown(gownId: string) {
  return all<{ storage: string; storageKey: string | null }>(
    `SELECT storage, storageKey FROM GownPhoto WHERE gownId = ?`,
    [gownId]
  );
}

// ----------------------------------------------------------------- customers

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
  notes: string | null;
  createdAt: Date;
};

/** Digits only — "(555) 013-4" and "555-0134" are the same person. */
export function phoneKeyOf(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export function nameKeyOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function mapCustomer(row: Record<string, string | number | null>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: (row.phone as string) ?? null,
    phoneKey: (row.phoneKey as string) ?? null,
    email: (row.email as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: fromDbRequired(row.createdAt as string)
  };
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const row = await first<Record<string, string | number | null>>(
    `SELECT * FROM Customer WHERE id = ?`,
    [id]
  );
  return row ? mapCustomer(row) : null;
}

/**
 * Find the customer this rental belongs to, or create one.
 *
 * Matching is by phone first, then by name — the same order a person would use.
 * Details refresh on every save, so a corrected spelling or a new email follows
 * the customer forward rather than spawning a duplicate.
 */
export async function upsertCustomer(input: {
  name: string;
  phone: string | null;
  email: string | null;
}): Promise<string> {
  const key = phoneKeyOf(input.phone);
  const nameKey = nameKeyOf(input.name);

  const existing = key
    ? await first<{ id: string }>(`SELECT id FROM Customer WHERE phoneKey = ?`, [key])
    : await first<{ id: string }>(
        `SELECT id FROM Customer WHERE nameKey = ? AND phoneKey IS NULL`,
        [nameKey]
      );

  const stamp = nowIso();

  if (existing) {
    await run(
      `UPDATE Customer SET name = ?, nameKey = ?,
         phone = COALESCE(?, phone), email = COALESCE(?, email), updatedAt = ?
       WHERE id = ?`,
      [input.name, nameKey, input.phone, input.email, stamp, existing.id]
    );
    return existing.id;
  }

  const id = newId();
  await run(
    `INSERT INTO Customer (id, name, phone, phoneKey, nameKey, email, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.phone, key, nameKey, input.email, stamp, stamp]
  );
  return id;
}

export async function updateCustomerNotes(id: string, notes: string | null) {
  await run(`UPDATE Customer SET notes = ?, updatedAt = ? WHERE id = ?`, [notes, nowIso(), id]);
}

export type CustomerRollup = Customer & {
  rentals: number;
  cancelled: number;
  spentCents: number;
  bookedCents: number;
  balanceCents: number;
  firstPartyDate: Date | null;
  lastPartyDate: Date | null;
  nextPartyDate: Date | null;
};

/** Every customer with their totals, ready to sort or search. */
export async function listCustomerRollups(search?: string): Promise<CustomerRollup[]> {
  const params: Param[] = [];
  let where = "";
  if (search) {
    const like = `%${search}%`;
    const digits = search.replace(/\D/g, "");
    where = `WHERE c.name LIKE ? OR ifnull(c.email,'') LIKE ? OR ifnull(c.phoneKey,'') LIKE ?`;
    params.push(like, like, `%${digits || search}%`);
  }

  const rows = await all<Record<string, string | number | null>>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM Rental r WHERE r.customerId = c.id AND r.status <> 'CANCELLED') AS rentals,
            (SELECT COUNT(*) FROM Rental r WHERE r.customerId = c.id AND r.status = 'CANCELLED') AS cancelled,
            (SELECT ifnull(SUM(r.priceCents),0) FROM Rental r WHERE r.customerId = c.id AND r.status <> 'CANCELLED') AS bookedCents,
            (SELECT ifnull(SUM(p.amountCents),0) FROM Payment p
               JOIN Rental r ON r.id = p.rentalId WHERE r.customerId = c.id) AS spentCents,
            (SELECT MIN(r.partyDate) FROM Rental r WHERE r.customerId = c.id AND r.status <> 'CANCELLED') AS firstParty,
            (SELECT MAX(r.partyDate) FROM Rental r WHERE r.customerId = c.id AND r.status <> 'CANCELLED') AS lastParty,
            (SELECT MIN(r.partyDate) FROM Rental r WHERE r.customerId = c.id AND r.status <> 'CANCELLED' AND r.partyDate >= ?) AS nextParty
     FROM Customer c ${where}`,
    [toDb(today())!, ...params]
  );

  return rows
    .map((row) => ({
      ...mapCustomer(row),
      rentals: Number(row.rentals ?? 0),
      cancelled: Number(row.cancelled ?? 0),
      bookedCents: Number(row.bookedCents ?? 0),
      spentCents: Number(row.spentCents ?? 0),
      balanceCents: Number(row.bookedCents ?? 0) - Number(row.spentCents ?? 0),
      firstPartyDate: fromDb(row.firstParty),
      lastPartyDate: fromDb(row.lastParty),
      nextPartyDate: fromDb(row.nextParty)
    }))
    .sort((a, b) => b.spentCents - a.spentCents);
}

export async function listRentalsForCustomer(customerId: string): Promise<Rental[]> {
  const rows = await all<RawRental>(
    `SELECT ${RENTAL_COLUMNS} ${RENTAL_FROM} WHERE r.customerId = ? ORDER BY r.partyDate DESC`,
    [customerId]
  );
  return rows.map(mapRental);
}

// ------------------------------------------------------- gown analytics

export type GownRollup = {
  id: string;
  number: string;
  description: string;
  size: string | null;
  color: string | null;
  condition: string;
  published: boolean;
  priceCents: number;
  costCents: number;
  acquiredOn: Date | null;
  /** Non-cancelled rentals, ever. */
  timesRented: number;
  cancelled: number;
  /** Money actually collected against this gown's rentals. */
  earnedCents: number;
  /** Price agreed, whether or not it has been paid yet. */
  bookedCents: number;
  firstRented: Date | null;
  lastRented: Date | null;
  upcoming: number;
  distinctCustomers: number;
};

const GOWN_ROLLUP_SELECT = `
  SELECT g.id, g.number, g.description, g.size, g.color, g.condition, g.published,
         g.priceCents, g.costCents, g.acquiredOn,
         (SELECT COUNT(*) FROM Rental r WHERE r.gownId = g.id AND r.status <> 'CANCELLED') AS timesRented,
         (SELECT COUNT(*) FROM Rental r WHERE r.gownId = g.id AND r.status = 'CANCELLED') AS cancelled,
         (SELECT ifnull(SUM(p.amountCents),0) FROM Payment p JOIN Rental r ON r.id = p.rentalId
            WHERE r.gownId = g.id AND r.status <> 'CANCELLED') AS earnedCents,
         (SELECT ifnull(SUM(r.priceCents),0) FROM Rental r WHERE r.gownId = g.id AND r.status <> 'CANCELLED') AS bookedCents,
         (SELECT MIN(r.partyDate) FROM Rental r WHERE r.gownId = g.id AND r.status <> 'CANCELLED') AS firstRented,
         (SELECT MAX(r.partyDate) FROM Rental r WHERE r.gownId = g.id AND r.status <> 'CANCELLED') AS lastRented,
         (SELECT COUNT(*) FROM Rental r WHERE r.gownId = g.id AND r.status <> 'CANCELLED' AND r.partyDate >= ?) AS upcoming,
         (SELECT COUNT(DISTINCT r.customerId) FROM Rental r WHERE r.gownId = g.id AND r.customerId IS NOT NULL) AS customers
  FROM Gown g
`;

function mapGownRollup(row: Record<string, string | number | null>): GownRollup {
  return {
    id: String(row.id),
    number: String(row.number),
    description: String(row.description),
    size: (row.size as string) ?? null,
    color: (row.color as string) ?? null,
    condition: String(row.condition ?? "GOOD"),
    published: Number(row.published ?? 1) === 1,
    priceCents: Number(row.priceCents ?? 0),
    costCents: Number(row.costCents ?? 0),
    acquiredOn: fromDb(row.acquiredOn),
    timesRented: Number(row.timesRented ?? 0),
    cancelled: Number(row.cancelled ?? 0),
    earnedCents: Number(row.earnedCents ?? 0),
    bookedCents: Number(row.bookedCents ?? 0),
    firstRented: fromDb(row.firstRented),
    lastRented: fromDb(row.lastRented),
    upcoming: Number(row.upcoming ?? 0),
    distinctCustomers: Number(row.customers ?? 0)
  };
}

export async function getGownRollup(id: string): Promise<GownRollup | null> {
  const row = await first<Record<string, string | number | null>>(
    `${GOWN_ROLLUP_SELECT} WHERE g.id = ?`,
    [toDb(today())!, id]
  );
  return row ? mapGownRollup(row) : null;
}

export async function listGownRollups(search?: string): Promise<GownRollup[]> {
  const params: Param[] = [toDb(today())!];
  let sql = GOWN_ROLLUP_SELECT;
  if (search) {
    const like = `%${search}%`;
    sql += ` WHERE g.number LIKE ? OR g.description LIKE ? OR g.color LIKE ? OR g.size LIKE ?`;
    params.push(like, like, like, like);
  }
  const rows = await all<Record<string, string | number | null>>(sql, params);
  return rows.map(mapGownRollup);
}

/** Who has worn this gown, and how often. */
export async function customersForGown(gownId: string) {
  return all<{ id: string; name: string; times: number; spent: number; last: string }>(
    `SELECT c.id, c.name,
            COUNT(r.id) AS times,
            ifnull((SELECT SUM(p.amountCents) FROM Payment p JOIN Rental r2 ON r2.id = p.rentalId
                    WHERE r2.gownId = ? AND r2.customerId = c.id), 0) AS spent,
            MAX(r.partyDate) AS last
     FROM Rental r JOIN Customer c ON c.id = r.customerId
     WHERE r.gownId = ? AND r.status <> 'CANCELLED'
     GROUP BY c.id ORDER BY times DESC, last DESC`,
    [gownId, gownId]
  );
}

/** Money collected per calendar month, newest first. */
export async function revenueByMonth(limit = 12) {
  return all<{ month: string; collected: number; payments: number }>(
    `SELECT substr(paidOn, 1, 7) AS month,
            SUM(amountCents) AS collected,
            COUNT(*) AS payments
     FROM Payment GROUP BY month ORDER BY month DESC LIMIT ${Number(limit)}`
  );
}

/** Rentals per calendar month, by party date. */
export async function rentalsByMonth(limit = 12) {
  return all<{ month: string; rentals: number; booked: number }>(
    `SELECT substr(partyDate, 1, 7) AS month,
            COUNT(*) AS rentals,
            SUM(priceCents) AS booked
     FROM Rental WHERE status <> 'CANCELLED'
     GROUP BY month ORDER BY month DESC LIMIT ${Number(limit)}`
  );
}
