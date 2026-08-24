"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitRequestAction, type RequestFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Sending…" : "Request this date"}
    </button>
  );
}

export function RequestForm({
  gownId,
  defaultDate,
  minDate
}: {
  gownId: string;
  defaultDate: string;
  minDate: string;
}) {
  const [state, formAction] = useActionState<RequestFormState, FormData>(
    submitRequestAction,
    null
  );

  // React clears the form once the action returns; rebuild it from what was typed.
  const base = state?.values ?? {
    customerName: "",
    phone: "",
    email: "",
    partyDate: defaultDate,
    notes: ""
  };
  const [fieldsKey, setFieldsKey] = useState(0);
  useEffect(() => {
    if (state?.values) setFieldsKey((key) => key + 1);
  }, [state]);

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="gownId" value={gownId} />
      {/* Honeypot — off-screen, never focusable, never filled by a person. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="honeypot"
      />

      {state?.error ? <div className="note bad">{state.error}</div> : null}

      <div key={fieldsKey} className="stack">
        <div className="field">
          <label htmlFor="customerName">Your name</label>
          <input
            id="customerName"
            name="customerName"
            type="text"
            defaultValue={base.customerName}
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" defaultValue={base.phone} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={base.email} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="partyDate">Date of your party</label>
          <input
            id="partyDate"
            name="partyDate"
            type="date"
            defaultValue={base.partyDate}
            min={minDate}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="notes">Anything we should know?</label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={base.notes}
            placeholder="Your usual size, alterations, when you'd like to come in"
          />
        </div>
      </div>

      <SubmitButton />

      <p className="tiny muted" style={{ margin: 0 }}>
        Sending this does not hold the dress. We&apos;ll be in touch to confirm, and it&apos;s only
        yours once we do.
      </p>
    </form>
  );
}
