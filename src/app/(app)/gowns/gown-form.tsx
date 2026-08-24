"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { PhotoInput } from "@/components/photo-input";
import { saveGownAction, type GownFormState } from "./actions";

export type GownDefaults = {
  id?: string;
  number: string;
  description: string;
  size: string;
  color: string;
  price: string;
  condition: string;
  published: boolean;
  notes: string;
  acquiredOn: string;
  cost: string;
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function GownForm({ defaults, isEdit }: { defaults: GownDefaults; isEdit: boolean }) {
  const [state, formAction] = useActionState<GownFormState, FormData>(saveGownAction, null);

  // React clears the form once the action returns; rebuild it from what was typed.
  const base = state?.values ?? defaults;
  const [fieldsKey, setFieldsKey] = useState(0);
  useEffect(() => {
    if (state?.values) setFieldsKey((key) => key + 1);
  }, [state]);

  return (
    <form action={formAction} className="stack">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {state?.error ? <div className="note bad">{state.error}</div> : null}

      <div key={fieldsKey} className="card card-pad stack">
        <div className="field-row">
          <div className="field">
            <label htmlFor="number">Gown #</label>
            <input
              id="number"
              name="number"
              type="text"
              defaultValue={base.number}
              placeholder="118"
              required
              autoFocus={!isEdit}
            />
            <span className="hint">The tag number on the garment</span>
          </div>
          <div className="field">
            <label htmlFor="size">Size</label>
            <input id="size" name="size" type="text" defaultValue={base.size} placeholder="8" />
          </div>
          <div className="field">
            <label htmlFor="color">Color</label>
            <input id="color" name="color" type="text" defaultValue={base.color} placeholder="Ivory" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <input
            id="description"
            name="description"
            type="text"
            defaultValue={base.description}
            placeholder="A-line, beaded bodice"
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="price">Default price</label>
            <input id="price" name="price" type="number" step="0.01" min="0" defaultValue={base.price} />
            <span className="hint">Fills in automatically on new rentals</span>
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <select id="condition" name="condition" defaultValue={base.condition}>
              <option value="NEW">New</option>
              <option value="GOOD">Good</option>
              <option value="FAIR">Fair</option>
              <option value="RETIRED">Retired</option>
            </select>
            <span className="hint">Retired gowns drop off the rental picker</span>
          </div>
          <div className="field">
            <label htmlFor="published">Show on the website</label>
            <select id="published" name="published" defaultValue={base.published ? "1" : "0"}>
              <option value="1">Yes — customers can see and request it</option>
              <option value="0">No — keep it off the shop page</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="acquiredOn">Acquired on</label>
            <input id="acquiredOn" name="acquiredOn" type="date" defaultValue={base.acquiredOn} />
            <span className="hint">When it entered service</span>
          </div>
          <div className="field">
            <label htmlFor="cost">What it cost</label>
            <input id="cost" name="cost" type="number" step="0.01" min="0" defaultValue={base.cost} />
            <span className="hint">Used to work out whether it has paid for itself</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="photos">Photos</label>
          <PhotoInput />
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={base.notes}
            placeholder="Alterations made, damage, cleaning"
          />
        </div>
      </div>

      <div className="row">
        <SaveButton label={isEdit ? "Save changes" : "Add gown"} />
        <Link href={defaults.id ? `/gowns/${defaults.id}` : "/gowns"} className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}
