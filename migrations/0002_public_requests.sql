-- Public storefront: booking requests, and which gowns are listed publicly.
--
-- A BookingRequest is deliberately NOT a Rental. Only Rentals are consulted when
-- checking whether a gown is free, so a customer request never blocks a date. The
-- date is blocked at the moment the owner confirms, which creates the Rental.

CREATE TABLE "BookingRequest" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "gownId"       TEXT,
    "gownText"     TEXT,
    "customerName" TEXT NOT NULL,
    "phone"        TEXT,
    "email"        TEXT,
    "partyDate"    DATETIME NOT NULL,
    "pickupDate"   DATETIME,
    "returnDate"   DATETIME,
    "notes"        TEXT,
    -- PENDING | CONFIRMED | DECLINED
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    -- Set when confirmed; points at the Rental that now holds the date.
    "rentalId"     TEXT,
    "ip"           TEXT,
    "createdAt"    DATETIME NOT NULL,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "BookingRequest_gownId_fkey" FOREIGN KEY ("gownId")
        REFERENCES "Gown" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BookingRequest_status_idx"    ON "BookingRequest"("status");
CREATE INDEX "BookingRequest_partyDate_idx" ON "BookingRequest"("partyDate");
CREATE INDEX "BookingRequest_gownId_idx"    ON "BookingRequest"("gownId");

-- Gowns show on the public site unless switched off. Retired gowns never show.
ALTER TABLE "Gown" ADD COLUMN "published" INTEGER NOT NULL DEFAULT 1;
