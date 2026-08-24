import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { changePasswordAction, saveSettingsAction } from "./actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const settings = await getSettings();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <div className="page-sub">Nothing here is hardcoded — the app reads all of it at runtime.</div>
        </div>
      </div>

      <div className="page">
        {params.saved === "1" ? <div className="note good">Settings saved.</div> : null}
        {params.saved === "password" ? <div className="note good">Password changed.</div> : null}
        {params.error === "short" ? (
          <div className="note bad">That password is too short — use at least 4 characters.</div>
        ) : null}
        {params.error === "mismatch" ? (
          <div className="note bad">Those two passwords don't match.</div>
        ) : null}

        <form action={saveSettingsAction} className="stack">
          <div className="card card-pad stack">
            <h2>Shop</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="brandName">Name</label>
                <input id="brandName" name="brandName" type="text" defaultValue={settings.brandName} />
                <span className="hint">Appears in the sidebar, the tab title and on printouts</span>
              </div>
              <div className="field">
                <label htmlFor="shopPhone">Phone</label>
                <input id="shopPhone" name="shopPhone" type="tel" defaultValue={settings.shopPhone} />
              </div>
              <div className="field">
                <label htmlFor="currency">Currency</label>
                <input id="currency" name="currency" type="text" defaultValue={settings.currency} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="shopAddress">Address</label>
              <input
                id="shopAddress"
                name="shopAddress"
                type="text"
                defaultValue={settings.shopAddress}
              />
            </div>
          </div>

          <div className="card card-pad stack">
            <h2>Defaults</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="pickupOffsetDays">Pickup, days before party</label>
                <input
                  id="pickupOffsetDays"
                  name="pickupOffsetDays"
                  type="number"
                  min="0"
                  defaultValue={settings.pickupOffsetDays}
                />
              </div>
              <div className="field">
                <label htmlFor="returnOffsetDays">Return, days after party</label>
                <input
                  id="returnOffsetDays"
                  name="returnOffsetDays"
                  type="number"
                  min="0"
                  defaultValue={settings.returnOffsetDays}
                />
              </div>
              <div className="field">
                <label htmlFor="conflictWindowDays">Double-booking warning window</label>
                <input
                  id="conflictWindowDays"
                  name="conflictWindowDays"
                  type="number"
                  min="0"
                  defaultValue={settings.conflictWindowDays}
                />
                <span className="hint">Extra days of padding around each booking</span>
              </div>
            </div>
          </div>

          <div className="card card-pad stack">
            <h2>Appearance</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="brandPrimary">Primary color</label>
                <input
                  id="brandPrimary"
                  name="brandPrimary"
                  type="text"
                  defaultValue={settings.brandPrimary}
                />
                <span className="hint">Hex value. Light brown by default.</span>
              </div>
            </div>
          </div>

          <div className="row">
            <button type="submit" className="btn primary">
              Save settings
            </button>
          </div>
        </form>

        <div className="card card-pad stack">
          <h2>Your login</h2>
          <p className="tiny muted" style={{ margin: 0 }}>
            Signed in as {user.name} ({user.email}). Changing your password signs out every other
            device.
          </p>
          <form action={changePasswordAction} className="stack">
            <div className="field-row">
              <div className="field">
                <label htmlFor="password">New password</label>
                <input id="password" name="password" type="password" autoComplete="new-password" />
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirm</label>
                <input id="confirm" name="confirm" type="password" autoComplete="new-password" />
              </div>
            </div>
            <div className="row">
              <button type="submit" className="btn">
                Change password
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
