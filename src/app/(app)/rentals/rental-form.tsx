"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveRentalAction, type RentalFormState } from "./actions";

export type GownOption = {
  id: string;
  number: string;
  description: string;
  size: string | null;
  color: string | null;
  priceCents: number;
};

export type RentalDefaults = {
  id?: string;
  customerName: string;
  phone: string;
  email: string;
  writtenDate: string;
  partyDate: string;
  pickupDate: string;
  returnDate: string;
  gownId: string;
  gownText: string;
  price: string;
  paid: string;
  status: string;
  notes: string;
};

function addDaysISO(day: string, delta: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function RentalForm({
  gowns,
  defaults,
  pickupOffset,
  returnOffset,
  isEdit
}: {
  gowns: GownOption[];
  defaults: RentalDefaults;
  pickupOffset: number;
  returnOffset: number;
  isEdit: boolean;
}) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(saveRentalAction, null);

  // React clears a form's DOM once its action returns. When the server rejects a
  // submit we get the typed values back and rebuild the fields from them, so a
  // conflict warning never costs someone their typing.
  const base = state?.values ?? defaults;

  const [fieldsKey, setFieldsKey] = useState(0);
  const [gownId, setGownId] = useState(defaults.gownId);
  const [partyDate, setPartyDate] = useState(defaults.partyDate);
  const [pickupDate, setPickupDate] = useState(defaults.pickupDate);
  const [returnDate, setReturnDate] = useState(defaults.returnDate);
  const [price, setPrice] = useState(defaults.price);

  useEffect(() => {
    if (!state?.values) return;
    setGownId(state.values.gownId);
    setPartyDate(state.values.partyDate);
    setPickupDate(state.values.pickupDate);
    setReturnDate(state.values.returnDate);
    setPrice(state.values.price);
    // Remounting the fields is what actually restores the wiped DOM — a state
    // change alone won't, because React sees the same value it last rendered.
    setFieldsKey((key) => key + 1);
  }, [state]);

  const selectedGown = gowns.find((gown) => gown.id === gownId) ?? null;

  function onPartyDateChange(value: string) {
    setPartyDate(value);
    // Only fill blanks — never overwrite dates someone deliberately set.
    if (value && !pickupDate) setPickupDate(addDaysISO(value, -pickupOffset));
    if (value && !returnDate) setReturnDate(addDaysISO(value, returnOffset));
  }

  function onGownChange(value: string) {
    setGownId(value);
    const gown = gowns.find((option) => option.id === value);
    // Fill the price from the gown unless a price has already been typed.
    if (gown && (!price || price === "0.00" || price === "0")) {
      setPrice((gown.priceCents / 100).toFixed(2));
    }
  }

  return (
    <form action={formAction} className="stack">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      {state?.error ? <div className="note bad">{state.error}</div> : null}

      {state?.conflicts?.length ? (
        <div className="note warn">
          <span className="note-title">
            {selectedGown ? `Gown #${selectedGown.number}` : "This gown"} is already promised
          </span>
          <ul>
            {state.conflicts.map((conflict) => (
              <li key={conflict.id}>
                <Link href={`/rentals/${conflict.id}`}>R-{conflict.number}</Link> — {conflict.customerName},
                party {conflict.partyDate} (out {conflict.from} → {conflict.to})
              </li>
            ))}
          </ul>
          <div className="row">
            {/* A named submit button: "override" only reaches the server when this
                exact button is the one that submitted the form. */}
            <button type="submit" name="override" value="1" className="btn small">
              Save anyway
            </button>
            <span className="tiny muted">Or pick a different gown or date above.</span>
          </div>
        </div>
      ) : null}

      <div key={fieldsKey} className="stack">
      <div className="card card-pad stack">
        <h2>Customer</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="customerName">Name</label>
            <input
              id="customerName"
              name="customerName"
              type="text"
              defaultValue={base.customerName}
              required
              autoFocus={!isEdit}
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" defaultValue={base.phone} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={base.email} />
          </div>
        </div>
      </div>

      <div className="card card-pad stack">
        <h2>Dates</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="writtenDate">Date</label>
            <input
              id="writtenDate"
              name="writtenDate"
              type="date"
              defaultValue={base.writtenDate}
            />
            <span className="hint">When the rental was written up</span>
          </div>
          <div className="field">
            <label htmlFor="partyDate">Date of party</label>
            <input
              id="partyDate"
              name="partyDate"
              type="date"
              value={partyDate}
              onChange={(event) => onPartyDateChange(event.target.value)}
              required
            />
            <span className="hint">Everything sorts on this</span>
          </div>
          <div className="field">
            <label htmlFor="pickupDate">Pickup</label>
            <input
              id="pickupDate"
              name="pickupDate"
              type="date"
              value={pickupDate}
              onChange={(event) => setPickupDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="returnDate">Return</label>
            <input
              id="returnDate"
              name="returnDate"
              type="date"
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card card-pad stack">
        <h2>Gown</h2>
        <div className="field">
          <label htmlFor="gownId">Gown</label>
          <select id="gownId" name="gownId" value={gownId} onChange={(event) => onGownChange(event.target.value)}>
            <option value="">— not from inventory —</option>
            {gowns.map((gown) => (
              <option key={gown.id} value={gown.id}>
                #{gown.number} — {gown.description}
                {gown.size ? ` (${gown.size})` : ""}
              </option>
            ))}
          </select>
          <span className="hint">
            Picking a gown fills the price and checks for a double booking.
          </span>
        </div>
        {gownId ? null : (
          <div className="field">
            <label htmlFor="gownText">Gown description</label>
            <input
              id="gownText"
              name="gownText"
              type="text"
              defaultValue={base.gownText}
              placeholder="Ivory A-line, beaded bodice"
            />
            <span className="hint">Free text, for anything not in the gown list yet.</span>
          </div>
        )}
      </div>

      <div className="card card-pad stack">
        <h2>Money</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="price">Price</label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="paid">Paid</label>
            <input
              id="paid"
              name="paid"
              type="number"
              step="0.01"
              min="0"
              defaultValue={base.paid}
            />
            <span className="hint">Total received so far. The difference is recorded as a payment.</span>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={base.status}>
              <option value="BOOKED">Booked</option>
              <option value="OUT">Out</option>
              <option value="RETURNED">Returned</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card card-pad stack">
        <h2>Notes</h2>
        <div className="field">
          <textarea
            id="notes"
            name="notes"
            aria-label="Notes"
            defaultValue={base.notes}
            placeholder="Alterations, who referred them, anything worth remembering"
          />
        </div>
      </div>
      </div>

      <div className="row">
        <SaveButton label={isEdit ? "Save changes" : "Save rental"} />
        <Link href={defaults.id ? `/rentals/${defaults.id}` : "/"} className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}
