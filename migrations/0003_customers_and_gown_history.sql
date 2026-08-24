-- Customers become records rather than strings typed onto each rental, and
-- gowns gain the acquisition facts needed to judge whether they earned back
-- what they cost.
--
-- Identity is the phone number, normalised to digits: it is the one thing a
-- shop reliably has and reliably reuses. Someone with no phone falls back to
-- their name. Entry doesn't change — staff still type a name and a number, and
-- the record is created or matched behind them.

CREATE TABLE "Customer" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "phone"     TEXT,
    -- Digits only. The match key; NULL when we only know a name.
    "phoneKey"  TEXT,
    -- Lowercased name, used to match when there is no phone at all.
    "nameKey"   TEXT NOT NULL,
    "email"     TEXT,
    "notes"     TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- Partial: many customers may have no phone, and those shouldn't collide.
CREATE UNIQUE INDEX "Customer_phoneKey_key" ON "Customer"("phoneKey") WHERE "phoneKey" IS NOT NULL;
CREATE INDEX "Customer_nameKey_idx" ON "Customer"("nameKey");
CREATE INDEX "Customer_name_idx"    ON "Customer"("name");

ALTER TABLE "Rental" ADD COLUMN "customerId" TEXT;
CREATE INDEX "Rental_customerId_idx" ON "Rental"("customerId");

-- What the gown cost and when it entered service, so revenue can be judged
-- against it rather than floating free.
ALTER TABLE "Gown" ADD COLUMN "acquiredOn" DATETIME;
ALTER TABLE "Gown" ADD COLUMN "costCents" INTEGER NOT NULL DEFAULT 0;
